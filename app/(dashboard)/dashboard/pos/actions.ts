"use server";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type CheckoutItem = {
  productId: string;
  quantity: number;
  optionIds?: string[];
};

type PaymentMethod =
  | "cod"
  | "deposit"
  | "bank_transfer"
  | "other"
  | "credit";

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
  "credit",
];

export async function checkoutOrder(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const business = await requirePermission("pos.access");

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
      item.quantity > 0 &&
      (item.optionIds === undefined ||
        (Array.isArray(item.optionIds) &&
          item.optionIds.every(
            (optionId) =>
              typeof optionId === "string" &&
              optionId.trim().length > 0,
          ))),
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

  if (input.paymentMethod === "credit" && !input.customerId) {
    return {
      success: false,
      message: "Choose a customer before using customer credit.",
    };
  }

  // Validate amount paid
  const amountPaid = input.paymentMethod === "credit"
    ? 0
    : Number(input.amountPaid);

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
    "checkout_order_with_options",
    {
      p_business_id: business.id,
      p_items: input.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        optionIds: item.optionIds ?? [],
      })),
      p_payment_method:
        input.paymentMethod === "credit"
          ? "cod"
          : input.paymentMethod,
      p_amount_paid: amountPaid,
      p_customer_id: input.customerId,
      p_discount: discount,
      p_delivery_fee: deliveryFee,
    },
  );

  if (error) {
    console.error("checkout_order_with_options RPC error:", error);

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

  if (input.paymentMethod === "credit") {
    const { data: createdOrder, error: createdOrderError } = await supabase
      .from("orders")
      .select("id, total, customer_id")
      .eq("id", orderId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (createdOrderError || !createdOrder?.customer_id) {
      await supabase.rpc("cancel_order", {
        p_order_id: orderId,
        p_reason: "Customer credit setup failed",
      });
      return {
        success: false,
        message: createdOrderError?.message ?? "Unable to create customer credit sale.",
      };
    }

    const creditAmount = Number(createdOrder.total);
    const { error: creditError } = await supabase.rpc(
      "post_customer_credit",
      {
        p_business_id: business.id,
        p_customer_id: createdOrder.customer_id,
        p_type: "charge",
        p_amount: creditAmount,
        p_note: "POS credit sale",
        p_reference: orderId,
        p_order_id: orderId,
      },
    );

    if (creditError) {
      await supabase.rpc("cancel_order", {
        p_order_id: orderId,
        p_reason: `Customer credit failed: ${creditError.message}`,
      });
      return { success: false, message: creditError.message };
    }

    await supabase
      .from("orders")
      .update({
        payment_method: "credit",
        payment_status: "unpaid",
        amount_paid: 0,
        remaining_balance: creditAmount,
        credit_amount: creditAmount,
      })
      .eq("id", orderId)
      .eq("business_id", business.id);
  }

  // Attach the order to the cashier's open register branch (or the default
  // branch) and mirror the global stock deduction into branch inventory.
  const { data: openShift } = await supabase
    .from("cash_register_shifts")
    .select("id, location_id")
    .eq("business_id", business.id)
    .eq("opened_by", user.id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let locationId = openShift?.location_id ?? null;

  if (!locationId) {
    const { data: defaultLocation } = await supabase
      .from("business_locations")
      .select("id")
      .eq("business_id", business.id)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();

    locationId = defaultLocation?.id ?? null;
  }

  if (locationId) {
    const { error: locationError } = await supabase.rpc(
      "assign_pos_order_to_location",
      {
        p_business_id: business.id,
        p_order_id: orderId,
        p_location_id: locationId,
        p_shift_id: openShift?.id ?? null,
      },
    );

    if (locationError) {
      console.error("Unable to attach POS order to branch:", locationError);
    }
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
