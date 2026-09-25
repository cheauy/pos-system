import { requirePermission } from "@/lib/auth/require-permission";
import { loadReceiptContext } from "@/lib/receipts/load-receipt-context";
import { createClient } from "@/lib/supabase/branch-server";
import { loadShippingSettings } from "@/lib/receipts/shipping-design-store";
import PrinterSettings from "./printer-settings";
import { getBranchContext } from "@/lib/branches/context";

export default async function PrinterSettingsPage() {
  const business = await requirePermission("business.update");
  const db = await createClient();
  const {branchId}=await getBranchContext();
  const [context, settings, shippingDesign] = await Promise.all([
    loadReceiptContext(business.id, business.name),
    db.from("branch_receipt_settings").select("*").eq("business_id", business.id).eq("location_id",branchId).maybeSingle(),
    loadShippingSettings(business.id),
  ]);
  if (settings.error) throw new Error("Unable to load printer settings. Please retry.");
  return <PrinterSettings businessId={business.id} context={context} settings={{...settings.data,...shippingDesign}} />;
}
