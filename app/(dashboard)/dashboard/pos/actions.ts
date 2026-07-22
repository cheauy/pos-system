"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CheckoutItem = {
  productId: string;
  quantity: number;
};

type CheckoutInput = {
  items: CheckoutItem[];
  paymentMethod: "cash" | "card" | "bank_transfer" | "other";
  amountPaid: number;
  customerId: string | null;
};

type CheckoutResult =
  | {
      success: true;
      orderId: string;
    }
  | {
      success: false;
      message: string;
    };

export async function checkoutOrder(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return {
      success: false,
      message: "Your cart is empty.",
    };
  }

  const validItems = input.items.every(
    (item) =>
      typeof item.productId === "string" &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0,
  );

  if (!validItems) {
    return {
      success: false,
      message: "The cart contains invalid products or quantities.",
    };
  }

  if (
    !["cash", "card", "bank_transfer", "other"].includes(
      input.paymentMethod,
    )
  ) {
    return {
      success: false,
      message: "Invalid payment method.",
    };
  }

  if (
    !Number.isFinite(input.amountPaid) ||
    input.amountPaid < 0
  ) {
    return {
      success: false,
      message: "Invalid payment amount.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "Your login session has expired.",
    };
  }

  const { data, error } = await supabase.rpc(
  "checkout_order",
  {
    p_items: input.items,
    p_payment_method: input.paymentMethod,
    p_amount_paid: input.amountPaid,
    p_customer_id: input.customerId,
  },
);

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/products");

  return {
    success: true,
    orderId: data as string,
  };
}