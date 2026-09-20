"use server";
import { randomUUID } from "node:crypto";
import { uploadExpenseReceipt, removeExpenseReceipt } from "@/lib/expenses/receipts";
import { CATEGORIES } from "./expense-model";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { createAuditLog } from "@/lib/audit/create-audit-log";

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

  if (!CATEGORIES.includes(category)) throw new Error("Choose a valid expense category.");

  const description = getRequiredText(
    formData,
    "description",
  );

  const expenseDate = getRequiredText(
    formData,
    "expenseDate",
  );

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || Number.isNaN(Date.parse(expenseDate)) || new Date(expenseDate).toISOString().slice(0,10) !== expenseDate) throw new Error("Choose a valid expense date.");

  const amountValue =
    formData.get("amount");

  const amount = Number(amountValue);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 || amount > 999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001
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

  const expenseBranch = getRequiredText(formData, "locationId");
  await assertBranchOperation(business.id, expenseBranch);
  const expenseId = randomUUID();
  const file = formData.get("receipt");
  const hasReceipt = file instanceof File && file.size > 0;
  if (hasReceipt) await uploadExpenseReceipt(business.id, expenseId, file);
  const { error } = await supabase
    .from("expenses")
    .insert({
      id: expenseId,
      business_id: business.id,
      owner_id: user.id,
      category,
      description,
      amount,
      expense_date: expenseDate,
      location_id: (() => {
        const value = formData.get("locationId");
        return typeof value === "string" && value.trim() ? value.trim() : null;
      })(),
      payee: (() => {
        const value = formData.get("payee");
        return typeof value === "string" && value.trim() ? value.trim() : null;
      })(),
      payment_method: (() => {
        const value = formData.get("paymentMethod");
        return typeof value === "string" && value.trim() ? value.trim() : null;
      })(),
      reference: (() => {
        const value = formData.get("reference");
        return typeof value === "string" && value.trim() ? value.trim() : null;
      })(),
    });

  if (error) {
    if (hasReceipt) await removeExpenseReceipt(business.id, expenseId);
    throw new Error(
      `Unable to save expense: ${error.message}`,
    );
  }

  await createAuditLog({
    action: "create",
    entityType: "expense",
    description: `Recorded expense: ${description}`,
    metadata: { category, amount, expense_date: expenseDate },
  }).catch(() => console.error("Expense saved but audit log failed", expenseId));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");


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

  await removeExpenseReceipt(business.id, expenseId);
  await createAuditLog({
    action: "delete",
    entityType: "expense",
    entityId: expenseId,
    description: "Deleted expense",
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");


}
