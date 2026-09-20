import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { loadReceiptContext } from "@/lib/receipts/load-receipt-context";
import { loadShippingSettings } from "@/lib/receipts/shipping-design-store";
import PrintButton from "@/components/print-button";
import { ShippingLabel, ShippingPrintStyles } from "../../../shipping-labels/shipping-labels-client";
import { loadDetailedOrder } from "../order-detail-data";

export default async function OrderShippingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const business = await requirePermission("orders.view");
  const { id } = await params;
  const order = await loadDetailedOrder(business.id, id);
  if (!order) notFound();
  const db = await createClient();
  const [context, saved, custom] = await Promise.all([
    loadReceiptContext(business.id, business.name),
    db.from("business_receipt_settings").select("shipping_label_size,shipping_show_sender,shipping_show_phone,shipping_show_order_number,shipping_show_cod,shipping_show_item_count,shipping_show_barcode").eq("business_id", business.id).maybeSingle(),
    loadShippingSettings(business.id),
  ]);
  if (saved.error) throw new Error("Printer settings could not be loaded. Please retry.");
  const settings = { ...saved.data, ...custom };
  const size = ["80x50", "100x100", "100x150"].includes(settings.shipping_label_size ?? "") ? settings.shipping_label_size! : "100x150";
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  const hasAddress = !!(order.guest_address || customer?.address)?.trim();
  return <main className="mx-auto max-w-2xl rounded-xl bg-white p-6 text-black">
    <nav className="no-print flex flex-wrap items-center justify-between gap-3"><Link href={`/dashboard/orders/${encodeURIComponent(id)}`}>Back to order</Link><PrintButton label="Print Shipping label" selector="#shipping-label-print-area" disabled={!hasAddress}/></nav>
    <div className="no-print my-5 text-sm text-slate-600"><h1 className="font-bold text-black">Shipping label · {order.order_number}</h1><p>{size.replace("x", " × ")} mm. Select your installed printer, matching paper size, 100% scale, and turn off headers and footers in the print dialog.</p><Link className="underline" href="/dashboard/settings/printers">Printer Settings</Link>{!hasAddress && <p role="alert" className="mt-3 text-red-700">Add the customer&apos;s delivery address to the order before printing a shipping label.</p>}</div>
    <div id="shipping-label-print-area"><ShippingLabel order={{...order, payment_method: order.payment_method || "", order_items: order.order_items || []}} businessName={context.store.name} businessPhone={context.store.phone} businessAddress={context.store.address} size={size} settings={settings}/></div>
    <ShippingPrintStyles size={size}/>
  </main>;
}
