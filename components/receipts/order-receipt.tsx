import type { ReceiptSettings } from "@/lib/settings/get-receipt-settings";

type ReceiptItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type ReceiptOrder = {
  order_number: string;
  created_at: string;

  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  paid_amount?: number | null;
  change_amount?: number | null;

  cashier_name?: string | null;
  customer_name?: string | null;

  items: ReceiptItem[];
};

type OrderReceiptProps = {
  order: ReceiptOrder;
  settings: ReceiptSettings;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function OrderReceipt({
  order,
  settings,
}: OrderReceiptProps) {
  const receiptWidth =
    settings.receipt_paper_size === "58mm"
      ? "w-[58mm]"
      : settings.receipt_paper_size === "A4"
        ? "w-[210mm]"
        : "w-[80mm]";

  return (
    <article
      id="printable-receipt"
      className={`${receiptWidth} mx-auto bg-white p-3 text-black`}
    >
      <header className="space-y-1 text-center">
        <h1 className="text-lg font-bold">
          {settings.business_name}
        </h1>

        {settings.receipt_header && (
          <p className="whitespace-pre-line text-xs">
            {settings.receipt_header}
          </p>
        )}

        {settings.show_business_phone &&
          settings.business_phone && (
            <p className="text-xs">
              Phone: {settings.business_phone}
            </p>
          )}

        {settings.show_business_address &&
          settings.business_address && (
            <p className="whitespace-pre-line text-xs">
              {settings.business_address}
            </p>
          )}
      </header>

      <div className="my-3 border-t border-dashed border-black" />

      <section className="space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <span>Order</span>
          <span className="font-medium">
            {order.order_number}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span>Date</span>
          <span>{formatReceiptDate(order.created_at)}</span>
        </div>

        {settings.show_cashier_name &&
          order.cashier_name && (
            <div className="flex justify-between gap-3">
              <span>Cashier</span>
              <span>{order.cashier_name}</span>
            </div>
          )}

        {settings.show_customer_name &&
          order.customer_name && (
            <div className="flex justify-between gap-3">
              <span>Customer</span>
              <span>{order.customer_name}</span>
            </div>
          )}
      </section>

      <div className="my-3 border-t border-dashed border-black" />

      <section className="space-y-3">
        {order.items.map((item) => (
          <div key={item.id} className="text-xs">
            <p className="font-medium">
              {item.product_name}
            </p>

            <div className="flex justify-between gap-3">
              <span>
                {item.quantity} ×{" "}
                {formatMoney(item.unit_price)}
              </span>

              <span>{formatMoney(item.subtotal)}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="my-3 border-t border-dashed border-black" />

      <section className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>

        {order.discount_amount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>
              -{formatMoney(order.discount_amount)}
            </span>
          </div>
        )}

        {settings.show_tax_on_receipt &&
          order.tax_amount > 0 && (
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatMoney(order.tax_amount)}</span>
            </div>
          )}

        <div className="flex justify-between border-t border-black pt-2 text-sm font-bold">
          <span>Total</span>
          <span>{formatMoney(order.total)}</span>
        </div>

        {order.paid_amount != null && (
          <div className="flex justify-between">
            <span>Paid</span>
            <span>{formatMoney(order.paid_amount)}</span>
          </div>
        )}

        {order.change_amount != null &&
          order.change_amount > 0 && (
            <div className="flex justify-between">
              <span>Change</span>
              <span>
                {formatMoney(order.change_amount)}
              </span>
            </div>
          )}
      </section>

      {settings.receipt_footer && (
        <>
          <div className="my-3 border-t border-dashed border-black" />

          <footer className="whitespace-pre-line text-center text-xs">
            {settings.receipt_footer}
          </footer>
        </>
      )}
    </article>
  );
}