import { requirePermission } from "@/lib/auth/require-permission";
import { loadReceiptContext } from "@/lib/receipts/load-receipt-context";
import { createClient } from "@/lib/supabase/server";
import { loadShippingSettings } from "@/lib/receipts/shipping-design-store";
import PrinterSettings from "./printer-settings";

export default async function PrinterSettingsPage() {
  const business = await requirePermission("business.update");
  const db = await createClient();
  const [context, settings, shippingDesign] = await Promise.all([
    loadReceiptContext(business.id, business.name),
    db.from("business_receipt_settings").select("*").eq("business_id", business.id).maybeSingle(),
    loadShippingSettings(business.id),
  ]);
  if (settings.error) throw new Error("Unable to load printer settings. Please retry.");
  return <PrinterSettings businessId={business.id} context={context} settings={{...settings.data,...shippingDesign}} />;
}
