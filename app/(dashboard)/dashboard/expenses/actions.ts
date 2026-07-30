"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

function getRequiredText(
  formData: FormData,
  fieldName: string,
): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  const cleanedValue = value.trim();

  if (!cleanedValue) {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  return cleanedValue;
}

export async function createExpense(
  formData: FormData,
): Promise<void> {
  const business =
    await requirePermission(
      "expenses.manage",
    );

  const category = getRequiredText(
    formData,
    "category",
  );

  const description = getRequiredText(
    formData,
    "description",
  );

  const expenseDate = getRequiredText(
    formData,
    "expenseDate",
  );

  const amountValue =
    formData.get("amount");

  const amount = Number(amountValue);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Expense amount must be greater than zero.",
    );
  }

  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("expenses")
    .insert({
      business_id: business.id,
      owner_id: user.id,
      category,
      description,
      amount,
      expense_date: expenseDate,
    });

  if (error) {
    throw new Error(
      `Unable to save expense: ${error.message}`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");

  redirect("/dashboard/expenses");
}

export async function deleteExpense(
  formData: FormData,
): Promise<void> {
  const business =
    await requirePermission(
      "expenses.manage",
    );

  const expenseIdValue =
    formData.get("expenseId");

  const expenseId =
    typeof expenseIdValue === "string"
      ? expenseIdValue.trim()
      : "";

  if (!expenseId) {
    throw new Error(
      "Invalid expense ID.",
    );
  }

  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("business_id", business.id);

  if (error) {
    throw new Error(
      `Unable to delete expense: ${error.message}`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");

  redirect("/dashboard/expenses");
}
