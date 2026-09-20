"use server";
import { requirePermission } from "@/lib/auth/require-permission";
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

// Old clients must refresh instead of using the former multi-step checkout,
// which could commit a sale before branch allocation or register assignment.
export async function checkoutOrder(_input: CheckoutInput): Promise<CheckoutResult> {
  void _input;
  await requirePermission("pos.access");
  return {success:false,message:"Reload POS to use branch-safe checkout. No sale was created."};
}
