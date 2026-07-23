"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function getRequiredString(
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

export async function cancelOrder(
  formData: FormData,
) {
  const orderId = getRequiredString(
    formData,
    "orderId",
  );

  const reasonValue =
    formData.get("reason");

  const reason =
    typeof reasonValue === "string"
      ? reasonValue.trim()
      : "";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc(
    "cancel_order",
    {
      p_order_id: orderId,
      p_reason: reason || null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath(
    `/dashboard/orders/${orderId}`,
  );
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/reports");

  redirect(
    `/dashboard/orders/${orderId}?cancelled=true`,
  );
}