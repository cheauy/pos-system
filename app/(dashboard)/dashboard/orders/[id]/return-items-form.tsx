"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

import {
  createOrderReturn,
  type CreateReturnState,
} from "./return-actions";

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  returned_quantity: number;
};

type ReturnItemsFormProps = {
  orderId: string;
  orderNumber: string;
  items: OrderItem[];
};

type ReturnQuantityState = Record<
  string,
  number
>;

const initialState: CreateReturnState = {
  success: false,
  message: "",
};

export default function ReturnItemsForm({
  orderId,
  orderNumber,
  items,
}: ReturnItemsFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] =
    useState(false);

  const [quantities, setQuantities] =
    useState<ReturnQuantityState>({});

  const [state, formAction, isPending] =
    useActionState(
      createOrderReturn,
      initialState,
    );

  const returnableItems = items.filter(
    (item) =>
      item.quantity -
        item.returned_quantity >
      0,
  );

  const selectedItems = useMemo(
    () =>
      returnableItems
        .map((item) => ({
          order_item_id: item.id,
          quantity:
            quantities[item.id] ?? 0,
        }))
        .filter(
          (item) => item.quantity > 0,
        ),
    [quantities, returnableItems],
  );

  const refundTotal = useMemo(
    () =>
      returnableItems.reduce(
        (total, item) =>
          total +
          (quantities[item.id] ?? 0) *
            Number(item.unit_price),
        0,
      ),
    [quantities, returnableItems],
  );

  useEffect(() => {
    if (
      state.success &&
      state.returnId
    ) {
      router.push(
        `/dashboard/returns/${state.returnId}`,
      );
      router.refresh();
    }
  }, [
    state.success,
    state.returnId,
    router,
  ]);

  function updateQuantity(
    item: OrderItem,
    value: number,
  ) {
    const maximum =
      item.quantity -
      item.returned_quantity;

    const safeValue = Math.min(
      Math.max(
        Number.isFinite(value) ? value : 0,
        0,
      ),
      maximum,
    );

    setQuantities((current) => ({
      ...current,
      [item.id]: safeValue,
    }));
  }

  function closeModal() {
    if (isPending) {
      return;
    }

    setIsOpen(false);
    setQuantities({});
  }

  if (returnableItems.length === 0) {
    return (
      <span className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
        All items returned
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-12 min-w-[170px]
    items-center justify-center gap-2
    rounded-xl
    border border-amber-300
    bg-amber-50
    px-6
    font-semibold
    text-amber-700
    transition
    hover:bg-amber-100
    hover:border-amber-400"
      >
        <RotateCcw size={18} />
        Return Items
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Return Items
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Order {orderNumber}
                </p>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form
              action={formAction}
              className="p-6"
            >
              <input
                type="hidden"
                name="orderId"
                value={orderId}
              />

              <input
                type="hidden"
                name="items"
                value={JSON.stringify(
                  selectedItems,
                )}
              />

              {state.message && (
                <div
                  className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm ${
                    state.success
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {state.success ? (
                    <CheckCircle2
                      size={20}
                      className="mt-0.5 shrink-0"
                    />
                  ) : (
                    <AlertCircle
                      size={20}
                      className="mt-0.5 shrink-0"
                    />
                  )}

                  <p>{state.message}</p>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3">
                          Product
                        </th>

                        <th className="px-4 py-3 text-right">
                          Sold
                        </th>

                        <th className="px-4 py-3 text-right">
                          Returned
                        </th>

                        <th className="px-4 py-3 text-right">
                          Available
                        </th>

                        <th className="px-4 py-3 text-right">
                          Return Qty
                        </th>

                        <th className="px-4 py-3 text-right">
                          Refund
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {returnableItems.map(
                        (item) => {
                          const available =
                            item.quantity -
                            item.returned_quantity;

                          const selectedQuantity =
                            quantities[item.id] ??
                            0;

                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-4">
                                <p className="font-semibold text-slate-900">
                                  {
                                    item.product_name
                                  }
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  {formatCurrency(
                                    Number(
                                      item.unit_price,
                                    ),
                                  )}{" "}
                                  each
                                </p>
                              </td>

                              <td className="px-4 py-4 text-right">
                                {item.quantity}
                              </td>

                              <td className="px-4 py-4 text-right">
                                {
                                  item.returned_quantity
                                }
                              </td>

                              <td className="px-4 py-4 text-right font-semibold text-slate-700">
                                {available}
                              </td>

                              <td className="px-4 py-4">
                                <input
                                  type="number"
                                  min="0"
                                  max={available}
                                  step="1"
                                  disabled={isPending}
                                  value={
                                    selectedQuantity
                                  }
                                  onChange={(event) =>
                                    updateQuantity(
                                      item,
                                      Number(
                                        event.target
                                          .value,
                                      ),
                                    )
                                  }
                                  className="ml-auto block w-24 rounded-lg border border-slate-300 px-3 py-2 text-right outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                />
                              </td>

                              <td className="px-4 py-4 text-right font-semibold text-slate-900">
                                {formatCurrency(
                                  selectedQuantity *
                                    Number(
                                      item.unit_price,
                                    ),
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="reason"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Return reason
                </label>

                <textarea
                  id="reason"
                  name="reason"
                  required
                  minLength={3}
                  rows={4}
                  disabled={isPending}
                  placeholder="Example: Product damaged or customer changed their mind"
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-600">
                    Refund Total
                  </span>

                  <span className="text-2xl font-bold text-slate-900">
                    {formatCurrency(
                      refundTotal,
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={closeModal}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    isPending ||
                    selectedItems.length === 0
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending && (
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                  )}

                  {isPending
                    ? "Processing..."
                    : "Confirm Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}