"use client";

import { Coffee, CupSoda, Loader2, Plus, Settings2, Sparkles, Trash2, UtensilsCrossed } from "lucide-react";
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

export default function ConfigurableProductForm({ categories, businessType = "general" }: { categories: Category[]; businessType?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createConfigurableProduct, initialState);
  const isMilkTea = businessType === "milk_tea";
  const presetMeta = configurablePresetMeta(businessType);
  const [groups, setGroups] = useState<GroupRow[]>(() => configurableTemplate(businessType));

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
      setGroups(configurableTemplate(businessType));
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

      {presetMeta && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2 text-amber-700 shadow-sm">
              {presetMeta.icon === "milk" ? <CupSoda size={20} /> : presetMeta.icon === "cafe" ? <Coffee size={20} /> : <UtensilsCrossed size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{presetMeta.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{presetMeta.description}</p>
              <button type="button" onClick={() => setGroups(configurableTemplate(businessType))} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700">
                <Sparkles size={14} /> {presetMeta.button}
              </button>
            </div>
          </div>
        </div>
      )}

      <Field label={presetMeta?.nameLabel ?? "Product name"} htmlFor="config-name">
        <input id="config-name" name="name" required minLength={2} placeholder={presetMeta?.namePlaceholder ?? "Configurable product"} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU" htmlFor="config-sku">
          <input id="config-sku" name="sku" required placeholder={presetMeta?.skuPlaceholder ?? "CONFIG-001"} className={inputClass} />
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
            <h3 className="font-semibold text-slate-900">{presetMeta?.optionsTitle ?? "Configuration groups"}</h3>
            <p className="mt-1 text-xs text-slate-500">{presetMeta?.optionsDescription ?? "Size, options, extras and more."}</p>
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
        {pending ? <><Loader2 size={18} className="animate-spin" /> Creating...</> : presetMeta ? <><Settings2 size={18} /> {presetMeta.createLabel}</> : <><Settings2 size={18} /> Create Configurable Product</>}
      </button>
    </form>
  );
}

type ConfigurablePresetMeta = {
  title: string;
  description: string;
  button: string;
  icon: "milk" | "cafe" | "restaurant";
  nameLabel: string;
  namePlaceholder: string;
  skuPlaceholder: string;
  optionsTitle: string;
  optionsDescription: string;
  createLabel: string;
};

function configurablePresetMeta(businessType: string): ConfigurablePresetMeta | null {
  if (businessType === "milk_tea") {
    return {
      title: "Milk Tea quick setup",
      description: "Start with Size, Sugar, Ice, Milk and Toppings. You can change every option and extra price before saving.",
      button: "Load Milk Tea Template",
      icon: "milk",
      nameLabel: "Drink name",
      namePlaceholder: "Brown Sugar Pearl Milk Tea",
      skuPlaceholder: "MILKTEA-001",
      optionsTitle: "Drink options",
      optionsDescription: "Control cup size, sweetness, ice, milk and add-ons.",
      createLabel: "Create Drink",
    };
  }

  if (businessType === "cafe") {
    return {
      title: "Cafe quick setup",
      description: "Start with Size, Temperature, Milk and Extras for coffee and cafe items. Edit any option before saving.",
      button: "Load Cafe Template",
      icon: "cafe",
      nameLabel: "Cafe item name",
      namePlaceholder: "Iced Cafe Latte",
      skuPlaceholder: "CAFE-001",
      optionsTitle: "Cafe options",
      optionsDescription: "Control size, hot/iced choice, milk and extras.",
      createLabel: "Create Cafe Item",
    };
  }

  if (businessType === "restaurant") {
    return {
      title: "Restaurant quick setup",
      description: "Start with Portion, Spice Level, Preparation and Extras for menu ordering. Edit any option before saving.",
      button: "Load Restaurant Template",
      icon: "restaurant",
      nameLabel: "Menu item name",
      namePlaceholder: "Grilled Chicken Rice",
      skuPlaceholder: "MENU-001",
      optionsTitle: "Menu options",
      optionsDescription: "Control portions, preparation choices and paid extras.",
      createLabel: "Create Menu Item",
    };
  }

  return null;
}

function configurableTemplate(businessType: string): GroupRow[] {
  if (businessType === "milk_tea") return milkTeaTemplate();
  if (businessType === "cafe") return cafeTemplate();
  if (businessType === "restaurant") return restaurantTemplate();
  return [newGroup()];
}

function makeTemplateOption(name: string, priceAdjustment = "0", isDefault = false): OptionRow {
  return { id: crypto.randomUUID(), name, priceAdjustment, isDefault };
}

function makeTemplateGroup(
  name: string,
  options: OptionRow[],
  config: Partial<Pick<GroupRow, "selectionType" | "isRequired" | "minSelections" | "maxSelections">> = {},
): GroupRow {
  return {
    id: crypto.randomUUID(),
    name,
    selectionType: config.selectionType ?? "single",
    isRequired: config.isRequired ?? true,
    minSelections: config.minSelections ?? "1",
    maxSelections: config.maxSelections ?? "1",
    options,
  };
}

function milkTeaTemplate(): GroupRow[] {
  return [
    makeTemplateGroup("Size", [
      makeTemplateOption("M", "0", true),
      makeTemplateOption("L", "0.50"),
    ]),
    makeTemplateGroup("Sugar", [
      makeTemplateOption("0%"),
      makeTemplateOption("25%"),
      makeTemplateOption("50%"),
      makeTemplateOption("75%"),
      makeTemplateOption("100%", "0", true),
    ]),
    makeTemplateGroup("Ice", [
      makeTemplateOption("No ice"),
      makeTemplateOption("Less ice"),
      makeTemplateOption("Normal ice", "0", true),
      makeTemplateOption("Extra ice"),
    ]),
    makeTemplateGroup("Milk", [
      makeTemplateOption("Regular milk", "0", true),
      makeTemplateOption("Fresh milk", "0.50"),
      makeTemplateOption("Oat milk", "0.75"),
    ]),
    makeTemplateGroup(
      "Toppings",
      [
        makeTemplateOption("Pearl", "0.50"),
        makeTemplateOption("Grass jelly", "0.50"),
        makeTemplateOption("Pudding", "0.50"),
        makeTemplateOption("Cheese foam", "0.75"),
        makeTemplateOption("Coffee jelly", "0.50"),
      ],
      { selectionType: "multiple", isRequired: false, minSelections: "0", maxSelections: "5" },
    ),
  ];
}

function cafeTemplate(): GroupRow[] {
  return [
    makeTemplateGroup("Size", [
      makeTemplateOption("Small"),
      makeTemplateOption("Medium", "0", true),
      makeTemplateOption("Large", "0.50"),
    ]),
    makeTemplateGroup("Temperature", [
      makeTemplateOption("Hot", "0", true),
      makeTemplateOption("Iced"),
    ]),
    makeTemplateGroup("Milk", [
      makeTemplateOption("Regular milk", "0", true),
      makeTemplateOption("Fresh milk", "0.50"),
      makeTemplateOption("Oat milk", "0.75"),
    ]),
    makeTemplateGroup(
      "Extras",
      [
        makeTemplateOption("Extra espresso shot", "0.75"),
        makeTemplateOption("Whipped cream", "0.50"),
        makeTemplateOption("Vanilla syrup", "0.50"),
      ],
      { selectionType: "multiple", isRequired: false, minSelections: "0", maxSelections: "3" },
    ),
  ];
}

function restaurantTemplate(): GroupRow[] {
  return [
    makeTemplateGroup("Portion", [
      makeTemplateOption("Regular", "0", true),
      makeTemplateOption("Large", "1.50"),
    ]),
    makeTemplateGroup("Spice level", [
      makeTemplateOption("Mild"),
      makeTemplateOption("Medium", "0", true),
      makeTemplateOption("Hot"),
    ]),
    makeTemplateGroup("Preparation", [
      makeTemplateOption("Standard", "0", true),
      makeTemplateOption("No onion"),
      makeTemplateOption("No garlic"),
    ]),
    makeTemplateGroup(
      "Extras",
      [
        makeTemplateOption("Extra egg", "0.75"),
        makeTemplateOption("Extra meat", "1.50"),
        makeTemplateOption("Extra cheese", "0.75"),
      ],
      { selectionType: "multiple", isRequired: false, minSelections: "0", maxSelections: "3" },
    ),
  ];
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
