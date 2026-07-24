import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CancelOrderForm from "@/components/cancel-order-form";
import ReturnItemsForm from "./return-items-form";
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  MapPin,
  Package,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";

import PrintReceiptButton from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";

type ProductRelation = {
  name: string;
  sku: string | null;
  image_url: string | null;
};

type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products:
    | ProductRelation
    | ProductRelation[]
    | null;
};

type CustomerRelation = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
};

type Order = {
  id: string;
  order_number: string;

  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;

  payment_method: string;
  amount_paid: number;
  change_amount: number;
  remaining_balance: number;

  status: string;
  created_at: string;

  customers:
    | CustomerRelation
    | CustomerRelation[]
    | null;

  order_items: OrderItem[];
};

type OrderDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};



export default async function OrderDetailsPage({
  params,
}: OrderDetailsPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  

const { data, error } = await supabase
  .from("orders")
  .select(`
    id,
    order_number,
    subtotal,
    discount,
    delivery_fee,
    total,
    payment_method,
    amount_paid,
    change_amount,
    remaining_balance,
    status,
    created_at,
    customers (
      id,
      name,
      phone,
      address
    ),
    order_items (
      id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      products (
        name,
        sku,
        image_url
      )
    )
  `)
  .eq("id", id)
  .eq("owner_id", user.id)
  .single();

  if (error || !data) {
    notFound();
  }

  

  const order = data as Order;
  const customer = getCustomer(order.customers);
  const orderItems = order.order_items ?? [];
  const totalPurchasedQuantity = orderItems.reduce(
  (total, item) => total + Number(item.quantity),
  0,
);


  const orderItemIds =
  order?.order_items?.map(
    (item) => item.id,
  ) ?? [];

const { data: returnedItemsData, error: returnedItemsError } =
  orderItemIds.length > 0
    ? await supabase
        .from("return_items")
        .select("order_item_id, quantity")
        .in("order_item_id", orderItemIds)
    : {
        data: [],
        error: null,
      };

const canManageOrder = [
  "new",
  "pending",
  "completed",
].includes(order.status);

if (returnedItemsError) {
  console.error(
    "Unable to load returned items:",
    returnedItemsError,
  );
}
  const returnedQuantityMap =
  new Map<string, number>();

for (const returnedItem of
  returnedItemsData ?? []) {
  const currentQuantity =
    returnedQuantityMap.get(
      returnedItem.order_item_id,
    ) ?? 0;

  returnedQuantityMap.set(
    returnedItem.order_item_id,
    currentQuantity +
      Number(returnedItem.quantity),
  );
}

const returnableOrderItems = orderItems
  .map((item) => {

    
    const returnedQuantity =
      returnedQuantityMap.get(item.id) ?? 0;

      const remainingQuantity = Math.max(
  0,
  Number(item.quantity) - returnedQuantity,
);

const remainingLineTotal =
  remainingQuantity * Number(item.unit_price);

    const purchasedQuantity =
      Number(item.quantity);

    const availableQuantity = Math.max(
      0,
      purchasedQuantity - returnedQuantity,
    );

    const remainingSubtotal = orderItems.reduce(
  (sum, item) => {
    const returnedQuantity =
      returnedQuantityMap.get(item.id) ?? 0;

    const remainingQuantity = Math.max(
      0,
      Number(item.quantity) - returnedQuantity,
    );

    const lineTotal =
      remainingQuantity *
      Number(item.unit_price);

    return sum + lineTotal;
  },
  0,
);



    return {
      id: item.id,
      product_name:
        item.product_name ||
        getProduct(item.products)?.name ||
        "Product",
      quantity: purchasedQuantity,
      unit_price: Number(item.unit_price),
      returned_quantity: returnedQuantity,
      available_quantity: availableQuantity,
    };
  })
  .filter(
    (item) => item.available_quantity > 0,
  );
    const remainingSubtotal = orderItems.reduce(
  (sum, item) => {
    const returned =
      returnedQuantityMap.get(item.id) ?? 0;

    const qty = Math.max(
      0,
      Number(item.quantity) - returned,
    );

    return (
      sum +
      qty * Number(item.unit_price)
    );
  },
  0,
);


 
const discount = Number(order.discount || 0);
const deliveryFee = Number(
  order.delivery_fee || 0,
);

const remainingTotal = Math.max(
  0,
  remainingSubtotal +
    deliveryFee -
    discount,
);

const amountPaid = Number(
  order.amount_paid || 0,
);

const remainingBalance = Math.max(
  0,
  remainingTotal - amountPaid,
);

const currentChangeAmount = Math.max(
  0,
  amountPaid - remainingTotal,
);

const remainingItemCount = returnableOrderItems.reduce(
  (total, item) => total + item.available_quantity,
  0,
);

  return (
    <main className="space-y-6">
      {/* Hidden while printing */}
      <div className="print:hidden">
  <Link
    href="/dashboard/orders"
    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-600"
  >
    <ArrowLeft size={18} />
    Back to orders
  </Link>

  <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-3xl font-bold text-slate-900">
        Order Details
      </h1>

      <p className="mt-1 text-slate-500">
        View customer, products and payment information
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-3">
  { 
    canManageOrder &&(
      <>
        {returnableOrderItems.length > 0 && remainingItemCount  > 1 &&(
          <ReturnItemsForm
            orderId={order.id}
            orderNumber={order.order_number}
            items={returnableOrderItems}
            
          />
        )}

        <CancelOrderForm
          orderId={order.id}
          orderNumber={order.order_number}
        />
      </>
    )}

  {order.status === "cancelled" && (
    <span className="rounded-xl bg-red-50 px-5 py-3 font-semibold text-red-700">
      This order is cancelled
    </span>
  )}

  {order.status === "refunded" && (
    <span className="rounded-xl bg-purple-50 px-5 py-3 font-semibold text-purple-700">
      This order is refunded
    </span>
  )}

  {order.status !== "cancelled" &&
    order.status !== "refunded" &&
    returnableOrderItems.length === 0 && (
      <span className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600">
        All products have been returned
      </span>
    )}
</div>
  </div>
</div>

      {/* General order information */}
      <section className="grid gap-6 lg:grid-cols-2 print:hidden">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <ReceiptText size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Order Information
              </h2>

              <p className="text-sm text-slate-500">
                Sale and payment details
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <InformationItem
              label="Order number"
              value={order.order_number}
              icon={<ReceiptText size={18} />}
            />

            <InformationItem
              label="Date"
              value={formatDate(order.created_at)}
              icon={<CalendarDays size={18} />}
            />

            <InformationItem
              label="Payment method"
              value={formatPaymentMethod(
                order.payment_method,
              )}
              icon={<CreditCard size={18} />}
            />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </p>

              <span
                className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${getStatusClass(
                  order.status,
                )}`}
              >
                {order.status}
              </span>
            </div>
          </div>
        </div>

        {/* Customer information */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
              <UserRound size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Customer Information
              </h2>

              <p className="text-sm text-slate-500">
                Customer contact and address
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <InformationItem
              label="Customer name"
              value={customer?.name ?? "Walk-in customer"}
              icon={<UserRound size={18} />}
            />

            <InformationItem
              label="Phone"
              value={customer?.phone ?? "No phone number"}
              icon={<Phone size={18} />}
            />

            <InformationItem
              label="Address"
              value={customer?.address ?? "No address"}
              icon={<MapPin size={18} />}
            />
          </div>
        </div>
      </section>

      {/* Product table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">
            Products Purchased
          </h2>

        <p className="mt-1 text-sm text-slate-500">
  {orderItems.reduce(
    (sum, item) =>
      sum +
      Math.max(
        0,
        Number(item.quantity) -
          (returnedQuantityMap.get(item.id) ?? 0),
      ),
    0,
  )}{" "}
  items
</p>

        </div>

        {orderItems.length === 0 ? (
          <div className="p-12 text-center">
            <Package
              size={42}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 text-slate-600">
              No products found for this order.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4 font-semibold">
                    Product
                  </th>

                  <th className="px-6 py-4 text-center font-semibold">
                    Quantity
                  </th>

                  <th className="px-6 py-4 text-right font-semibold">
                    Price
                  </th>

                  <th className="px-6 py-4 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {orderItems.map((item) => {
                  const product = getProduct(
                    item.products,
                  );
                      const returnedQuantity =
                        returnedQuantityMap.get(item.id) ?? 0;

                      const remainingQuantity = Math.max(
                        0,
                        Number(item.quantity) - returnedQuantity,
                      );

                
                  const itemName =
                    item.product_name ||
                    product?.name ||
                    "Deleted product";

                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {product?.image_url ? (
                            <img
                              src={product.image_url}
                              alt={itemName}
                              className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                              <Package size={21} />
                            </div>
                          )}

                          <div>
                            <p className="font-semibold text-slate-900">
                              {itemName}
                            </p>

                            {product?.sku && (
                              <p className="mt-1 text-xs text-slate-500">
                                SKU: {product.sku}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center font-semibold text-slate-700">
                                {Math.max(
                                  0,
                                  Number(item.quantity) -
                                    (returnedQuantityMap.get(item.id) ?? 0)
                                )}
                              </td>

                      <td className="px-6 py-4 text-right text-slate-700">
                        $
                        {Number(
                          item.unit_price,
                        ).toFixed(2)}
                      </td>

                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                       ${remainingTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="ml-auto max-w-md border-t border-slate-200 p-6">
  <PriceRow
    label="Subtotal"
    value={remainingSubtotal}
  />

  {deliveryFee > 0 && (
    <PriceRow
      label="Delivery fee"
      value={deliveryFee}
    />
  )}

  {discount > 0 && (
    <div className="mt-2 flex justify-between text-sm">
      <span className="text-slate-500">
        Discount
      </span>

      <span className="font-semibold text-red-600">
        -${discount.toFixed(2)}
      </span>
    </div>
  )}

  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-xl font-bold">
    <span>Total</span>

    <span>
      ${remainingTotal.toFixed(2)}
    </span>
  </div>

  <PriceRow
    label="Amount paid"
    value={amountPaid}
    className="mt-4"
  />

  {remainingBalance > 0 && (
    <PriceRow
      label="Remaining balance"
      value={remainingBalance}
    />
  )}

  {currentChangeAmount > 0 && (
    <PriceRow
      label="Change"
      value={currentChangeAmount}
    />
  )}
</div>
      </section>

      {/* Click to view receipt */}
      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm open:overflow-visible print:border-0 print:shadow-none">
        <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 font-semibold text-slate-900 print:hidden">
          <div>
            <h2 className="text-xl font-semibold">
              Sale Receipt
            </h2>

            <p className="mt-1 text-sm font-normal text-slate-500">
              Click to view the printable receipt
            </p>
          </div>

          <span className="rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-600 transition group-open:bg-slate-100 group-open:text-slate-700">
            <span className="group-open:hidden">
              View more
            </span>

            <span className="hidden group-open:inline">
              Hide receipt
            </span>
          </span>
        </summary>

        <div className="border-t border-slate-200 p-6 print:border-0 print:p-0">
          <Receipt
  order={order}
  customer={customer}
  orderItems={orderItems}
  returnedQuantityMap={returnedQuantityMap}
  remainingSubtotal={remainingSubtotal}
  discount={discount}
  deliveryFee={deliveryFee}
  remainingTotal={remainingTotal}
  amountPaid={amountPaid}
  remainingBalance={remainingBalance}
  currentChangeAmount={currentChangeAmount}
/>

          <div className="mt-6 flex justify-end print:hidden">
            <PrintReceiptButton />
          </div>
        </div>
      </details>
    </main>
  );
}

function Receipt({
  order,
  customer,
  orderItems,
  returnedQuantityMap,
  remainingSubtotal,
  discount,
  deliveryFee,
  remainingTotal,
  amountPaid,
  remainingBalance,
  currentChangeAmount,
}: {
  order: Order;
  customer: CustomerRelation | null;
  orderItems: OrderItem[];
  returnedQuantityMap: Map<string, number>;
  remainingSubtotal: number;
  discount: number;
  deliveryFee: number;
  remainingTotal: number;
  amountPaid: number;
  remainingBalance: number;
  currentChangeAmount: number;
}) {
  const receiptItems = orderItems
    .map((item) => {
      const product = getProduct(item.products);

      const itemName =
        item.product_name ||
        product?.name ||
        "Product";

      const returnedQuantity =
        returnedQuantityMap.get(item.id) ?? 0;

      const remainingQuantity = Math.max(
        0,
        Number(item.quantity) - returnedQuantity,
      );

      const remainingLineTotal =
        remainingQuantity *
        Number(item.unit_price);

      return {
        item,
        itemName,
        remainingQuantity,
        remainingLineTotal,
      };
    })
    .filter(
      ({ remainingQuantity }) =>
        remainingQuantity > 0,
    );

  return (
    <article
      id="sale-receipt"
      className="mx-auto max-w-[380px] bg-white text-black"
    >
      <div className="border-b border-dashed border-black pb-4 text-center">
        <h2 className="text-2xl font-bold">
          SALE RECEIPT
        </h2>

        <p className="mt-2 text-sm">
          Thank you for your purchase
        </p>
      </div>

      <div className="space-y-1 border-b border-dashed border-black py-4 text-sm">
        <ReceiptInformation
          label="Order"
          value={order.order_number}
        />

        <ReceiptInformation
          label="Date"
          value={formatDate(order.created_at)}
        />

        <ReceiptInformation
          label="Customer"
          value={customer?.name ?? "Walk-in customer"}
        />

        {customer?.phone && (
          <ReceiptInformation
            label="Phone"
            value={customer.phone}
          />
        )}

        <ReceiptInformation
          label="Payment"
          value={formatPaymentMethod(
            order.payment_method,
          )}
        />

        <ReceiptInformation
          label="Status"
          value={capitalize(order.status)}
        />
      </div>

      <div className="border-b border-dashed border-black py-4">
        <div className="grid grid-cols-[1fr_45px_70px] gap-2 border-b border-black pb-2 text-xs font-bold uppercase">
          <span>Product</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Total</span>
        </div>

        <div className="space-y-3 pt-3">
          {receiptItems.length === 0 ? (
            <p className="text-center text-sm">
              All products were returned.
            </p>
          ) : (
            receiptItems.map(
              ({
                item,
                itemName,
                remainingQuantity,
                remainingLineTotal,
              }) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_45px_70px] gap-2 text-sm"
                >
                  <div>
                    <p>{itemName}</p>

                    <p className="text-xs">
                      $
                      {Number(
                        item.unit_price,
                      ).toFixed(2)}{" "}
                      each
                    </p>
                  </div>

                  <span className="text-center">
                    {remainingQuantity}
                  </span>

                  <span className="text-right">
                    $
                    {remainingLineTotal.toFixed(2)}
                  </span>
                </div>
              ),
            )
          )}
        </div>
      </div>

      <div className="space-y-2 py-4 text-sm">
        <ReceiptInformation
          label="Subtotal"
          value={`$${remainingSubtotal.toFixed(2)}`}
        />

        {discount > 0 && (
          <ReceiptInformation
            label="Discount"
            value={`-$${discount.toFixed(2)}`}
          />
        )}

        {deliveryFee > 0 && (
          <ReceiptInformation
            label="Delivery Fee"
            value={`$${deliveryFee.toFixed(2)}`}
          />
        )}

        <div className="flex justify-between border-t border-black pt-2 text-lg font-bold">
          <span>Total</span>

          <span>
            ${remainingTotal.toFixed(2)}
          </span>
        </div>

        <ReceiptInformation
          label="Paid"
          value={`$${amountPaid.toFixed(2)}`}
        />

        {remainingBalance > 0 && (
          <ReceiptInformation
            label="Remaining Balance"
            value={`$${remainingBalance.toFixed(2)}`}
          />
        )}

        {currentChangeAmount > 0 && (
          <ReceiptInformation
            label="Change"
            value={`$${currentChangeAmount.toFixed(2)}`}
          />
        )}
      </div>

      <div className="border-t border-dashed border-black pt-4 text-center text-xs">
        <p>Thank you. Please come again.</p>
      </div>
    </article>
  );
}

function InformationItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-slate-400">
        {icon}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>

        <p className="mt-1 font-medium text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}

function PriceRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={`mt-2 flex justify-between text-sm ${className}`}
    >
      <span className="text-slate-500">
        {label}
      </span>

      <span className="font-semibold text-slate-800">
        ${value.toFixed(2)}
      </span>
    </div>
  );
}

function ReceiptInformation({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="text-right font-medium">
        {value}
      </span>
    </div>
  );
}

function getCustomer(
  value:
    | CustomerRelation
    | CustomerRelation[]
    | null,
) {
  if (!value) {
    return null;
  }

  return Array.isArray(value)
    ? value[0] ?? null
    : value;
}

function getProduct(
  value:
    | ProductRelation
    | ProductRelation[]
    | null,
) {
  if (!value) {
    return null;
  }

  return Array.isArray(value)
    ? value[0] ?? null
    : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPaymentMethod(value: string) {
  switch (value) {
    case "cod":
      return "COD";

    case "deposit":
      return "Deposit";

    case "bank_transfer":
      return "Bank Transfer (Fully Paid)";

    case "other":
      return "Other";

    default:
      return value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function capitalize(value: string) {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function getStatusClass(status: string) {
  switch (status) {
    case "new":
      return "bg-blue-50 text-blue-700";

    case "completed":
      return "bg-green-50 text-green-700";

    case "pending":
      return "bg-amber-50 text-amber-700";

    case "cancelled":
      return "bg-red-50 text-red-700";

    case "refunded":
      return "bg-purple-50 text-purple-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
}