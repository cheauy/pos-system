import {
  Building2,
  ExternalLink,
  Package,
  Store,
} from "lucide-react";

import {
  requirePermission,
} from "@/lib/auth/require-permission";
import {
  updateProductMode,
  updateStoreAddress,
} from "./actions";
import {
  getRootDomain,
  getSubdomainUrl,
} from "@/lib/tenancy/domain";

export default async function BusinessSettingsPage() {
  const business =
    await requirePermission(
      "business.view",
    );

  const canChangeProductMode =
    business.role === "owner";

  return (
    <main>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <Building2 size={24} />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Business Settings
            </h1>

            <p className="mt-1 text-slate-500">
              Manage {business.name}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Store size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Tenh POS Store Address
              </h2>
              <p className="text-sm text-slate-500">
                Your public store and tenant dashboard use this address.
              </p>
            </div>
          </div>

          <form
            action={updateStoreAddress}
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="subdomain"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Store address
              </label>

              <div className="flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                <input
                  id="subdomain"
                  name="subdomain"
                  defaultValue={business.slug}
                  required
                  minLength={2}
                  maxLength={40}
                  disabled={!canChangeProductMode}
                  className="min-w-0 flex-1 px-4 py-3 text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />

                <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
                  .{getRootDomain()}
                </span>
              </div>
            </div>

            <a
              href={getSubdomainUrl(business.slug)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Open public store
              <ExternalLink size={15} />
            </a>

            {canChangeProductMode ? (
              <button
                type="submit"
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Save Store Address
              </button>
            ) : (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
                Only the business owner can change the store address.
              </p>
            )}
          </form>
        </section>

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
              Select how products are managed
            </p>
          </div>
        </div>

        <form
          action={updateProductMode}
          className="mt-6 space-y-3"
        >
          <ProductModeOption
            value="standard"
            title="Standard Products"
            description="Each product has one price and one stock quantity."
            defaultChecked={
              business.productMode ===
              "standard"
            }
            disabled={
              !canChangeProductMode
            }
          />

          <ProductModeOption
            value="variant"
            title="Variant Products"
            description="Products contain variations such as size and colour."
            defaultChecked={
              business.productMode ===
              "variant"
            }
            disabled={
              !canChangeProductMode
            }
          />

          <ProductModeOption
            value="configurable"
            title="Configurable Products"
            description="Products use configurable options and generated combinations."
            defaultChecked={
              business.productMode ===
              "configurable"
            }
            disabled={
              !canChangeProductMode
            }
          />

          {canChangeProductMode ? (
            <button
              type="submit"
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Save Product Type
            </button>
          ) : (
            <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
              Only the business owner can
              change the product type.
            </p>
          )}
        </form>
        </section>
      </div>
    </main>
  );
}

function ProductModeOption({
  value,
  title,
  description,
  defaultChecked,
  disabled,
}: {
  value: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
      <input
        type="radio"
        name="productMode"
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1 h-4 w-4"
      />

      <span>
        <span className="block font-semibold text-slate-900">
          {title}
        </span>

        <span className="mt-1 block text-sm leading-6 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}