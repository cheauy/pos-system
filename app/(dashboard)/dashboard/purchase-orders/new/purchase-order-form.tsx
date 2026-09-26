"use client";

import Link from "next/link";
import {
  Barcode,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Info,
  Mail,
  MapPin,
  PackagePlus,
  Phone,
  Plus,
  Save,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { createPurchaseOrder } from "../actions";

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  cost_price: number | string | null;
  size: string | null;
  color: string | null;
};

type OrderItem = {
  rowId: number;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
};

type ImportResult = {
  tone: "success" | "warning";
  text: string;
};

export default function PurchaseOrderForm({
  suppliers,
  products,
}: {
  suppliers: Supplier[];
  products: Product[];
}) {
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<OrderItem[]>([blankItem(1)]);
  const [nextRowId, setNextRowId] = useState(2);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === supplierId) ?? null,
    [supplierId, suppliers],
  );

  const validItems = useMemo(
    () => items.filter((item) => item.productId),
    [items],
  );

  const subtotal = useMemo(
    () =>
      validItems.reduce(
        (sum, item) => sum + item.quantity * item.unitCost,
        0,
      ),
    [validItems],
  );

  const today = new Date().toISOString().slice(0, 10);

  function updateProduct(rowId: number, productId: string) {
    if (!productId) {
      setItems((current) =>
        current.map((item) =>
          item.rowId === rowId ? blankItem(rowId) : item,
        ),
      );
      return;
    }

    const product = products.find((candidate) => candidate.id === productId);

    if (!product) {
      return;
    }

    const duplicate = items.some(
      (item) => item.rowId !== rowId && item.productId === productId,
    );

    if (duplicate) {
      window.alert("That product is already on this purchase order.");
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId ? itemFromProduct(rowId, product) : item,
      ),
    );
  }

  function updateQuantity(rowId: number, quantity: number) {
    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              quantity: Math.max(1, Math.trunc(quantity || 1)),
            }
          : item,
      ),
    );
  }

  function updateCost(rowId: number, unitCost: number) {
    setItems((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              unitCost: Math.max(0, Number.isFinite(unitCost) ? unitCost : 0),
            }
          : item,
      ),
    );
  }

  function addBlankRow() {
    if (items.some((item) => !item.productId)) {
      return;
    }

    setItems((current) => [...current, blankItem(nextRowId)]);
    setNextRowId((value) => value + 1);
  }

  function removeRow(rowId: number) {
    setItems((current) => {
      const next = current.filter((item) => item.rowId !== rowId);
      return next.length ? next : [blankItem(nextRowId)];
    });

    if (items.length === 1) {
      setNextRowId((value) => value + 1);
    }
  }

  function addByBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const barcode = barcodeValue.trim().toLowerCase();

    if (!barcode) {
      return;
    }

    const product = products.find(
      (candidate) => candidate.barcode?.trim().toLowerCase() === barcode,
    );

    if (!product) {
      setImportResult({
        tone: "warning",
        text: "No active product matched that barcode.",
      });
      return;
    }

    insertProduct(product, 1, Number(product.cost_price ?? 0));
    setBarcodeValue("");
    setImportResult({
      tone: "success",
      text: `${product.name} added from barcode.`,
    });
  }

  function insertProduct(product: Product, quantity: number, unitCost: number) {
    setItems((current) => {
      const existingIndex = current.findIndex(
        (item) => item.productId === product.id,
      );

      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: item.quantity + Math.max(1, Math.trunc(quantity || 1)),
                unitCost: Math.max(0, unitCost),
              }
            : item,
        );
      }

      const emptyIndex = current.findIndex((item) => !item.productId);
      const rowId = emptyIndex >= 0 ? current[emptyIndex].rowId : nextRowId;
      const nextItem = {
        ...itemFromProduct(rowId, product),
        quantity: Math.max(1, Math.trunc(quantity || 1)),
        unitCost: Math.max(0, unitCost),
      };

      if (emptyIndex >= 0) {
        return current.map((item, index) =>
          index === emptyIndex ? nextItem : item,
        );
      }

      setNextRowId((value) => value + 1);
      return [...current, nextItem];
    });
  }

  async function importItems(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const content = await file.text();
    const rows = content
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);

    if (!rows.length) {
      setImportResult({ tone: "warning", text: "The CSV file is empty." });
      return;
    }

    const parsedRows = rows.map(parseCsvRow);
    const first = parsedRows[0].map((value) => value.toLowerCase());
    const hasHeader = first.some((value) =>
      ["sku", "quantity", "qty", "unit_cost", "cost", "cost_price"].includes(
        value,
      ),
    );

    const header = hasHeader ? first : ["sku", "quantity", "unit_cost"];
    const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;
    const skuIndex = Math.max(0, header.findIndex((value) => value === "sku"));
    const quantityIndex = header.findIndex((value) =>
      ["quantity", "qty"].includes(value),
    );
    const costIndex = header.findIndex((value) =>
      ["unit_cost", "cost", "cost_price"].includes(value),
    );

    let imported = 0;
    let skipped = 0;

    for (const row of dataRows) {
      const sku = row[skuIndex]?.trim().toLowerCase();

      if (!sku) {
        skipped += 1;
        continue;
      }

      const product = products.find(
        (candidate) => candidate.sku?.trim().toLowerCase() === sku,
      );

      if (!product) {
        skipped += 1;
        continue;
      }

      const quantity = quantityIndex >= 0 ? Number(row[quantityIndex]) : 1;
      const importedCost = costIndex >= 0 ? Number(row[costIndex]) : NaN;
      const unitCost = Number.isFinite(importedCost)
        ? importedCost
        : Number(product.cost_price ?? 0);

      insertProduct(product, quantity, unitCost);
      imported += 1;
    }

    setImportResult({
      tone: imported ? "success" : "warning",
      text: `${imported} item${imported === 1 ? "" : "s"} imported${
        skipped ? ` · ${skipped} skipped` : ""
      }.`,
    });
  }

  return (
    <form action={createPurchaseOrder} className="space-y-5">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          validItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        )}
      />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            New Purchase Order
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a purchase order to order stock from your supplier. Save it as
            draft or submit it directly.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="submissionStatus"
            value="draft"
            disabled={!supplierId || !validItems.length}
            className={secondaryButton}
          >
            <Save size={17} />
            Save as Draft
          </button>
          <button
            type="submit"
            name="submissionStatus"
            value="sent"
            disabled={!supplierId || !validItems.length}
            className={primaryButton}
          >
            <Send size={17} />
            Create Purchase Order
          </button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard
          icon={<ShoppingCart size={19} />}
          title="Order Information"
          subtitle="Basic information about this purchase order."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Supplier" required>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <select
                    name="supplierId"
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                    required
                    className={`${inputClass} pl-9`}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Link
                  href="/dashboard/suppliers"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  <Plus size={16} />
                  New Supplier
                </Link>
              </div>
            </Field>

            <Field label="Order Date" required>
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  name="orderDate"
                  type="date"
                  defaultValue={today}
                  required
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>

            <Field label="Expected Delivery Date">
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  name="expectedDate"
                  type="date"
                  min={today}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>

            <Field label="Reference / PO Number">
              <input
                name="referenceNumber"
                placeholder="Supplier reference or external PO number"
                maxLength={100}
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Building2 size={19} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-950">Supplier Details</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Supplier information updates automatically after selection.
              </p>
            </div>
          </div>

          <div className="p-4">
            {selectedSupplier ? (
              <SupplierDetails supplier={selectedSupplier} />
            ) : (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
                <div className="flex gap-3">
                  <Info size={19} className="mt-0.5 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-semibold">No supplier selected</p>
                    <p className="mt-1 text-sm text-blue-700">
                      Choose a supplier from the list or add a new supplier.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <SectionCard
        icon={<PackagePlus size={19} />}
        title="Order Items"
        subtitle="Add products to this purchase order."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setBarcodeOpen((value) => !value)}
              className={toolbarButton}
            >
              <Barcode size={16} />
              Scan Barcode
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={toolbarButton}
            >
              <Upload size={16} />
              Import Items
            </button>
            <button type="button" onClick={addBlankRow} className={primaryButton}>
              <Plus size={16} />
              Add Item
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={importItems}
            />
          </div>
        }
      >
        {barcodeOpen ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={barcodeValue}
                onChange={(event) => setBarcodeValue(event.target.value)}
                placeholder="Scan or enter barcode"
                className={`${inputClass} flex-1`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  const syntheticEvent = {
                    preventDefault() {},
                  } as FormEvent<HTMLFormElement>;
                  addByBarcode(syntheticEvent);
                }}
                className={secondaryButton}
              >
                Add barcode item
              </button>
            </div>
          </div>
        ) : null}

        {importResult ? (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              importResult.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {importResult.text}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-12 px-3 py-3 text-center">#</th>
                <th className="px-3 py-3">Product</th>
                <th className="w-36 px-3 py-3">SKU</th>
                <th className="w-40 px-3 py-3">Cost Price</th>
                <th className="w-32 px-3 py-3">Quantity</th>
                <th className="w-36 px-3 py-3 text-right">Subtotal</th>
                <th className="w-20 px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.rowId} className="border-b border-slate-100">
                  <td className="px-3 py-3 text-center font-medium text-slate-600">
                    {index + 1}
                  </td>
                  <td className="px-3 py-3">
                    <input type="search" aria-label={`Search product for item ${index + 1}`} placeholder="Search SKU or product name" value={productSearch[item.rowId] ?? ""} onChange={event => setProductSearch(current => ({...current, [item.rowId]: event.target.value}))} className={`${inputClass} mb-2`} />
                    <select
                      aria-label={`Product for item ${index + 1}`}
                      value={item.productId}
                      onChange={(event) =>
                        updateProduct(item.rowId, event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="">Select product / variant</option>
                      {products.filter(product => product.id === item.productId || productLabel(product).toLowerCase().includes((productSearch[item.rowId] ?? "").trim().toLowerCase())).map((product) => (
                        <option key={product.id} value={product.id}>
                          {productLabel(product)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-600">
                      {item.sku || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="relative">
                      <CircleDollarSign
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitCost}
                        disabled={!item.productId}
                        onChange={(event) =>
                          updateCost(item.rowId, Number(event.target.value))
                        }
                        className={`${inputClass} pl-9 disabled:bg-slate-50 disabled:text-slate-400`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      disabled={!item.productId}
                      onChange={(event) =>
                        updateQuantity(item.rowId, Number(event.target.value))
                      }
                      className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-950">
                    {item.productId
                      ? money(item.quantity * item.unitCost)
                      : money(0)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(item.rowId)}
                      aria-label="Remove purchase order item"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addBlankRow}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <PackagePlus size={18} />
          Add another item
        </button>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard
          icon={<FileText size={19} />}
          title="Additional Information"
          subtitle="Optional information for this purchase order."
        >
          <Field label="Notes">
            <textarea
              name="notes"
              rows={4}
              maxLength={1000}
              placeholder="Add internal notes, delivery instructions, or supplier details..."
              className={`${inputClass} resize-none`}
            />
          </Field>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Info size={15} className="mt-0.5 shrink-0" />
            TENH POS generates the internal PO number automatically after saving.
          </div>
        </SectionCard>

        <section className="h-fit rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <ShoppingCart size={19} />
            </div>
            <h2 className="font-semibold text-slate-950">Order Summary</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <SummaryLine label="Items" value={validItems.length.toString()} />
            <SummaryLine
              label="Total Quantity"
              value={validItems
                .reduce((sum, item) => sum + item.quantity, 0)
                .toString()}
            />
            <SummaryLine label="Subtotal" value={money(subtotal)} />
            <div className="border-t border-slate-200 pt-3">
              <SummaryLine label="Total" value={money(subtotal)} total />
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}

function SupplierDetails({ supplier }: { supplier: Supplier }) {
  const initials = supplier.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
          {initials || "S"}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-950">{supplier.name}</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Active
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Supplier account</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <DetailRow icon={<UserRound size={16} />} value={supplier.contact_person} />
        <DetailRow icon={<Phone size={16} />} value={supplier.phone} />
        <DetailRow icon={<Mail size={16} />} value={supplier.email} />
        <DetailRow icon={<MapPin size={16} />} value={supplier.address} />
      </div>

      {supplier.notes ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          {supplier.notes}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-start gap-2 text-slate-700">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  actions,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">{icon}</div>
          <div>
            <h2 className="font-semibold text-slate-950">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryLine({
  label,
  value,
  total,
}: {
  label: string;
  value: string;
  total?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={total ? "font-semibold text-slate-950" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={
          total
            ? "text-xl font-bold text-slate-950"
            : "font-semibold text-slate-800"
        }
      >
        {value}
      </span>
    </div>
  );
}

function blankItem(rowId: number): OrderItem {
  return {
    rowId,
    productId: "",
    name: "",
    sku: "",
    quantity: 1,
    unitCost: 0,
  };
}

function itemFromProduct(rowId: number, product: Product): OrderItem {
  return {
    rowId,
    productId: product.id,
    name: productLabel(product),
    sku: product.sku ?? "",
    quantity: 1,
    unitCost: Number(product.cost_price ?? 0),
  };
}

function productLabel(product: Product) {
  return [product.name, product.color, product.size, product.sku]
    .filter(Boolean)
    .join(" · ");
}

function parseCsvRow(row: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];

    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(value) ? value : 0);
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

const toolbarButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
