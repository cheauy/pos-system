import { Package } from "lucide-react";

import { updateProductMode } from
  "@/app/(dashboard)/dashboard/settings/business/actions";
import type {
  ProductMode,
} from "@/lib/business/types";

type Props = {
  currentMode: ProductMode;
};

export default function ProductModeForm({
  currentMode,
}: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
          <Package size={22} />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Product Type
          </h2>

          <p className="text-sm text-slate-500">
            Select how products work for this business
          </p>
        </div>
      </div>

      <form
        action={updateProductMode}
        className="mt-6 space-y-3"
      >
        <ProductModeOption
          value="standard"
          title="Standard Mode"
          description="One product has one price, SKU and stock quantity."
          defaultChecked={
            currentMode === "standard"
          }
        />

        <ProductModeOption
          value="variant"
          title="Variant Mode"
          description="Products can have variants such as size and colour."
          defaultChecked={
            currentMode === "variant"
          }
        />

        <ProductModeOption
          value="configurable"
          title="Configurable Mode"
          description="Products can have configurable options and combinations."
          defaultChecked={
            currentMode === "configurable"
          }
        />

        <button
          type="submit"
          className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-700"
        >
          Save Product Type
        </button>
      </form>
    </section>
  );
}

function ProductModeOption({
  value,
  title,
  description,
  defaultChecked,
}: {
  value: ProductMode;
  title: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-violet-300 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50">
      <input
        type="radio"
        name="productMode"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-violet-600"
      />

      <span>
        <span className="block font-semibold text-slate-900">
          {title}
        </span>

        <span className="mt-1 block text-sm leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}