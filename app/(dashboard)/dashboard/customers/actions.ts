"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
function optionalText(
  formData: FormData,
  field: string,
): string | null {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue || null;
}

export async function createCustomer(formData: FormData) {
  const name = formData.get("name");
  const business = await requirePermission(
    "customers.create",
  );
  if (
    typeof name !== "string" ||
    name.trim().length < 2
  ) {
    throw new Error(
      "Customer name must contain at least 2 characters.",
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("customers")
    .insert({
      owner_id: user.id,
      business_id: business.id,
      name: name.trim(),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      address: optionalText(formData, "address"),
      note: optionalText(formData, "note"),
    }).eq("business_id", business.id);

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "create",
    entityType: "customer",
    entityId: user.id,
    description: `Insert customer`,
   
  });

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/pos");
}

export async function deleteCustomer(formData: FormData) {
  const customerId = formData.get("customerId");
  const business = await requirePermission(
    "customers.update",
  );
  if (
    typeof customerId !== "string" ||
    !customerId
  ) {
    throw new Error("Invalid customer ID.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("business_id", business.id)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "delete",
    entityType: "customer",
    entityId: user.id,
    description: `Delete customer`,
   
  });

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/pos");
}
export async function updateCustomer(
  formData: FormData,
) {
  const customerId = formData.get("customerId");
  const name = formData.get("name");
  const business = await requirePermission(
    "customers.update",
  );

  if (
    typeof customerId !== "string" ||
    customerId.length === 0
  ) {
    throw new Error("Invalid customer ID.");
  }

  if (
    typeof name !== "string" ||
    name.trim().length < 2
  ) {
    throw new Error(
      "Customer name must contain at least 2 characters.",
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("customers")
    .update({
      name: name.trim(),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      address: optionalText(
        formData,
        "address",
      ),
      note: optionalText(formData, "note"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("business_id", business.id)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }
 await createAuditLog({
    action: "update",
    entityType: "customer",
    entityId: user.id,
    description: `Update customer`,
   
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(
    `/dashboard/customers/${customerId}`,
  );
  revalidatePath("/dashboard/pos");

  redirect(
    `/dashboard/customers/${customerId}`,
  );
}


export async function adjustCustomerLoyalty(formData: FormData) {
  const business = await requirePermission("customers.update");
  const customerId = formData.get("customerId");
  const pointsValue = formData.get("points");
  const noteValue = formData.get("note");

  if (typeof customerId !== "string" || !customerId) {
    throw new Error("Invalid customer ID.");
  }

  const points = Number(pointsValue);
  if (
    !Number.isInteger(points) ||
    points === 0 ||
    Math.abs(points) > 1000000
  ) {
    throw new Error("Points must be a non-zero whole number.");
  }

  const note =
    typeof noteValue === "string" && noteValue.trim()
      ? noteValue.trim().slice(0, 300)
      : "Manual loyalty adjustment";

  const { data, error } = await supabaseAdmin.rpc(
    "adjust_customer_loyalty_points",
    {
      p_business_id: business.id,
      p_customer_id: customerId,
      p_points: points,
      p_note: note,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "update",
    entityType: "customer",
    entityId: customerId,
    description: `Adjusted customer loyalty by ${points} points`,
    metadata: {
      points,
      balance: data,
      note,
    },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
}
