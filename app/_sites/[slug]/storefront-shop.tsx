"use client";

import {
  Check,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KhqrPreview } from "./image-viewer";
import { rememberOrder } from "@/lib/storefront/order-tracking";
import StorefrontHero, { type StorefrontBrand } from "./storefront-hero";
import { useStorefrontLanguage } from "./storefront-language";
import { validateCheckoutContact, validateCheckoutEmail } from "@/lib/storefront/checkout-validation";
import { toast } from "sonner";
import ProductGallery from "./product-gallery";
import StorefrontCatalog from "./storefront-catalog";
import { restoreCart, type CartItem } from "@/lib/storefront/cart";

import type {
  StorefrontCatalogCategory,
  StorefrontCatalogProduct,
  StorefrontCatalogVariant,
} from "@/lib/storefront/catalog-types";

type StorefrontCheckoutSettings = {
  businessType: string;
  currency: string;
  primaryColor: string;
  orderingEnabled: boolean;
  allowPickup: boolean;
  allowDelivery: boolean;
  allowDineIn: boolean;
  minimumOrder: number;
  deliveryFee: number;
  checkoutMessage: string | null;
  acceptCod: boolean;
  acceptKhqr: boolean;
  khqrImageUrl: string | null;
  khqrAccountName: string | null;
  khqrInstructions: string | null;
  allowScheduledOrders: boolean;
  minScheduleLeadMinutes: number;
  maxScheduleDays: number;
  couponsEnabled: boolean;
  loyaltyEnabled: boolean;
  loyaltySpendPerPoint: number;
  loyaltyMinimumOrder: number;
  deliveryZones: Array<{
    id: string;
    name: string;
    fee: number;
    minimumOrder: number;
  }>;
};

export default function StorefrontShop({
  brand,
  slug,
  categories,
  products,
  settings,
  tableToken,
}: {
  brand: StorefrontBrand;
  slug: string;
  categories: StorefrontCatalogCategory[];
  products: StorefrontCatalogProduct[];
  settings: StorefrontCheckoutSettings;
  tableToken: string | null;
}) {
  const { t } = useStorefrontLanguage();
  const storageKey = `tenh-cart:${slug}`;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<StorefrontCatalogProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [initialVariantId, setInitialVariantId] = useState<string | undefined>();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        setCart(restoreCart(raw ? JSON.parse(raw) : [], products));
      } catch {
        setCart([]);
      } finally {
        setHydrated(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey, products]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // Shopping still works when the browser blocks persistent storage.
    }
  }, [cart, hydrated, storageKey]);

  const cartQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const subtotal = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  function addConfiguredItem(item: CartItem) {
    setCart(current => restoreCart([...current, item], products));
    setSelectedProduct(null);
    toast.success("Added to cart");
  }

  function quickAdd(product: StorefrontCatalogProduct, variantId?: string) {
    if (!settings.orderingEnabled || product.totalStock <= 0) return;

    if (
      product.productType === "variant" ||
      product.productType === "configurable" ||
      product.optionGroups.length > 0
    ) {
      setInitialVariantId(variantId);
      setSelectedProduct(product);
      return;
    }

    const variant = product.variants[0];
    if (!variant) return;

    addConfiguredItem(
      makeCartItem(product, variant, [], [], variant.sellingPrice),
    );
  }

  return (
    <>
      <StorefrontHero slug={slug} brand={brand} cartQuantity={cartQuantity} onOpenCart={() => setCartOpen(true)} />
      <StorefrontCatalog products={products} categories={categories} settings={settings} onAdd={quickAdd} onQuickView={(product, variantId) => { setInitialVariantId(variantId); setSelectedProduct(product); }} />

      {settings.orderingEnabled && cartQuantity > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 left-1/2 z-40 flex w-[min(92vw,34rem)] -translate-x-1/2 items-center justify-between rounded-2xl px-5 py-4 text-white shadow-2xl"
          style={{ backgroundColor: "var(--store-primary-surface)", color: "var(--store-on-primary)" }}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <ShoppingCart size={20} />
            {cartQuantity} {t(cartQuantity === 1 ? "item" : "items")}
          </span>
          <span className="font-bold">
            {formatMoney(subtotal, settings.currency)}
          </span>
        </button>
      )}

      {selectedProduct && (
        <ProductConfigurator
          canOrder={settings.orderingEnabled}
          product={selectedProduct}
          initialVariantId={initialVariantId}
          cart={cart}
          businessType={settings.businessType}
          currency={settings.currency}
          onClose={() => setSelectedProduct(null)}
          onAdd={addConfiguredItem}
        />
      )}

      {cartOpen && (
        <CartDrawer
          slug={slug}
          cart={cart}
          setCart={setCart}
          settings={settings}
          tableToken={tableToken}
          onClose={() => setCartOpen(false)}
        />
      )}
    </>
  );
}

function ProductConfigurator({
  canOrder,
  product,
  initialVariantId,
  cart,
  businessType,
  currency,
  onClose,
  onAdd,
}: {
  canOrder: boolean;
  product: StorefrontCatalogProduct;
  initialVariantId?: string;
  cart: CartItem[];
  businessType: string;
  currency: string;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  const { t } = useStorefrontLanguage();
  const isShoeProduct =
    (businessType === "shoes" || businessType === "fashion") && product.productType === "variant";
  const isFashionProduct = businessType === "fashion" && product.productType === "variant";
  const isMilkTeaProduct =
    businessType === "milk_tea" && product.productType === "configurable";
  const initialVariant =
    product.variants.find(variant => variant.id === initialVariantId) ??
    product.variants.find((variant) => variant.stockQuantity > 0) ??
    product.variants[0];
  const [variantId, setVariantId] = useState(initialVariant?.id ?? "");
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const group of product.optionGroups) {
      const defaults = group.options
        .filter((option) => option.isDefault)
        .map((option) => option.id);
      initial[group.id] = defaults.slice(0, group.maxSelections);
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);

  const variant =
    product.variants.find((row) => row.id === variantId) ?? initialVariant;
  const remainingStock = Math.max(0, (variant?.stockQuantity ?? 0) - cart.filter(item => item.productId === variant?.id).reduce((sum, item) => sum + item.quantity, 0));

  const shoeColors = useMemo(() => {
    if (!isShoeProduct) return [];
    return Array.from(
      new Set(
        product.variants
          .map((row) => row.color?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [isShoeProduct, product.variants]);

  const selectedColor = variant?.color?.trim() ?? shoeColors[0] ?? "";
  const shoeSizeRows = useMemo(() => {
    if (!isShoeProduct) return [];
    const rows = product.variants.filter(
      (row) => (row.color?.trim() ?? "") === selectedColor,
    );
    return rows.sort((a, b) =>
      (a.size ?? "").localeCompare(b.size ?? "", undefined, { numeric: true }),
    );
  }, [isShoeProduct, product.variants, selectedColor]);

  const selectedOptions = product.optionGroups.flatMap((group) =>
    group.options.filter((option) =>
      (selections[group.id] ?? []).includes(option.id),
    ),
  );
  const optionTotal = selectedOptions.reduce(
    (sum, option) => sum + option.priceAdjustment,
    0,
  );
  const unitPrice =
    Number(variant?.sellingPrice ?? product.priceFrom) + optionTotal;
  const valid = Boolean(variant) && product.optionGroups.every((group) => {
    const count = (selections[group.id] ?? []).length;
    return (
      count >= group.minSelections &&
      count <= group.maxSelections &&
      (!group.isRequired || count > 0)
    );
  });

  function chooseVariant(nextVariant: StorefrontCatalogVariant) {
    setVariantId(nextVariant.id);
    setQuantity(1);
  }

  function chooseShoeColor(color: string) {
    const preferredSize = variant?.size ?? null;
    const sameSize = product.variants.find(
      (row) =>
        row.color?.trim() === color &&
        row.size === preferredSize &&
        row.stockQuantity > 0,
    );
    const firstAvailable = product.variants.find(
      (row) => row.color?.trim() === color && row.stockQuantity > 0,
    );
    const fallback = product.variants.find(
      (row) => row.color?.trim() === color,
    );
    const nextVariant = sameSize ?? firstAvailable ?? fallback;
    if (nextVariant) chooseVariant(nextVariant);
  }

  function toggleOption(
    groupId: string,
    optionId: string,
    single: boolean,
    max: number,
  ) {
    setSelections((current) => {
      const selected = current[groupId] ?? [];
      if (single) return { ...current, [groupId]: [optionId] };
      if (selected.includes(optionId)) {
        return {
          ...current,
          [groupId]: selected.filter((id) => id !== optionId),
        };
      }
      if (selected.length >= max) return current;
      return { ...current, [groupId]: [...selected, optionId] };
    });
  }

  if (!variant) return null;

  const variantLabel = isShoeProduct
    ? [variant.color, variant.size ? `${isFashionProduct ? t("Size") : "EU"} ${variant.size}` : null]
        .filter(Boolean)
        .join(" / ") || null
    : [variant.color, variant.size].filter(Boolean).join(" / ") || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={product.name} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{product.name}</h2>
            {product.preorderVariantIds?.includes(variant.id) && <span className="mt-2 inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{t("Pre-order")}</span>}
            <p className="mt-1 text-sm text-slate-500">
              {isShoeProduct
                ? "Choose colour and size. Stock is checked for the exact pair."
                : isMilkTeaProduct
                  ? "Build your drink — choose size, sweetness, ice, milk and toppings."
                  : "Choose options before adding to cart."}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("Close")}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {product.description && <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{product.description}</p>}
          <ProductGallery key={`${product.key}:${variant.imageUrl ?? product.imageUrl ?? ""}`} name={product.name} images={[...new Set([variant.imageUrl, product.imageUrl, ...(product.images ?? []), ...product.variants.map(row => row.imageUrl)].filter((url): url is string => Boolean(url)))]} />

          {product.productType === "variant" && isShoeProduct && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{t("Colour")}</p>
                  <span className="text-xs text-slate-400">{selectedColor || "Choose"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shoeColors.map((color) => {
                    const colorRows = product.variants.filter(
                      (row) => row.color?.trim() === color,
                    );
                    const available = colorRows.some(
                      (row) => row.stockQuantity > 0,
                    );
                    const active = color === selectedColor;
                    return (
                      <button
                        key={color}
                        type="button"
                        disabled={!available}
                        onClick={() => chooseShoeColor(color)}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          active
                            ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] text-[var(--store-primary-ink)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{t("Size")}</p>
                  <span className="text-xs text-slate-400">
                    {variant.size ? `${isFashionProduct ? t("Size") : "EU"} ${variant.size}` : "Choose"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {shoeSizeRows.map((row) => {
                    const active = row.id === variant.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        disabled={row.stockQuantity <= 0}
                        onClick={() => chooseVariant(row)}
                        className={`rounded-xl border px-2 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300 ${
                          active
                            ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] text-[var(--store-primary-ink)]"
                            : "border-slate-200 text-slate-800 hover:border-slate-300"
                        }`}
                      >
                        {row.size || "—"}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs">
                  <span className="text-slate-500">{t("Selected")}</span>
                  <span className="font-semibold text-slate-800">
                    {variantLabel} · {remainingStock} available to add
                  </span>
                </div>
              </div>
            </div>
          )}

          {product.productType === "variant" && !isShoeProduct && (
            <div>
              <p className="text-sm font-semibold text-slate-800">{t("Variant")}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {product.variants.map((row) => {
                  const label =
                    [row.color, row.size].filter(Boolean).join(" / ") ||
                    row.sku ||
                    "Option";
                  const active = row.id === variant.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={row.stockQuantity <= 0}
                      onClick={() => chooseVariant(row)}
                      className={`rounded-xl border p-3 text-left text-sm transition disabled:opacity-40 ${
                        active
                          ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)]"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className="font-semibold text-slate-900">{label}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {formatMoney(row.sellingPrice, currency)} · {row.stockQuantity} stock
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {product.optionGroups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                <span className="text-xs text-slate-400">
                  {group.selectionType === "single"
                    ? "Choose one"
                    : `Choose up to ${group.maxSelections}`}
                </span>
              </div>
              <div className={isMilkTeaProduct && group.selectionType === "single" ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" : "mt-3 space-y-2"}>
                {group.options.map((option) => {
                  const active = (selections[group.id] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        toggleOption(
                          group.id,
                          option.id,
                          group.selectionType === "single",
                          group.maxSelections,
                        )
                      }
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                        active
                          ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] ring-1 ring-[var(--store-primary-soft)]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      } ${isMilkTeaProduct && group.selectionType === "single" ? "min-h-14" : ""}`}
                    >
                      <span className="flex items-center gap-2 font-medium text-slate-900">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            active
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-slate-300"
                          }`}
                        >
                          {active && <Check size={13} />}
                        </span>
                        {option.name}
                      </span>
                      <span className="text-slate-500">
                        {option.priceAdjustment > 0
                          ? `+${formatMoney(option.priceAdjustment, currency)}`
                          : "Included"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <div>
              <p className="text-xs text-slate-500">{t("Quantity")}</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="rounded-lg border border-slate-300 bg-white p-2"
                >
                  <Minus size={15} />
                </button>
                <span className="w-8 text-center font-semibold">{quantity}</span>
                <button
                  type="button"
                  disabled={quantity >= Math.min(999, remainingStock)}
                  onClick={() =>
                    setQuantity((value) =>
                      Math.min(999, remainingStock, value + 1),
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white p-2"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <p className="text-xl font-bold" style={{ color: "var(--store-primary-ink)" }}>
              {formatMoney(unitPrice * quantity, currency)}
            </p>
          </div>

          <button
            type="button"
            disabled={!canOrder || !valid || remainingStock <= 0 || quantity > remainingStock}
            onClick={() => {
              const optionIds = selectedOptions.map((option) => option.id).sort();
              onAdd({
                ...makeCartItem(
                  product,
                  variant,
                  optionIds,
                  selectedOptions.map((option) => option.name),
                  unitPrice,
                ),
                variantLabel,
                quantity,
              });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--store-primary-surface)", color: "var(--store-on-primary)" }}
          >
            <ShoppingCart size={18} /> {t("Add to Order")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({
  slug,
  cart,
  setCart,
  settings,
  tableToken,
  onClose,
}: {
  slug: string;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  settings: StorefrontCheckoutSettings;
  tableToken: string | null;
  onClose: () => void;
}) {
  const { t } = useStorefrontLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setScheduleNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [message, setMessage] = useState<string | null>(null);

  const allowed = [
    settings.allowPickup ? "pickup" : null,
    settings.allowDelivery ? "delivery" : null,
    settings.allowDineIn && tableToken ? "dine_in" : null,
  ].filter((value): value is string => Boolean(value));

  const [fulfillment, setFulfillment] = useState<string>(
    tableToken && settings.allowDineIn ? "dine_in" : allowed[0] ?? "pickup",
  );

  const paymentOptions = [
    settings.acceptCod ? "cod" : null,
    settings.acceptKhqr && settings.khqrImageUrl ? "khqr" : null,
  ].filter((value): value is "cod" | "khqr" => Boolean(value));

  const [paymentMethod, setPaymentMethod] = useState<"cod" | "khqr">(
    paymentOptions[0] ?? "cod",
  );
  const [deliveryZoneId, setDeliveryZoneId] = useState(
    settings.deliveryZones[0]?.id ?? "",
  );
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    discount: number;
    subtotal: number;
    contextKey: string;
  } | null>(null);
  const couponRequest = useRef(0);
  const latestCouponContext = useRef("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  const selectedZone =
    settings.deliveryZones.find((zone) => zone.id === deliveryZoneId) ?? null;
  const subtotal = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const couponContextKey = JSON.stringify([subtotal, cart.map(item => [item.productId, item.quantity, item.optionIds]), fulfillment === "dine_in" ? tableToken : null]);
  useEffect(() => { latestCouponContext.current = couponContextKey; }, [couponContextKey]);
  const deliveryFee =
    fulfillment === "delivery"
      ? selectedZone?.fee ?? settings.deliveryFee
      : 0;
  const effectiveMinimum =
    fulfillment === "delivery"
      ? Math.max(settings.minimumOrder, selectedZone?.minimumOrder ?? 0)
      : settings.minimumOrder;
  const couponStale = Boolean(coupon && coupon.contextKey !== couponContextKey);
  const couponPending = couponChecking || couponStale;
  const couponDiscount = couponStale ? 0 : Math.min(subtotal, Math.max(0, coupon?.discount ?? 0));
  const total = Math.max(0, subtotal - couponDiscount) + deliveryFee;
  const belowMinimum = subtotal < effectiveMinimum;
  const needsZone =
    fulfillment === "delivery" && settings.deliveryZones.length > 0;
  const canSchedule =
    settings.allowScheduledOrders && fulfillment !== "dine_in" && !tableToken;
  const minSchedule = toLocalDateTimeInput(
    new Date(scheduleNow + settings.minScheduleLeadMinutes * 60_000),
  );
  const maxSchedule = toLocalDateTimeInput(
    new Date(scheduleNow + settings.maxScheduleDays * 86_400_000),
  );

  function updateQuantity(key: string, quantity: number) {
    setCart((current) =>
      current.map((item) =>
        item.key === key
          ? {
              ...item,
              quantity: Math.max(1, Math.min(999, item.maxStock - current
                .filter(row => row.productId === item.productId && row.key !== key)
                .reduce((sum, row) => sum + row.quantity, 0), quantity)),
            }
          : item,
      ),
    );
  }

  const previewCoupon = useCallback(async (codeValue: string) => {
    const requestId = ++couponRequest.current;
    const code = codeValue.trim().toUpperCase();

    if (!code) {
      setCoupon(null);
      setCouponMessage(null);
      return;
    }

    setCouponChecking(true);
    setCouponMessage(null);

    try {
      const response = await fetch(
        `/api/storefront/${encodeURIComponent(slug)}/coupon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, subtotal, items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })), tableToken: fulfillment === "dine_in" ? tableToken : null }),
        },
      );
      const payload = await response.json();
      if (requestId !== couponRequest.current) return;
      if (latestCouponContext.current !== couponContextKey) {
        setCouponMessage("Cart changed. Apply your coupon again.");
        return;
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "Coupon is not available.");
      }

      setCoupon({
        code: payload.coupon.code,
        discount: Number(payload.coupon.discount ?? 0),
        subtotal,
        contextKey: couponContextKey,
      });
      setCouponInput(payload.coupon.code);
      setCouponMessage(
        `Coupon ${payload.coupon.code} applied · save ${formatMoney(
          Number(payload.coupon.discount ?? 0),
          settings.currency,
        )}.`,
      );
    } catch (error) {
      if (requestId !== couponRequest.current) return;
      setCoupon(null);
      setCouponMessage(
        error instanceof Error ? error.message : "Coupon is not available.",
      );
    } finally {
      if (requestId === couponRequest.current) setCouponChecking(false);
    }
  }, [slug, subtotal, settings.currency, cart, fulfillment, tableToken, couponContextKey]);

  useEffect(() => {
    if (!coupon?.code || coupon.contextKey === couponContextKey) return;

    const timer = window.setTimeout(() => {
      void previewCoupon(coupon.code);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [previewCoupon, coupon?.code, coupon?.contextKey, couponContextKey]);

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings.orderingEnabled || submitting || couponPending || belowMinimum || cart.length === 0) return;

    if (needsZone && !deliveryZoneId) {
      setMessage("Please select a delivery zone.");
      return;
    }

    if (paymentOptions.length === 0) {
      setMessage("This store has no online payment method enabled.");
      return;
    }

    if (scheduleMode === "scheduled" && !scheduledAt) {
      setMessage("Please choose the requested order time.");
      return;
    }

    setMessage(null);
    setSubmitting(true);

    try {
      const form = new FormData(event.currentTarget);
      const requestedFor =
        scheduleMode === "scheduled" && scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null;

      const contactError = validateCheckoutContact(form.get("guestName"), form.get("guestPhone"), fulfillment, form.get("guestAddress"));
      if (contactError) throw new Error(contactError);
      const emailError = validateCheckoutEmail(form.get("guestEmail"));
      if (emailError) throw new Error(emailError);
      const checkout = {
            items: cart.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              optionIds: item.optionIds,
            })),
            fulfillmentType: fulfillment,
            guestName: form.get("guestName"),
            guestPhone: form.get("guestPhone"),
            guestEmail: form.get("guestEmail"),
            guestAddress: form.get("guestAddress"),
            customerNote: form.get("customerNote"),
            tableToken: fulfillment === "dine_in" ? tableToken : null,
            paymentMethod,
            deliveryZoneId:
              fulfillment === "delivery" && deliveryZoneId
                ? deliveryZoneId
                : null,
            requestedFor,
            couponCode: coupon?.code ?? null,
          };
      const upload = new FormData();
      upload.set("checkout", JSON.stringify(checkout));
      if (paymentMethod === "khqr") {
        const proof = form.get("paymentProof");
        if (!(proof instanceof File) || !proof.size) throw new Error("Upload payment proof to continue.");
        if (proof.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(proof.type)) throw new Error("Payment proof must be a JPG, PNG or WebP image up to 5 MB.");
        upload.set("paymentProof", proof);
      }
      const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}/orders`, { method: "POST", body: upload });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "Unable to place order.");
      }

      setCart([]);
      try { window.localStorage.removeItem(`tenh-cart:${slug}`); } catch { /* Storage is optional. */ }
      const token = payload.order?.publicToken;
      if (typeof token === "string" && token) {
        rememberOrder(slug, token, payload.order?.orderNumber ?? "Order");
        window.location.href = `/order/${encodeURIComponent(token)}?email=${payload.emailStatus === "sent" ? "sent" : "unavailable"}`;
        return;
      }
      setMessage(
        `Order ${payload.order?.orderNumber ?? "created"} was sent successfully.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to place order.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t("Close cart")}
        onClick={onClose}
        className="absolute inset-0"
      />
      <aside className="relative h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t("Your Order")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("Review your items, choose delivery or pickup, and place your order.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-3">
            {cart.map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex justify-between gap-3">
                  {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-20 w-16 shrink-0 rounded-lg bg-slate-50 object-contain" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    {item.variantLabel && (
                      <p className="text-xs text-slate-500">{item.variantLabel}</p>
                    )}
                    {item.optionLabels.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {item.optionLabels.join(", ")}
                      </p>
                    )}
                    <p
                      className="mt-1 text-sm font-semibold"
                      style={{ color: "var(--store-primary-ink)" }}
                    >
                      {formatMoney(item.unitPrice, settings.currency)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name} from order`}
                    onClick={() =>
                      setCart((current) =>
                        current.filter((row) => row.key !== item.key),
                      )
                    }
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name} quantity`}
                      disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                      className="rounded-lg border border-slate-300 p-1.5"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name} quantity`}
                      disabled={item.quantity >= 999 || cart.filter(row => row.productId === item.productId).reduce((sum, row) => sum + row.quantity, 0) >= item.maxStock}
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                      className="rounded-lg border border-slate-300 p-1.5"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="font-bold text-slate-900">
                    {formatMoney(
                      item.unitPrice * item.quantity,
                      settings.currency,
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <PriceRow
              label={t("Subtotal")}
              value={formatMoney(subtotal, settings.currency)}
            />
            {couponDiscount > 0 && (
              <PriceRow
                label={coupon ? `Coupon · ${coupon.code}` : "Coupon"}
                value={`-${formatMoney(couponDiscount, settings.currency)}`}
              />
            )}
            {fulfillment === "delivery" && (
              <PriceRow
                label={selectedZone ? `Delivery · ${selectedZone.name}` : t("Delivery")}
                value={formatMoney(deliveryFee, settings.currency)}
              />
            )}
            <div className="mt-3 border-t border-slate-200 pt-3">
              <PriceRow
                label={t("Total")}
                value={formatMoney(total, settings.currency)}
                bold
              />
            </div>
          </div>

          {settings.couponsEnabled && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">
                {t("Coupon code")}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={couponInput}
                  onChange={(event) => {
                    couponRequest.current += 1;
                    setCouponChecking(false);
                    setCouponMessage(null);
                    setCouponInput(event.target.value.toUpperCase());
                    if (
                      coupon &&
                      event.target.value.trim().toUpperCase() !== coupon.code
                    ) {
                      setCoupon(null);
                      setCouponMessage(null);
                    }
                  }}
                  maxLength={30}
                  placeholder={t("Enter code")}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 uppercase outline-none focus:border-[var(--store-primary)] focus:ring-4 focus:ring-[var(--store-primary-soft)]"
                />
                <button
                  type="button"
                  onClick={() => void previewCoupon(couponInput)}
                  disabled={couponChecking || !couponInput.trim()}
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--store-primary-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--store-on-primary)] disabled:opacity-50"
                >
                  {couponChecking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    t("Apply")
                  )}
                </button>
              </div>
              {couponPending && <p className="mt-2 text-xs text-slate-500" role="status">Checking discount for your current cart…</p>}
              {!couponPending && couponMessage && (
                <p
                  className={`mt-2 text-xs ${
                    coupon ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {couponMessage}
                </p>
              )}
            </div>
          )}

          {settings.loyaltyEnabled && (
            <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
              Loyalty is enabled. This order can earn points after the shop marks it completed.
            </p>
          )}

          {belowMinimum && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Minimum order is {formatMoney(effectiveMinimum, settings.currency)}
              {selectedZone ? ` for ${selectedZone.name}` : ""}.
            </p>
          )}

          <form onSubmit={submitOrder} className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">
                {t("Fulfillment")}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {allowed.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFulfillment(value);
                      if (value === "dine_in") setScheduleMode("now");
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                      fulfillment === value
                        ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] text-[var(--store-primary-ink)]"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {value === "dine_in"
                      ? t("Dine In")
                      : t(value === "pickup" ? "Pickup Store" : value.charAt(0).toUpperCase() + value.slice(1))}
                  </button>
                ))}
              </div>
            </div>

            {fulfillment === "delivery" && settings.deliveryZones.length > 0 && (
              <label className="block text-sm font-medium text-slate-700">
                {t("Delivery zone")}
                <select
                  value={deliveryZoneId}
                  onChange={(event) => setDeliveryZoneId(event.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[var(--store-primary)] focus:ring-4 focus:ring-[var(--store-primary-soft)]"
                >
                  {settings.deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} · {formatMoney(zone.fee, settings.currency)}
                    </option>
                  ))}
                </select>
                {selectedZone && selectedZone.minimumOrder > 0 && (
                  <span className="mt-1 block text-xs text-slate-500">
                    Zone minimum: {formatMoney(selectedZone.minimumOrder, settings.currency)}
                  </span>
                )}
              </label>
            )}

            {canSchedule && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">
                  {t("Order time")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("now")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                      scheduleMode === "now"
                        ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] text-[var(--store-primary-ink)]"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {t("As soon as possible")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode("scheduled")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                      scheduleMode === "scheduled"
                        ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] text-[var(--store-primary-ink)]"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {t("Schedule")}
                  </button>
                </div>
                {scheduleMode === "scheduled" && (
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    min={minSchedule}
                    max={maxSchedule}
                    required
                    className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--store-primary)] focus:ring-4 focus:ring-[var(--store-primary-soft)]"
                  />
                )}
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">
                {t("Payment")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {paymentOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethod(value)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                      paymentMethod === value
                        ? "border-[var(--store-primary)] bg-[var(--store-primary-soft)] text-[var(--store-primary-ink)]"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    {value === "khqr" ? "KHQR" : t("Cash on Delivery (COD)")}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === "khqr" && settings.khqrImageUrl && (
              <div className="rounded-2xl border border-[var(--store-primary)] bg-[var(--store-primary-soft)] p-4 text-center">
                <KhqrPreview src={settings.khqrImageUrl} />
                {settings.khqrAccountName && (
                  <p className="mt-3 font-semibold text-slate-900">
                    {settings.khqrAccountName}
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-600">
                  Pay exactly {formatMoney(total, settings.currency)}.
                </p>
                {settings.khqrInstructions && (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {settings.khqrInstructions}
                  </p>
                )}
                <label className="mt-4 block text-left text-sm font-medium text-slate-700">
                  {t("Payment proof")}
                  <input type="file" name="paymentProof" accept="image/jpeg,image/png,image/webp" required className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm" />
                  <span className="mt-1 block text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB. Required for KHQR payment.</span>
                </label>
                <p className="mt-2 text-left text-xs text-amber-700">
                  The shop will verify the KHQR payment before marking it paid.
                </p>
              </div>
            )}

            <CheckoutInput
              name="guestName"
              label={t("Name")}
              required
              placeholder={t("Your name")}
            />
            <CheckoutInput
              name="guestPhone"
              label={t("Phone")}
              required
              placeholder={t("Phone number")}
            />
            <CheckoutInput name="guestEmail" label={t("Email")} required placeholder="you@example.com" />
            {fulfillment === "delivery" && (
              <CheckoutInput
                name="guestAddress"
                label={t("Delivery address")}
                required
                placeholder={t("Street, house, area")}
              />
            )}
            <label className="block text-sm font-medium text-slate-700">
              {t("Note")}
              <textarea
                name="customerNote"
                rows={3}
                maxLength={1000}
                placeholder={t("Optional note for the shop")}
                className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--store-primary)] focus:ring-4 focus:ring-[var(--store-primary-soft)]"
              />
            </label>

            {settings.checkoutMessage && (
              <p className="rounded-xl bg-[var(--store-primary-soft)] p-3 text-sm text-[var(--store-primary-ink)]">
                {settings.checkoutMessage}
              </p>
            )}

            {message && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={
                !settings.orderingEnabled ||
                submitting ||
                couponPending ||
                belowMinimum ||
                cart.length === 0 ||
                paymentOptions.length === 0
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: "var(--store-primary-surface)", color: "var(--store-on-primary)" }}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> {t("Sending Order...")}
                </>
              ) : (
                <>
                  <ShoppingBag size={18} /> {t("Place Order")} · {formatMoney(total, settings.currency)}
                </>
              )}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

function CheckoutInput({ name, label, required, placeholder }: { name: string; label: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      <input type={name === "guestEmail" ? "email" : name === "guestPhone" ? "tel" : "text"} autoComplete={name === "guestEmail" ? "email" : name === "guestPhone" ? "tel" : name === "guestName" ? "name" : "street-address"} maxLength={name === "guestEmail" ? 254 : undefined} name={name} required={required} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--store-primary)] focus:ring-4 focus:ring-[var(--store-primary-soft)]" />
    </label>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${bold ? "text-base font-bold text-slate-950" : "text-slate-600"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function makeCartItem(
  product: StorefrontCatalogProduct,
  variant: StorefrontCatalogVariant,
  optionIds: string[],
  optionLabels: string[],
  unitPrice: number,
): CartItem {
  const sortedIds = [...optionIds].sort();
  const variantLabel = [variant.color, variant.size].filter(Boolean).join(" / ") || null;
  return {
    key: `${variant.id}:${sortedIds.join(",")}`,
    productId: variant.id,
    name: product.name,
    variantLabel,
    optionIds: sortedIds,
    optionLabels,
    unitPrice,
    quantity: 1,
    maxStock: variant.stockQuantity,
    imageUrl: variant.imageUrl ?? product.imageUrl,
  };
}

function toLocalDateTimeInput(value: Date) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "KHR" ? 0 : 2,
      maximumFractionDigits: currency === "KHR" ? 0 : 2,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}
