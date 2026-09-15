"use client";

import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import ImageUpload from "@/components/image-upload";
import {
  createConfigurableProduct,
  type CreateProductState,
} from "./actions";

type Category = { id: string; name: string };

type OptionRow = {
  id: string;
  name: string;
  priceAdjustment: string;
  isDefault: boolean;
};

type GroupRow = {
  id: string;
  name: string;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  minSelections: string;
  maxSelections: string;
  options: OptionRow[];
};

const initialState: CreateProductState = { success: false, message: "" };
const inputClass = "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function newOption(): OptionRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    priceAdjustment: "0",
    isDefault: false,
  };
}

function newGroup(): GroupRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    selectionType: "single",
    isRequired: true,
    minSelections: "1",
    maxSelections: "1",
    options: [newOption()],
  };
}

export default function ConfigurableProductForm({ categories }: { categories: Category[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createConfigurableProduct, initialState);
  const [groups, setGroups] = useState<GroupRow[]>([newGroup()]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
      setGroups([newGroup()]);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  function updateGroup(id: string, patch: Partial<GroupRow>) {
    setGroups((current) => current.map((group) => group.id === id ? { ...group, ...patch } : group));
  }

  function updateOption(groupId: string, optionId: string, patch: Partial<OptionRow>) {
    setGroups((current) => current.map((group) =>
      group.id === groupId
        ? {
            ...group,
            options: group.options.map((option) => option.id === optionId ? { ...option, ...patch } : option),
          }
        : group,
    ));
  }

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-5">
      <input
        type="hidden"
        name="optionGroups"
        value={JSON.stringify(groups.map((group) => ({
          name: group.name.trim(),
          selectionType: group.selectionType,
          isRequired: group.isRequired,
          minSelections: Number(group.minSelections),
          maxSelections: Number(group.maxSelections),
          options: group.options.map((option) => ({
            name: option.name.trim(),
            priceAdjustment: Number(option.priceAdjustment),
            isDefault: option.isDefault,
          })),
        })))}
      />

      <Field label="Product name" htmlFor="config-name">
        <input id="config-name" name="name" required minLength={2} placeholder="Brown Sugar Milk Tea" className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU" htmlFor="config-sku">
          <input id="config-sku" name="sku" required placeholder="MILKTEA-001" className={inputClass} />
        </Field>
        <Field label="Category" htmlFor="config-category">
          <select id="config-category" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">No category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
      </div>

      <ImageUpload />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cost price" htmlFor="config-cost">
          <input id="config-cost" name="costPrice" type="number" min="0" step="0.01" required defaultValue="0" className={inputClass} />
        </Field>
        <Field label="Base selling price" htmlFor="config-price">
          <input id="config-price" name="sellingPrice" type="number" min="0" step="0.01" required defaultValue="0" className={inputClass} />
        </Field>
        <Field label="Stock quantity" htmlFor="config-stock">
          <input id="config-stock" name="stockQuantity" type="number" min="0" step="1" required defaultValue="0" className={inputClass} />
        </Field>
        <Field label="Low-stock alert" htmlFor="config-low-stock">
          <input id="config-low-stock" name="lowStockQuantity" type="number" min="0" step="1" required defaultValue="5" className={inputClass} />
        </Field>
      </div>

      <Field label="Description" htmlFor="config-description">
        <textarea id="config-description" name="description" rows={3} className={`${inputClass} resize-none`} placeholder="Optional product description" />
      </Field>

      <section className="rounded-2xl border border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">Configuration groups</h3>
            <p className="mt-1 text-xs text-slate-500">Size, sugar, ice, toppings, extras and more.</p>
          </div>
          <button
            type="button"
            onClick={() => setGroups((current) => [...current, newGroup()])}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-200"
          >
            <Plus size={16} /> Add Group
          </button>
        </div>

        <div className="space-y-4 p-4">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Settings2 size={17} className="text-blue-600" />
                  <p className="font-semibold text-slate-900">Group {groupIndex + 1}</p>
                </div>
                <button
                  type="button"
                  disabled={groups.length === 1}
                  onClick={() => setGroups((current) => current.filter((row) => row.id !== group.id))}
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniField label="Group name" value={group.name} placeholder="Size, Sugar, Toppings" onChange={(value) => updateGroup(group.id, { name: value })} />
                <label className="text-xs font-medium text-slate-600">
                  Selection type
                  <select
                    value={group.selectionType}
                    onChange={(event) => {
                      const selectionType = event.target.value as "single" | "multiple";
                      updateGroup(group.id, {
                        selectionType,
                        maxSelections: selectionType === "single" ? "1" : group.maxSelections,
                      });
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="single">Single choice</option>
                    <option value="multiple">Multiple choices</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={group.isRequired}
                  onChange={(event) => updateGroup(group.id, {
                    isRequired: event.target.checked,
                    minSelections: event.target.checked ? "1" : "0",
                  })}
                />
                Customer must select an option
              </label>

              {group.selectionType === "multiple" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MiniField label="Minimum selections" value={group.minSelections} type="number" min="0" onChange={(value) => updateGroup(group.id, { minSelections: value })} />
                  <MiniField label="Maximum selections" value={group.maxSelections} type="number" min="1" onChange={(value) => updateGroup(group.id, { maxSelections: value })} />
                </div>
              )}

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Options</p>
                  <button
                    type="button"
                    onClick={() => updateGroup(group.id, { options: [...group.options, newOption()] })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"
                  >
                    <Plus size={14} /> Add Option
                  </button>
                </div>

                <div className="space-y-2">
                  {group.options.map((option) => (
                    <div key={option.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_130px_auto]">
                      <input
                        required
                        value={option.name}
                        onChange={(event) => updateOption(group.id, option.id, { name: event.target.value })}
                        placeholder="Option name"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.priceAdjustment}
                        onChange={(event) => updateOption(group.id, option.id, { priceAdjustment: event.target.value })}
                        placeholder="+ Price"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={group.options.length === 1}
                        onClick={() => updateGroup(group.id, { options: group.options.filter((row) => row.id !== option.id) })}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? <><Loader2 size={18} className="animate-spin" /> Creating...</> : <><Settings2 size={18} /> Create Configurable Product</>}
      </button>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function MiniField({
  label,
  value,
  placeholder,
  type = "text",
  min,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        type={type}
        min={min}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
      />
    </label>
  );
}
