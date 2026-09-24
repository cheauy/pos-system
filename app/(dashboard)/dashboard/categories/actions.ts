"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

export type CategoryActionResult = {
  ok: boolean;
  message: string;
  imported?: number;
  skipped?: number;
};

export type CategoryImportRow = {
  name: string;
  description?: string | null;
  isOnline?: boolean;
  index?: number;
  sortOrder?: number;
};

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_SORT_ORDER = 9999;
const MAX_IMPORT_ROWS = 500;

function revalidateCategoryViews(businessSlug: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/categories");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${businessSlug}`);
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDescription(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_DESCRIPTION_LENGTH) : null;
}

function normalizeIndex(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_SORT_ORDER, Math.trunc(parsed)));
}

function validateCategoryName(name: string): string | null {
  if (name.length < 2) {
    return "Category name must contain at least 2 characters.";
  }
  if (name.length > MAX_NAME_LENGTH) {
    return `Category name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

async function getAuthenticatedContext() {
  const business = await requirePermission("categories.manage");
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  return { business, supabase, user };
}

async function displayBranches(formData: FormData, businessId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  if (formData.get("branchMode") !== "selected") return null;
  const ids = [...new Set(formData.getAll("branchIds").map(String))];
  if (!ids.length || ids.length > 100 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Choose at least one valid branch.");
  const { data, error } = await supabase.from("business_locations").select("id").eq("business_id", businessId).eq("is_active", true).eq("plan_disable_pending", false).in("id", ids);
  if (error || data?.length !== ids.length) throw new Error("Choose active branches in this business.");
  return ids;
}

async function categoryNameExists(
  businessId: string,
  name: string,
  excludeId?: string,
) {
  const supabase = await createClient();
  let query = supabase
    .from("categories")
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", name)
    .limit(1);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

type CategoryIndexRow = {
  id: string;
  online_sort_order: number | null;
  created_at: string;
};

function categoryPosition(row: CategoryIndexRow) {
  const parsed = Number(row.online_sort_order);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : MAX_SORT_ORDER + 1;
}

function sortCategoryIndexRows(rows: CategoryIndexRow[]) {
  return [...rows].sort((a, b) => {
    const byIndex = categoryPosition(a) - categoryPosition(b);
    if (byIndex !== 0) return byIndex;

    // When legacy duplicate indexes already exist, the newest row keeps the
    // requested slot and the older row is pushed down to the next position.
    const byCreated = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (Number.isFinite(byCreated) && byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

async function loadCategoryIndexRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, online_sort_order, created_at")
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  return sortCategoryIndexRows((data ?? []) as CategoryIndexRow[]);
}

async function writeCategoryIndexes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  orderedIds: string[],
) {
  for (let position = 0; position < orderedIds.length; position += 1) {
    const { error } = await supabase
      .from("categories")
      .update({ online_sort_order: position + 1 })
      .eq("id", orderedIds[position])
      .eq("business_id", businessId);

    if (error) throw new Error(error.message);
  }
}

function clampPosition(value: number, max: number) {
  return Math.max(1, Math.min(Math.max(1, max), Math.trunc(value || 1)));
}

export async function repairCategoryIndexes(): Promise<CategoryActionResult> {
  const { business, supabase } = await getAuthenticatedContext();

  try {
    const rows = await loadCategoryIndexRows(supabase, business.id);
    await writeCategoryIndexes(
      supabase,
      business.id,
      rows.map((row) => row.id),
    );
    revalidateCategoryViews(business.slug);
    return { ok: true, message: "Category indexes repaired." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to repair category indexes.",
    };
  }
}

export async function createCategory(
  formData: FormData,
): Promise<CategoryActionResult> {
  const { business, supabase, user } = await getAuthenticatedContext();
  const name = normalizeName(formData.get("name"));
  const description = normalizeDescription(formData.get("description"));
  const isOnline = formData.get("isOnline") === "on";
  const requestedIndex = normalizeIndex(formData.get("index") ?? formData.get("sortOrder"));

  const validationError = validateCategoryName(name);
  if (validationError) return { ok: false, message: validationError };

  if (await categoryNameExists(business.id, name)) {
    return {
      ok: false,
      message: "A category with this name already exists.",
    };
  }

  try {
    // First normalize any legacy duplicate indexes. Then insert the new category
    // into its requested position and push every older category below it by +1.
    const branchIds = await displayBranches(formData, business.id, supabase);
    const existingRows = await loadCategoryIndexRows(supabase, business.id);
    const insertAt = clampPosition(requestedIndex, existingRows.length + 1);

    await writeCategoryIndexes(
      supabase,
      business.id,
      existingRows.map((row) => row.id),
    );

    for (let position = existingRows.length; position >= insertAt; position -= 1) {
      const row = existingRows[position - 1];
      const { error: shiftError } = await supabase
        .from("categories")
        .update({ online_sort_order: position + 1 })
        .eq("id", row.id)
        .eq("business_id", business.id);

      if (shiftError) throw new Error(shiftError.message);
    }

    const { error } = await supabase.from("categories").insert({
      business_id: business.id,
      owner_id: user.id,
      name,
      description,
      is_online: isOnline,
      online_sort_order: insertAt,
      branch_ids: branchIds,
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to create category.",
    };
  }

  revalidateCategoryViews(business.slug);
  return { ok: true, message: "Category created successfully." };
}

export async function updateCategory(
  formData: FormData,
): Promise<CategoryActionResult> {
  const { business, supabase } = await getAuthenticatedContext();
  const categoryId = normalizeName(formData.get("categoryId"));
  const name = normalizeName(formData.get("name"));
  const description = normalizeDescription(formData.get("description"));
  const isOnline = formData.get("isOnline") === "on";
  const requestedIndex = normalizeIndex(formData.get("index") ?? formData.get("sortOrder"));

  if (!categoryId) return { ok: false, message: "Invalid category ID." };

  const validationError = validateCategoryName(name);
  if (validationError) return { ok: false, message: validationError };

  if (await categoryNameExists(business.id, name, categoryId)) {
    return {
      ok: false,
      message: "A category with this name already exists.",
    };
  }

  try {
    const branchIds = await displayBranches(formData, business.id, supabase);
    const rows = await loadCategoryIndexRows(supabase, business.id);
    const target = rows.find((row) => row.id === categoryId);
    if (!target) return { ok: false, message: "Category was not found." };

    // Remove the edited category from the current order, insert it into the
    // requested position, then renumber the full list to 1..N. This guarantees
    // one unique index per category and pushes the older occupant down by +1.
    const otherIds = rows.filter((row) => row.id !== categoryId).map((row) => row.id);
    const insertAt = clampPosition(requestedIndex, otherIds.length + 1);
    const orderedIds = [...otherIds];
    orderedIds.splice(insertAt - 1, 0, categoryId);

    await writeCategoryIndexes(supabase, business.id, orderedIds);

    const { error } = await supabase
      .from("categories")
      .update({
        name,
        description,
        is_online: isOnline,
        online_sort_order: insertAt,
        branch_ids: branchIds,
      })
      .eq("id", categoryId)
      .eq("business_id", business.id);

    if (error) throw new Error(error.message);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to update category.",
    };
  }

  revalidateCategoryViews(business.slug);
  return { ok: true, message: "Category updated successfully." };
}

export async function setCategoryOnline(
  categoryId: string,
  isOnline: boolean,
): Promise<CategoryActionResult> {
  const { business, supabase } = await getAuthenticatedContext();

  if (!categoryId) return { ok: false, message: "Invalid category ID." };

  const { error } = await supabase
    .from("categories")
    .update({ is_online: Boolean(isOnline) })
    .eq("id", categoryId)
    .eq("business_id", business.id);

  if (error) return { ok: false, message: error.message };

  revalidateCategoryViews(business.slug);
  return {
    ok: true,
    message: isOnline ? "Category is now visible online." : "Category hidden from the online store.",
  };
}

export async function deleteCategoryById(
  categoryId: string,
): Promise<CategoryActionResult> {
  const { business, supabase } = await getAuthenticatedContext();

  if (!categoryId) return { ok: false, message: "Invalid category ID." };

  const { error: productError } = await supabase
    .from("products")
    .update({ category_id: null })
    .eq("business_id", business.id)
    .eq("category_id", categoryId);

  if (productError) return { ok: false, message: productError.message };

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("business_id", business.id);

  if (error) return { ok: false, message: error.message };

  revalidateCategoryViews(business.slug);
  return {
    ok: true,
    message: "Category deleted. Products were kept and moved to uncategorized.",
  };
}

export async function bulkCategoryAction(
  categoryIds: string[],
  action: "show" | "hide" | "delete",
): Promise<CategoryActionResult> {
  const { business, supabase } = await getAuthenticatedContext();
  const ids = Array.from(
    new Set(categoryIds.filter((id) => typeof id === "string" && id.trim())),
  ).slice(0, 100);

  if (!ids.length) {
    return { ok: false, message: "Select at least one category." };
  }

  if (action === "delete") {
    const { error: productError } = await supabase
      .from("products")
      .update({ category_id: null })
      .eq("business_id", business.id)
      .in("category_id", ids);

    if (productError) return { ok: false, message: productError.message };

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("business_id", business.id)
      .in("id", ids);

    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase
      .from("categories")
      .update({ is_online: action === "show" })
      .eq("business_id", business.id)
      .in("id", ids);

    if (error) return { ok: false, message: error.message };
  }

  revalidateCategoryViews(business.slug);
  return {
    ok: true,
    message:
      action === "delete"
        ? `${ids.length} categories deleted.`
        : action === "show"
          ? `${ids.length} categories are now visible online.`
          : `${ids.length} categories hidden from the online store.`,
  };
}

export async function importCategories(
  rows: CategoryImportRow[],
): Promise<CategoryActionResult> {
  const { business, supabase, user } = await getAuthenticatedContext();

  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, message: "The CSV does not contain any categories." };
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `Import up to ${MAX_IMPORT_ROWS} categories at a time.`,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("categories")
    .select("name")
    .eq("business_id", business.id);

  if (existingError) return { ok: false, message: existingError.message };

  const knownNames = new Set(
    (existing ?? []).map((item) => String(item.name).trim().toLowerCase()),
  );
  const inserts: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (const row of rows) {
    const name = normalizeName(row?.name);
    const validationError = validateCategoryName(name);
    const key = name.toLowerCase();

    if (validationError || knownNames.has(key)) {
      skipped += 1;
      continue;
    }

    knownNames.add(key);
    inserts.push({
      business_id: business.id,
      owner_id: user.id,
      name,
      description: normalizeDescription(row.description),
      is_online: row.isOnline !== false,
      online_sort_order: normalizeIndex(row.index ?? row.sortOrder),
    });
  }

  if (!inserts.length) {
    return {
      ok: false,
      message: "No new categories were imported. Duplicate or invalid rows were skipped.",
      imported: 0,
      skipped,
    };
  }

  const { error } = await supabase.from("categories").insert(inserts);
  if (error) return { ok: false, message: error.message };

  revalidateCategoryViews(business.slug);
  return {
    ok: true,
    message: `${inserts.length} categories imported${skipped ? `, ${skipped} skipped` : ""}.`,
    imported: inserts.length,
    skipped,
  };
}

// Backward-compatible actions for any older forms still referencing these names.
export async function deleteCategory(formData: FormData) {
  const categoryId = normalizeName(formData.get("categoryId"));
  return deleteCategoryById(categoryId);
}

export async function toggleCategoryOnline(formData: FormData) {
  const { business, supabase } = await getAuthenticatedContext();
  const categoryId = normalizeName(formData.get("categoryId"));

  if (!categoryId) return { ok: false, message: "Invalid category ID." };

  const { data, error } = await supabase
    .from("categories")
    .select("is_online")
    .eq("id", categoryId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Category was not found." };
  }

  return setCategoryOnline(categoryId, !Boolean(data.is_online));
}

export async function applyCategoryBranches(categoryId: string, branchIds: string[] | null): Promise<CategoryActionResult> {
  try {
    const {business,supabase}=await getAuthenticatedContext();
    if(branchIds!==null && (!Array.isArray(branchIds) || branchIds.length===0 || branchIds.length>100 || branchIds.some(id=>typeof id!=="string"))) throw new Error("Invalid branch selection.");
    if(branchIds?.length){
      const branches=await supabase.from("business_locations").select("id").eq("business_id",business.id).eq("is_active",true).in("id",branchIds);
      if(branches.error || branches.data.length!==new Set(branchIds).size) throw new Error("Choose active branches in this business.");
    }
    const result=await supabase.from("categories").update({branch_ids:branchIds===null?null:[...new Set(branchIds)]}).eq("id",categoryId).eq("business_id",business.id).select("id").single();
    if(result.error) throw new Error(result.error.message);
    revalidateCategoryViews(business.slug);
    return {ok:true,message:"Category branches saved."};
  } catch(error) {return {ok:false,message:error instanceof Error?error.message:"Unable to save category branches."};}
}
