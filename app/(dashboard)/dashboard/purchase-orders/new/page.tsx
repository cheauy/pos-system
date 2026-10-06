import { requirePermission } from "@/lib/auth/require-permission";
import { getPurchaseOrderChoices } from "../actions";

import PurchaseOrderForm from "./purchase-order-form";

export default async function NewPurchaseOrderPage() {
  // Outside the try so its redirect is not swallowed; the repeat check inside is request-memoized.
  await requirePermission("purchases.create");
  let choices: Awaited<ReturnType<typeof getPurchaseOrderChoices>>;
  try {
    choices = await getPurchaseOrderChoices();
  } catch (error) {
    console.error("Purchase order catalog failed", error);
    return <main role="alert" className="rounded-xl border border-red-200 p-6">Unable to load purchase order products or suppliers. Refresh to try again.</main>;
  }

  return (
    <main>
      {!choices.products.length && <p role="status" className="mb-4 rounded-xl border border-amber-200 p-4">No active products in this branch. Add or assign products in Products before creating a purchase order.</p>}
      <PurchaseOrderForm
        suppliers={choices.suppliers}
        products={choices.products}
      />
    </main>
  );
}
