"use client";

import { Package, Plus, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import StandardProductForm from "./standard-product-form";
import VariantProductForm from "./variant-product-form";

type Category = {
  id: string;
  name: string;
};

type CreateKind = "simple" | "variants";

export default function AddGeneralProductModal({
  categories,
  branches,
}: {
  categories: Category[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>("simple");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleCreated = useCallback(() => {
    setOpen(false);
    setCreateKind("simple");
    router.refresh();
  }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        <Plus size={17} />
        Add Product
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-[2px] sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-general-product-title"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  {createKind === "simple" ? <Package size={20} /> : <SlidersHorizontal size={20} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="add-general-product-title" className="text-lg font-bold text-slate-950">
                      Add Product
                    </h2>
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      General Shop
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {createKind === "simple"
                      ? "Create a regular retail product with barcode, pricing and stock."
                      : "Create one product with multiple options, SKUs, prices and stock levels."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                aria-label="Close Add Product"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setCreateKind("simple")}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    createKind === "simple"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Simple product
                </button>
                <button
                  type="button"
                  onClick={() => setCreateKind("variants")}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    createKind === "variants"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Product with variants
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {createKind === "simple" ? (
                <StandardProductForm
                  categories={categories}
                  branches={branches}
                  businessType="general"
                  generalShop
                  onCreated={handleCreated}
                />
              ) : (
                <VariantProductForm
                  categories={categories}
                  branches={branches}
                  businessType="general"
                  onCreated={handleCreated}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
