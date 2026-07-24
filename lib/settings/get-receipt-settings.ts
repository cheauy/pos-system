import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type ReceiptSettings = {
  receipt_header: string;
  receipt_footer: string;
  receipt_paper_size: "58mm" | "80mm" | "A4";

  show_business_phone: boolean;
  show_business_address: boolean;
  show_cashier_name: boolean;
  show_customer_name: boolean;
  show_tax_on_receipt: boolean;

  business_name: string;
  business_phone: string;
  business_address: string;
};

const defaultReceiptSettings: ReceiptSettings = {
  receipt_header: "",
  receipt_footer: "Thank you for your purchase!",
  receipt_paper_size: "80mm",

  show_business_phone: true,
  show_business_address: true,
  show_cashier_name: true,
  show_customer_name: true,
  show_tax_on_receipt: true,

  business_name: "My Business",
  business_phone: "",
  business_address: "",
};

type ReceiptSettingsRow = {
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_paper_size: string | null;

  show_business_phone: boolean | null;
  show_business_address: boolean | null;
  show_cashier_name: boolean | null;
  show_customer_name: boolean | null;
  show_tax_on_receipt: boolean | null;

  business_name: string | null;
  business_phone: string | null;
  business_address: string | null;
};

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select(
      [
        "receipt_header",
        "receipt_footer",
        "receipt_paper_size",
        "show_business_phone",
        "show_business_address",
        "show_cashier_name",
        "show_customer_name",
        "show_tax_on_receipt",
        "business_name",
        "business_phone",
        "business_address",
      ].join(","),
    )
    .limit(1)
    .maybeSingle()
    .overrideTypes<ReceiptSettingsRow>();

  if (error) {
    console.error(
      "Unable to load receipt settings:",
      error.message,
    );

    return defaultReceiptSettings;
  }

  if (!data) {
    return defaultReceiptSettings;
  }

  const paperSize: ReceiptSettings["receipt_paper_size"] =
    data.receipt_paper_size === "58mm" ||
    data.receipt_paper_size === "A4"
      ? data.receipt_paper_size
      : "80mm";

  return {
    receipt_header: data.receipt_header ?? "",
    receipt_footer:
      data.receipt_footer ??
      "Thank you for your purchase!",

    receipt_paper_size: paperSize,

    show_business_phone:
      data.show_business_phone ?? true,

    show_business_address:
      data.show_business_address ?? true,

    show_cashier_name:
      data.show_cashier_name ?? true,

    show_customer_name:
      data.show_customer_name ?? true,

    show_tax_on_receipt:
      data.show_tax_on_receipt ?? true,

    business_name:
      data.business_name || "My Business",

    business_phone:
      data.business_phone ?? "",

    business_address:
      data.business_address ?? "",
  };
}