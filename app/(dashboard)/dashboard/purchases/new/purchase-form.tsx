"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Minus,
  Plus,
  Trash2,
} from "lucide-react";

import {
  createPurchase,
} from "@/app/(dashboard)/dashboard/purchases/actions";

type Supplier = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  stock_quantity: number;
};

type PurchaseFormItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
};

type CreatePurchaseFormProps = {
  suppliers: Supplier[];
  products: Product[];
};

export default function CreatePurchaseForm({
  suppliers,
  products,
}: CreatePurchaseFormProps) {
  const [
    selectedProductId,
    setSelectedProductId,
  ] = useState("");

  const [
    items,
    setItems,
  ] = useState<
    PurchaseFormItem[]
  >([]);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          item.quantity *
            item.unitCost,
        0,
      ),
    [items],
  );

  function addProduct() {
    if (!selectedProductId) {
      return;
    }

    const product =
      products.find(
        (item) =>
          item.id ===
          selectedProductId,
      );

    if (!product) {
      return;
    }

    setItems(
      (currentItems) => {
        const existingItem =
          currentItems.find(
            (item) =>
              item.productId ===
              product.id,
          );

        if (existingItem) {
          return currentItems.map(
            (item) =>
              item.productId ===
              product.id
                ? {
                    ...item,
                    quantity:
                      item.quantity +
                      1,
                  }
                : item,
          );
        }

        return [
          ...currentItems,
          {
            productId:
              product.id,

            productName:
              product.name,

            quantity: 1,

            unitCost:
              Number(
                product.cost_price,
              ),
          },
        ];
      },
    );

    setSelectedProductId("");
  }

  function updateQuantity(
    productId: string,
    quantity: number,
  ) {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return;
    }

    setItems(
      (currentItems) =>
        currentItems.map(
          (item) =>
            item.productId ===
            productId
              ? {
                  ...item,
                  quantity,
                }
              : item,
        ),
    );
  }

  function updateUnitCost(
    productId: string,
    unitCost: number,
  ) {
    if (
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      return;
    }

    setItems(
      (currentItems) =>
        currentItems.map(
          (item) =>
            item.productId ===
            productId
              ? {
                  ...item,
                  unitCost,
                }
              : item,
        ),
    );
  }

  function removeItem(
    productId: string,
  ) {
    setItems(
      (currentItems) =>
        currentItems.filter(
          (item) =>
            item.productId !==
            productId,
        ),
    );
  }

  return (
    <form
      action={createPurchase}
      className="space-y-6"
    >
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.map((item) => ({
            productId:
              item.productId,

            productName:
              item.productName,

            quantity:
              item.quantity,

            unitCost:
              item.unitCost,
          })),
        )}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          Purchase Information
        </h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <FormField
            label="Supplier"
            htmlFor="supplierId"
          >
            <select
              id="supplierId"
              name="supplierId"
              defaultValue=""
              className={inputClass}
            >
              <option value="">
                No supplier
              </option>

              {suppliers.map(
                (supplier) => (
                  <option
                    key={
                      supplier.id
                    }
                    value={
                      supplier.id
                    }
                  >
                    {supplier.name}
                  </option>
                ),
              )}
            </select>
          </FormField>

          <FormField
            label="Purchase date"
            htmlFor="purchaseDate"
          >
            <input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              required
              defaultValue={
                getLocalDateString(
                  new Date(),
                )
              }
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Reference number"
            htmlFor="referenceNumber"
          >
            <input
              id="referenceNumber"
              name="referenceNumber"
              type="text"
              placeholder="Supplier invoice number"
              className={inputClass}
            />
          </FormField>
        </div>

        <div className="mt-5">
          <FormField
            label="Notes"
            htmlFor="notes"
          >
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Optional purchase notes"
              className={`${inputClass} resize-none`}
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          Purchased Products
        </h2>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <select
            value={
              selectedProductId
            }
            onChange={(event) =>
              setSelectedProductId(
                event.target.value,
              )
            }
            className={`${inputClass} flex-1`}
          >
            <option value="">
              Select a product
            </option>

            {products.map(
              (product) => (
                <option
                  key={product.id}
                  value={product.id}
                >
                  {product.name}
                  {product.sku
                    ? ` — ${product.sku}`
                    : ""}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            onClick={addProduct}
            disabled={
              !selectedProductId
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} />
            Add Product
          </button>
        </div>

        {items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
            <p className="font-medium text-slate-700">
              No products added
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Select a product and
              click Add Product.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">
                    Product
                  </th>

                  <th className="px-3 py-3 text-center">
                    Quantity
                  </th>

                  <th className="px-3 py-3 text-right">
                    Unit Cost
                  </th>

                  <th className="px-3 py-3 text-right">
                    Subtotal
                  </th>

                  <th className="px-3 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {items.map(
                  (item) => (
                    <tr
                      key={
                        item.productId
                      }
                    >
                      <td className="px-3 py-4 font-semibold text-slate-900">
                        {
                          item.productName
                        }
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                Math.max(
                                  1,
                                  item.quantity -
                                    1,
                                ),
                              )
                            }
                            className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
                          >
                            <Minus
                              size={15}
                            />
                          </button>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              item.quantity
                            }
                            onChange={(
                              event,
                            ) =>
                              updateQuantity(
                                item.productId,
                                Number(
                                  event
                                    .target
                                    .value,
                                ),
                              )
                            }
                            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-center outline-none focus:border-blue-500"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.quantity +
                                  1,
                              )
                            }
                            className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
                          >
                            <Plus
                              size={15}
                            />
                          </button>
                        </div>
                      </td>

                      <td className="px-3 py-4 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            item.unitCost
                          }
                          onChange={(
                            event,
                          ) =>
                            updateUnitCost(
                              item.productId,
                              Number(
                                event
                                  .target
                                  .value,
                              ),
                            )
                          }
                          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-right outline-none focus:border-blue-500"
                        />
                      </td>

                      <td className="px-3 py-4 text-right font-bold text-slate-900">
                        {formatCurrency(
                          item.quantity *
                            item.unitCost,
                        )}
                      </td>

                      <td className="px-3 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            removeItem(
                              item.productId,
                            )
                          }
                          className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50"
                          aria-label={`Remove ${item.productName}`}
                        >
                          <Trash2
                            size={18}
                          />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
          <div className="text-right">
            <p className="text-sm text-slate-500">
              Purchase total
            </p>

            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatCurrency(
                total,
              )}
            </p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={
            items.length === 0
          }
          className="rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Receive Purchase
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency: "USD",
    },
  ).format(value);
}

function getLocalDateString(
  date: Date,
) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
