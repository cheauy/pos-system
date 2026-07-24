"use server";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type CheckoutItem = {
  productId: string;
  quantity: number;
};

type PaymentMethod =
  | "cod"
  | "deposit"
  | "bank_transfer"
  | "other";

type CheckoutInput = {
  items: CheckoutItem[];
  paymentMethod: PaymentMethod;
  amountPaid: number;
  discount: number;
  deliveryFee: number;
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

const allowedPaymentMethods: PaymentMethod[] = [
  "cod",
  "deposit",
  "bank_transfer",
  "other",
];

export async function checkoutOrder(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  // Validate cart
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0
  ) {
    return {
      success: false,
      message: "Your cart is empty.",
    };
  }

  const validItems = input.items.every(
    (item) =>
      typeof item.productId === "string" &&
      item.productId.trim().length > 0 &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0,
  );

  if (!validItems) {
    return {
      success: false,
      message:
        "The cart contains invalid products or quantities.",
    };
  }

  // Validate payment method only once
  if (
    !allowedPaymentMethods.includes(
      input.paymentMethod,
    )
  ) {
    return {
      success: false,
      message: "Invalid payment method.",
    };
  }

  // Validate amount paid
  const amountPaid = Number(input.amountPaid);

  if (
    !Number.isFinite(amountPaid) ||
    amountPaid < 0
  ) {
    return {
      success: false,
      message: "Invalid payment amount.",
    };
  }

  // Validate discount and delivery
  const discount = Number(input.discount ?? 0);
  const deliveryFee = Number(
    input.deliveryFee ?? 0,
  );

  if (
    !Number.isFinite(discount) ||
    !Number.isFinite(deliveryFee)
  ) {
    return {
      success: false,
      message:
        "Discount and delivery fee must be valid numbers.",
    };
  }

  if (discount < 0 || deliveryFee < 0) {
    return {
      success: false,
      message:
        "Discount and delivery fee cannot be negative.",
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
    p_amount_paid: amountPaid,
    p_customer_id: input.customerId,
    p_discount: discount,
    p_delivery_fee: deliveryFee,
  },
);

  if (error) {
    console.error("checkout_order RPC error:", error);

    return {
      success: false,
      message: error.message,
    };
  }

  const orderId =
    typeof data === "string"
      ? data
      : data?.order_id ?? data?.id;

  if (
    typeof orderId !== "string" ||
    !orderId
  ) {
    return {
      success: false,
      message:
        "The order was created, but no order ID was returned.",
    };
  }

  await createAuditLog({
    action: "create",
    entityType: "order",
    entityId: orderId,
    description: "Created order",
    metadata: {
      payment_method: input.paymentMethod,
      amount_paid: amountPaid,
      discount,
      delivery_fee: deliveryFee,
      items: input.items,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);

  return {
    success: true,
    orderId,
  };
}