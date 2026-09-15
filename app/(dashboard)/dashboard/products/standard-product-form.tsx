"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import ImageUpload from "@/components/image-upload";
import {
  createProduct,
  type CreateProductState,
} from "./actions";

type Category = {
  id: string;
  name: string;
};

const initialState: CreateProductState = {
  success: false,
  message: "",
};

export default function StandardProductForm({
  categories,
}: {
  categories: Category[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] =
    useActionState(createProduct, initialState);

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
    } else {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-6 space-y-5"
    >
      <div>
        <label
          htmlFor="name"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Product name
        </label>

        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          placeholder="Example: Coca-Cola 330ml"
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="categoryId"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Category
        </label>

        <select
          id="categoryId"
          name="categoryId"
          defaultValue=""
          className={inputClass}
        >
          <option value="">No category</option>

          {categories.map((category) => (
            <option
              key={category.id}
              value={category.id}
            >
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="sku"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            SKU
          </label>

          <input
            id="sku"
            name="sku"
            type="text"
            required
            placeholder="DRINK-001"
            className={inputClass}
          />
        </div>

        <ImageUpload />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="costPrice"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Cost price
          </label>

          <input
            id="costPrice"
            name="costPrice"
            type="number"
            required
            min="0"
            step="0.01"
            defaultValue="0"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="sellingPrice"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Selling price
          </label>

          <input
            id="sellingPrice"
            name="sellingPrice"
            type="number"
            required
            min="0"
            step="0.01"
            defaultValue="0"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="stockQuantity"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Stock quantity
          </label>

          <input
            id="stockQuantity"
            name="stockQuantity"
            type="number"
            required
            min="0"
            step="1"
            defaultValue="0"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="lowStockQuantity"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Low-stock alert
          </label>

          <input
            id="lowStockQuantity"
            name="lowStockQuantity"
            type="number"
            required
            min="0"
            step="1"
            defaultValue="5"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Description
        </label>

        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Optional product description"
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding product..." : "Add Product"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";