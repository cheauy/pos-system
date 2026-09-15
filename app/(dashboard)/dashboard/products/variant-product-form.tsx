"use client";

import {
  Loader2,
  PackagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useMemo,
  useState,
  useTransition,
} from "react";

type VariantRow = {
  id: string;
  size: string;
  colour: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  stockQuantity: string;
  lowStockQuantity: string;
};

function createVariant(): VariantRow {
  return {
    id: crypto.randomUUID(),
    size: "",
    colour: "",
    sku: "",
    costPrice: "0",
    sellingPrice: "0",
    stockQuantity: "0",
    lowStockQuantity: "5",
  };
}

export default function VariantProductForm() {
  const [isPending, startTransition] =
    useTransition();

  const [productName, setProductName] =
    useState("");

  const [categoryId, setCategoryId] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [variants, setVariants] =
    useState<VariantRow[]>([
      createVariant(),
    ]);

  const totalStock = useMemo(
    () =>
      variants.reduce(
        (total, variant) =>
          total +
          Number(
            variant.stockQuantity || 0,
          ),
        0,
      ),
    [variants],
  );

  function updateVariant(
    id: string,
    field: keyof Omit<
      VariantRow,
      "id"
    >,
    value: string,
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id
          ? {
              ...variant,
              [field]: value,
            }
          : variant,
      ),
    );
  }

  function removeVariant(id: string) {
    setVariants((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter(
        (variant) =>
          variant.id !== id,
      );
    });
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    startTransition(async () => {
      const formData = new FormData();

      formData.set(
        "name",
        productName,
      );

      formData.set(
        "categoryId",
        categoryId,
      );

      formData.set(
        "description",
        description,
      );

      formData.set(
        "variants",
        JSON.stringify(
          variants.map((variant) => ({
            size: variant.size.trim(),
            colour:
              variant.colour.trim(),
            sku: variant.sku.trim(),
            costPrice: Number(
              variant.costPrice,
            ),
            sellingPrice: Number(
              variant.sellingPrice,
            ),
            stockQuantity: Number(
              variant.stockQuantity,
            ),
            lowStockQuantity: Number(
              variant.lowStockQuantity,
            ),
          })),
        ),
      );

      // Replace with your server action.
      // await createVariantProduct(formData);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <PackagePlus size={22} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Add Variant Product
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Create one product with
              multiple sizes, colours,
              prices and stock levels.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-700">
              Product name
            </label>

            <input
              value={productName}
              onChange={(event) =>
                setProductName(
                  event.target.value,
                )
              }
              required
              placeholder="Example: Classic T-Shirt"
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Category
            </label>

            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(
                  event.target.value,
                )
              }
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">
                No category
              </option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-700">
            Description
          </label>

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value,
              )
            }
            rows={3}
            placeholder="Optional product description"
            className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Product Variants
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Total stock:{" "}
              <strong>
                {totalStock}
              </strong>
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setVariants((current) => [
                ...current,
                createVariant(),
              ])
            }
            className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Plus size={17} />
            Add Variant
          </button>
        </div>

        <div className="space-y-4 p-6">
          {variants.map(
            (variant, index) => (
              <div
                key={variant.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">
                    Variant {index + 1}
                  </p>

                  <button
                    type="button"
                    disabled={
                      variants.length === 1
                    }
                    onClick={() =>
                      removeVariant(
                        variant.id,
                      )
                    }
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <VariantInput
                    label="Size"
                    value={variant.size}
                    placeholder="S, M, L"
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "size",
                        value,
                      )
                    }
                  />

                  <VariantInput
                    label="Colour"
                    value={variant.colour}
                    placeholder="Black"
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "colour",
                        value,
                      )
                    }
                  />

                  <VariantInput
                    label="SKU"
                    value={variant.sku}
                    placeholder="TS-BLK-M"
                    required
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "sku",
                        value,
                      )
                    }
                  />

                  <VariantInput
                    label="Stock"
                    value={
                      variant.stockQuantity
                    }
                    type="number"
                    min="0"
                    required
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "stockQuantity",
                        value,
                      )
                    }
                  />

                  <VariantInput
                    label="Cost price"
                    value={
                      variant.costPrice
                    }
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "costPrice",
                        value,
                      )
                    }
                  />

                  <VariantInput
                    label="Selling price"
                    value={
                      variant.sellingPrice
                    }
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "sellingPrice",
                        value,
                      )
                    }
                  />

                  <VariantInput
                    label="Low-stock alert"
                    value={
                      variant.lowStockQuantity
                    }
                    type="number"
                    min="0"
                    required
                    onChange={(value) =>
                      updateVariant(
                        variant.id,
                        "lowStockQuantity",
                        value,
                      )
                    }
                  />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2
              size={18}
              className="animate-spin"
            />
            Creating Product...
          </>
        ) : (
          <>
            <PackagePlus size={18} />
            Create Variant Product
          </>
        )}
      </button>
    </form>
  );
}

type VariantInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  required?: boolean;
  onChange: (value: string) => void;
};

function VariantInput({
  label,
  value,
  placeholder,
  type = "text",
  min,
  step,
  required,
  onChange,
}: VariantInputProps) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-700">
        {label}
      </label>

      <input
        type={type}
        value={value}
        min={min}
        step={step}
        required={required}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}