"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

export async function createCategory(formData: FormData) {
  const business = await requirePermission(
    "categories.manage",
  );
  const name = formData.get("name");
  const description = formData.get("description");

  if (
    typeof name !== "string" ||
    name.trim().length < 2
  ) {
    throw new Error(
      "Category name must contain at least 2 characters.",
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("categories")
    .insert({
      business_id: business.id,
      owner_id: user.id,
      name: name.trim(),
      description:
        typeof description === "string" &&
        description.trim()
          ? description.trim()
          : null,
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/categories");
}
export async function deleteCategory(formData: FormData) {
  const business = await requirePermission(
    "categories.manage",
  );
  const categoryId = formData.get("categoryId");

  if (typeof categoryId !== "string") {
    throw new Error("Invalid category ID.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq( "business_id" ,business.id,)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/categories");
}

export async function toggleCategoryOnline(
  formData: FormData,
) {
  const business = await requirePermission(
    "categories.manage",
  );

  const categoryId = formData.get("categoryId");

  if (
    typeof categoryId !== "string" ||
    !categoryId
  ) {
    throw new Error("Invalid category ID.");
  }

  const supabase = await createClient();

  const {
    data: category,
    error: categoryError,
  } = await supabase
    .from("categories")
    .select("id, name, is_online")
    .eq("id", categoryId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (categoryError || !category) {
    throw new Error(
      categoryError?.message ??
        "Category was not found.",
    );
  }

  const { error } = await supabase
    .from("categories")
    .update({
      is_online: !Boolean(category.is_online),
    })
    .eq("id", categoryId)
    .eq("business_id", business.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/categories");
  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);
}
