"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function getRequiredText(
  formData: FormData,
  fieldName: string,
) {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required.`);
  }

  const cleanedValue = value.trim();

  if (!cleanedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return cleanedValue;
}

export async function createExpense(
  formData: FormData,
) {
  const category = getRequiredText(
    formData,
    "category",
  );

  const description = getRequiredText(
    formData,
    "description",
  );

  const amountValue = formData.get("amount");
  const expenseDate = getRequiredText(
    formData,
    "expenseDate",
  );

  const amount = Number(amountValue);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      "Expense amount must be greater than zero.",
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
    .from("expenses")
    .insert({
      owner_id: user.id,
      category,
      description,
      amount,
      expense_date: expenseDate,
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
}

export async function deleteExpense(
  formData: FormData,
) {
  const expenseId = formData.get("expenseId");

  if (
    typeof expenseId !== "string" ||
    !expenseId
  ) {
    throw new Error("Invalid expense ID.");
  }

  const supabase = await createClient();

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
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
}