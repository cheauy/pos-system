"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

function getRequiredText(
  formData: FormData,
  fieldName: string,
) {
  const value = formData.get(fieldName);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function getOptionalText(
  formData: FormData,
  fieldName: string,
) {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue || null;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return {
    supabase,
    user,
  };
}

export async function createSupplier(
  formData: FormData,
) {
  const name = getRequiredText(
    formData,
    "name",
  );
  const business = await requirePermission(
    "suppliers.manage",
  );

  const contactPerson = getRequiredText(
    formData,
    "contactPerson",
  );

  const phone = getRequiredText(
    formData,
    "phone",
  );

  const email = getOptionalText(
    formData,
    "email",
  );

  const address = getRequiredText(
    formData,
    "address",
  );

  const notes = getOptionalText(
    formData,
    "notes",
  );

  const { supabase, user } =
    await getAuthenticatedUser();

  const { error } = await supabase
    .from("suppliers")
    .insert({
      owner_id: user.id,
      name,
       business_id: business.id,
      contact_person: contactPerson,
      phone,
      email,
      address,
      notes,
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/suppliers");
}

export async function updateSupplier(
  formData: FormData,
) {
  const business = await requirePermission(
    "suppliers.manage",
  );
  const supplierId = getRequiredText(
    formData,
    "supplierId",
  );

  const name = getRequiredText(
    formData,
    "name",
  );

  const contactPerson = getRequiredText(
    formData,
    "contactPerson",
  );

  const phone = getRequiredText(
    formData,
    "phone",
  );

  const email = getOptionalText(
    formData,
    "email",
  );

  const address = getRequiredText(
    formData,
    "address",
  );

  const notes = getOptionalText(
    formData,
    "notes",
  );

  const { supabase, user } =
    await getAuthenticatedUser();

  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
       business_id: business.id,
      contact_person: contactPerson,
      phone,
      email,
      address,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId)
    .eq("business_id", business.id)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/suppliers");
  revalidatePath(
    `/dashboard/suppliers/${supplierId}/edit`,
  );

  redirect("/dashboard/suppliers");
}

export async function toggleSupplierStatus(
  formData: FormData,
) {
  const business = await requirePermission(
    "suppliers.manage",
  );
  const supplierId = getRequiredText(
    formData,
    "supplierId",
  );

  const currentStatus =
    formData.get("currentStatus") === "true";

  const { supabase, user } =
    await getAuthenticatedUser();

  const { error } = await supabase
    .from("suppliers")
    .update({
       business_id: business.id,
      is_active: !currentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId)
    .eq("business_id", business.id)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/suppliers");
}

export async function deleteSupplier(
  formData: FormData,
) {
  const business = await requirePermission(
    "suppliers.manage",
  );
  const supplierId = getRequiredText(
    formData,
    "supplierId",
  );

  const { supabase, user } =
    await getAuthenticatedUser();

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("business_id", business.id)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/suppliers");
}
