"use client";

import { Package, Plus, Settings2, Shirt, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from 'next/dynamic';

import { getProductExperience } from "@/lib/business/product-experience";
import type { ProductMode } from "@/lib/business/types";
const loading = () => <p role="status" className="py-8 text-center text-sm text-slate-500">Loading product form…</p>;
const ConfigurableProductForm = dynamic(() => import('./configurable-product-form'), { loading });
const StandardProductForm = dynamic(() => import('./standard-product-form'), { loading });
const VariantProductForm = dynamic(() => import('./variant-product-form'), { loading });

type Category = {
  id: string;
  name: string;
};

type CreateKind = "simple" | "variants";

export default function AddProductModal({
  categories,
  branches,
  businessType,
  productMode,
}: {
  categories: Category[];
  branches: { id: string; name: string }[];
  businessType: string;
  productMode: ProductMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>("simple");
  const isGeneralShop = businessType === "general" && productMode === "standard";
  const experience = useMemo(() => getProductExperience(businessType), [businessType]);

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

  const icon =
    businessType === "fashion" || businessType === "shoes" ? (
      <Shirt size={20} />
    ) : productMode === "configurable" ? (
      <Settings2 size={20} />
    ) : isGeneralShop && createKind === "variants" ? (
      <SlidersHorizontal size={20} />
    ) : (
      <Package size={20} />
    );

  const modalTitle =
    businessType === "fashion"
      ? "Add Product"
      : experience.formTitle || "Add Product";

  const description = isGeneralShop
    ? createKind === "simple"
      ? "Create a regular retail product with barcode, pricing and stock."
      : "Create one product with multiple options, SKUs, prices and stock levels."
    : experience.formDescription;

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
          aria-labelledby="add-product-title"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="add-product-title" className="text-lg font-bold text-slate-950">
                      {modalTitle}
                    </h2>
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {experience.modeLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
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

            {isGeneralShop && (
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
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {isGeneralShop ? (
                createKind === "simple" ? (
                  <StandardProductForm
                    categories={categories}
                    branches={branches}
                    businessType={businessType}
                    generalShop
                    onCreated={handleCreated}
                  />
                ) : (
                  <VariantProductForm
                    categories={categories}
                    branches={branches}
                    businessType={businessType}
                    onCreated={handleCreated}
                  />
                )
              ) : productMode === "variant" ? (
                <VariantProductForm
                  categories={categories}
                  branches={branches}
                  businessType={businessType}
                  onCreated={handleCreated}
                />
              ) : productMode === "configurable" ? (
                <ConfigurableProductForm
                  categories={categories}
                  branches={branches}
                  businessType={businessType}
                  onCreated={handleCreated}
                />
              ) : (
                <StandardProductForm
                  categories={categories}
                  branches={branches}
                  businessType={businessType}
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
