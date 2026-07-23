"use client";

import { useMemo, useState } from "react";
import {
  CirclePlus,
  PackagePlus,
  Trash2,
} from "lucide-react";

import { createPurchase } from "@/app/(dashboard)/dashboard/purchases/actions";

type Supplier = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  cost_price: number;
  stock_quantity: number;
};

type PurchaseItem = {
  rowId: string;
  productId: string;
  quantity: number;
  unitCost: number;
};

type PurchaseFormProps = {
  suppliers: Supplier[];
  products: Product[];
  today: string;
};

export default function PurchaseForm({
  suppliers,
  products,
  today,
}: PurchaseFormProps) {
  const [items, setItems] = useState<
    PurchaseItem[]
  >([
    {
      rowId: crypto.randomUUID(),
      productId: "",
      quantity: 1,
      unitCost: 0,
    },
  ]);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          Number(item.quantity || 0) *
            Number(item.unitCost || 0),
        0,
      ),
    [items],
  );

  function addItem() {
    setItems((currentItems) => [
      ...currentItems,
      {
        rowId: crypto.randomUUID(),
        productId: "",
        quantity: 1,
        unitCost: 0,
      },
    ]);
  }

  function removeItem(rowId: string) {
    setItems((currentItems) => {
      if (currentItems.length === 1) {
        return currentItems;
      }

      return currentItems.filter(
        (item) => item.rowId !== rowId,
      );
    });
  }

  function updateItem(
    rowId: string,
    changes: Partial<PurchaseItem>,
  ) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              ...changes,
            }
          : item,
      ),
    );
  }

  function selectProduct(
    rowId: string,
    productId: string,
  ) {
    const product = products.find(
      (item) => item.id === productId,
    );

    updateItem(rowId, {
      productId,
      unitCost: Number(
        product?.cost_price ?? 0,
      ),
    });
  }

  const serializedItems = JSON.stringify(
    items.map((item) => ({
      product_id: item.productId,
      quantity: Number(item.quantity),
      unit_cost: Number(item.unitCost),
    })),
  );

  return (
    <form
      action={createPurchase}
      className="space-y-6"
    >
      <input
        type="hidden"
        name="items"
        value={serializedItems}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <PackagePlus size={22} />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Purchase Information
            </h2>

            <p className="text-sm text-slate-500">
              Select supplier and purchase date
            </p>
          </div>
        </div>

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

              {suppliers.map((supplier) => (
                <option
                  key={supplier.id}
                  value={supplier.id}
                >
                  {supplier.name}
                </option>
              ))}
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
              defaultValue={today}
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
              placeholder="Supplier invoice number"
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Notes"
            htmlFor="notes"
          >
            <input
              id="notes"
              name="notes"
              placeholder="Optional purchase note"
              className={inputClass}
            />
          </FormField>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Purchase Items
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Add products received from the supplier
            </p>
          </div>

          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <CirclePlus size={18} />
            Add Product
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4">
                  Product
                </th>

                <th className="px-6 py-4 text-right">
                  Current Stock
                </th>

                <th className="px-6 py-4 text-right">
                  Quantity
                </th>

                <th className="px-6 py-4 text-right">
                  Unit Cost
                </th>

                <th className="px-6 py-4 text-right">
                  Subtotal
                </th>

                <th className="px-6 py-4 text-right">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {items.map((item) => {
                const product = products.find(
                  (productItem) =>
                    productItem.id ===
                    item.productId,
                );

                const subtotal =
                  Number(item.quantity || 0) *
                  Number(item.unitCost || 0);

                return (
                  <tr key={item.rowId}>
                    <td className="px-6 py-4">
                      <select
                        required
                        value={item.productId}
                        onChange={(event) =>
                          selectProduct(
                            item.rowId,
                            event.target.value,
                          )
                        }
                        className={inputClass}
                      >
                        <option value="">
                          Select product
                        </option>

                        {products.map(
                          (productOption) => (
                            <option
                              key={
                                productOption.id
                              }
                              value={
                                productOption.id
                              }
                            >
                              {
                                productOption.name
                              }
                            </option>
                          ),
                        )}
                      </select>
                    </td>

                    <td className="px-6 py-4 text-right text-sm font-semibold text-slate-600">
                      {product?.stock_quantity ?? 0}
                    </td>

                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(item.rowId, {
                            quantity: Number(
                              event.target.value,
                            ),
                          })
                        }
                        className={`${inputClass} text-right`}
                      />
                    </td>

                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={item.unitCost}
                        onChange={(event) =>
                          updateItem(item.rowId, {
                            unitCost: Number(
                              event.target.value,
                            ),
                          })
                        }
                        className={`${inputClass} text-right`}
                      />
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(subtotal)}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            removeItem(item.rowId)
                          }
                          disabled={
                            items.length === 1
                          }
                          className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-5">
          <div className="w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">
                Purchase Total
              </span>

              <span className="text-2xl font-bold text-slate-900">
                {formatCurrency(total)}
              </span>
            </div>

            <button
              type="submit"
              disabled={
                items.some(
                  (item) =>
                    !item.productId ||
                    item.quantity <= 0 ||
                    item.unitCost < 0,
                )
              }
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Receive Purchase
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}