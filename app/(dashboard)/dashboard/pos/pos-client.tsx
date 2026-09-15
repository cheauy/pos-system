"use client";

import {
  FormEvent,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

import { checkoutOrder } from "./actions";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  selling_price: number;
  stock_quantity: number;
  category_id: string | null;
  size: string | null;
  color: string | null;
  product_type: string | null;
  variant_group_id: string | null;
};

type ProductOption = {
  id: string;
  product_id: string;
  group_id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

type ProductOptionGroup = {
  id: string;
  product_id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
};

type SelectedOptionSnapshot = {
  id: string;
  name: string;
  groupName: string;
  priceAdjustment: number;
};

type CartItem = Product & {
  cartKey: string;
  quantity: number;
  optionIds: string[];
  selectedOptions: SelectedOptionSnapshot[];
  configuredUnitPrice: number;
};

type ShoeProductGroup = {
  key: string;
  name: string;
  image_url: string | null;
  category_id: string | null;
  variants: Product[];
  totalStock: number;
  priceFrom: number;
  colors: string[];
  sizes: string[];
  isVariant: boolean;
};
type Customer = {
  id: string;
  name: string;
  phone: string | null;
};
type PaymentMethod =
  | "cod"
  | "deposit"
  | "bank_transfer"
  | "other";

export default function PosClient({
  products,
  categories,
  customers,
  businessType,
  optionGroups,
  options,
}: {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  businessType: string;
  optionGroups: ProductOptionGroup[];
  options: ProductOption[];
})  {
  const [customerId, setCustomerId] =
  useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedShoeGroup, setSelectedShoeGroup] =
    useState<ShoeProductGroup | null>(null);
  const [selectedConfigurableProduct, setSelectedConfigurableProduct] =
    useState<Product | null>(null);
  const isShoesMode = businessType === "shoes";
  const isMilkTeaMode = businessType === "milk_tea";
  const [paymentMethod, setPaymentMethod] =
  useState<PaymentMethod>("cod");
  const [amountPaid, setAmountPaid] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [discount, setDiscount] = useState("");
const [deliveryFee, setDeliveryFee] = useState("");

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "all" ||
        product.category_id === selectedCategory;

      const matchesSearch =
        !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        (product.sku?.toLowerCase().includes(keyword) ?? false);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const shoeGroups = useMemo<ShoeProductGroup[]>(() => {
    if (!isShoesMode) return [];

    const grouped = new Map<string, Product[]>();
    for (const product of products) {
      const key =
        product.product_type === "variant" && product.variant_group_id
          ? `variant:${product.variant_group_id}`
          : `product:${product.id}`;
      const rows = grouped.get(key) ?? [];
      rows.push(product);
      grouped.set(key, rows);
    }

    return [...grouped.entries()].map(([key, variants]) => {
      const first = variants[0];
      return {
        key,
        name: first.name,
        image_url:
          variants.find((row) => row.image_url)?.image_url ?? null,
        category_id: first.category_id,
        variants,
        totalStock: variants.reduce(
          (sum, row) => sum + Number(row.stock_quantity),
          0,
        ),
        priceFrom: Math.min(
          ...variants.map((row) => Number(row.selling_price)),
        ),
        colors: Array.from(
          new Set(
            variants
              .map((row) => row.color?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ),
        sizes: Array.from(
          new Set(
            variants
              .map((row) => row.size?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        isVariant: variants.some((row) => row.product_type === "variant"),
      };
    });
  }, [isShoesMode, products]);

  const filteredShoeGroups = useMemo(() => {
    if (!isShoesMode) return [];
    const keyword = search.trim().toLowerCase();
    return shoeGroups.filter((group) => {
      const matchesCategory =
        selectedCategory === "all" ||
        group.category_id === selectedCategory;
      const matchesSearch =
        !keyword ||
        group.name.toLowerCase().includes(keyword) ||
        group.variants.some(
          (row) =>
            row.sku?.toLowerCase().includes(keyword) ||
            row.color?.toLowerCase().includes(keyword) ||
            row.size?.toLowerCase().includes(keyword),
        );
      return matchesCategory && matchesSearch;
    });
  }, [isShoesMode, search, selectedCategory, shoeGroups]);

const subtotal = cart.reduce(
  (sum, item) =>
    sum + item.configuredUnitPrice * item.quantity,
  0,
);

const rawDiscount = Number(discount || 0);
const rawDeliveryFee = Number(deliveryFee || 0);

const discountNumber = Number.isFinite(rawDiscount)
  ? Math.max(0, rawDiscount)
  : 0;

const deliveryFeeNumber = Number.isFinite(
  rawDeliveryFee,
)
  ? Math.max(0, rawDeliveryFee)
  : 0;

const total = Math.max(
  0,
  subtotal + deliveryFeeNumber - discountNumber,
);

const paidNumber = Number(amountPaid || 0);

const finalAmountPaid =
  paymentMethod === "bank_transfer"
    ? total
    : paidNumber;

const remainingBalance =
  paymentMethod === "cod" ||
  paymentMethod === "deposit"
    ? Math.max(0, total - finalAmountPaid)
    : 0;

const change =
  paymentMethod === "other"
    ? Math.max(0, finalAmountPaid - total)
    : 0;

  function addToCart(product: Product) {
    addConfiguredToCart(product, [], []);
  }

  function addConfiguredToCart(
    product: Product,
    optionIds: string[],
    selectedOptions: SelectedOptionSnapshot[],
  ) {
    setMessage("");

    if (product.stock_quantity <= 0) {
      setMessage(`${product.name} is out of stock.`);
      return;
    }

    const normalizedOptionIds = [...optionIds].sort();
    const cartKey = `${product.id}:${normalizedOptionIds.join(",")}`;
    const optionTotal = selectedOptions.reduce(
      (sum, option) => sum + Number(option.priceAdjustment || 0),
      0,
    );
    const configuredUnitPrice =
      Number(product.selling_price) + optionTotal;

    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.cartKey === cartKey,
      );

      const currentProductQuantity = currentCart
        .filter((item) => item.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);

      if (currentProductQuantity >= product.stock_quantity) {
        setMessage(
          `Only ${product.stock_quantity} units are available.`,
        );
        return currentCart;
      }

      if (existing) {
        return currentCart.map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...currentCart,
        {
          ...product,
          cartKey,
          quantity: 1,
          optionIds: normalizedOptionIds,
          selectedOptions,
          configuredUnitPrice,
        },
      ];
    });
  }

  function updateQuantity(
    cartKey: string,
    changeValue: number,
  ) {
    setMessage("");

    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.cartKey !== cartKey) {
            return item;
          }

          const nextQuantity = item.quantity + changeValue;

          const totalOtherConfigurations = currentCart
            .filter(
              (other) =>
                other.id === item.id && other.cartKey !== item.cartKey,
            )
            .reduce((sum, other) => sum + other.quantity, 0);

          if (nextQuantity + totalOtherConfigurations > item.stock_quantity) {
            setMessage(
              `Only ${item.stock_quantity} units of ${item.name} are available.`,
            );
            return item;
          }

          return {
            ...item,
            quantity: nextQuantity,
          };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function removeFromCart(cartKey: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.cartKey !== cartKey),
    );
  }

  function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (cart.length === 0) {
      setMessage("Please add at least one product.");
      return;
    }
    if (
  rawDiscount < 0 ||
  rawDeliveryFee < 0
) {
  setMessage(
    "Discount and delivery fee cannot be negative.",
  );
  return;
}

if (
  !Number.isFinite(rawDiscount) ||
  !Number.isFinite(rawDeliveryFee)
) {
  setMessage(
    "Enter a valid discount and delivery fee.",
  );
  return;
}

if (
  discountNumber >
  subtotal + deliveryFeeNumber
) {
  setMessage(
    "Discount cannot be greater than the order amount.",
  );
  return;
}
if (
  paymentMethod === "cod" &&
  (paidNumber < 0 || paidNumber > total)
) {
  setMessage(
    "COD amount paid must be between $0 and the total.",
  );
  return;
}


 if (
  paymentMethod === "deposit" &&
  (paidNumber <= 0 || paidNumber >= total)
) {
  setMessage(
    "Deposit must be greater than $0 and less than the total.",
  );
  return;
}

if (
  paymentMethod === "other" &&
  paidNumber < total
) {
  setMessage(
    "Amount paid must be equal to or greater than the total.",
  );
  return;
}

    startTransition(async () => {
const result = await checkoutOrder({
  items: cart.map((item) => ({
    productId: item.id,
    quantity: item.quantity,
    optionIds: item.optionIds,
  })),

  paymentMethod,
  amountPaid: finalAmountPaid,

  discount: discountNumber,
  deliveryFee: deliveryFeeNumber,

  customerId: customerId || null,
});
      if (!result.success) {
        setMessage(result.message);
        return;
      }

setCart([]);
setAmountPaid("");
setDiscount("");
setDeliveryFee("");
setCustomerId("");
setPaymentMethod("cod");
setMessage("Order completed successfully.");

window.location.href =
  `/dashboard/orders/${result.orderId}`;
    });
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <section>
        <div className="mb-5">
          <h1 className="text-3xl font-bold text-slate-900">
            Point of Sale
          </h1>

          <p className="mt-1 text-slate-500">
            Select products and complete the sale
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="relative">
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search name, SKU or barcode"
              className="w-full rounded-xl border border-slate-300 py-3 pl-12 pr-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <CategoryButton
              active={selectedCategory === "all"}
              onClick={() => setSelectedCategory("all")}
            >
              All
            </CategoryButton>

            {categories.map((category) => (
              <CategoryButton
                key={category.id}
                active={selectedCategory === category.id}
                onClick={() =>
                  setSelectedCategory(category.id)
                }
              >
                {category.name}
              </CategoryButton>
            ))}
          </div>
        </div>

        {(isShoesMode ? filteredShoeGroups.length : filteredProducts.length) === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="font-medium text-slate-700">No products found</p>
          </div>
        ) : isShoesMode ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredShoeGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                disabled={group.totalStock <= 0}
                onClick={() => {
                  if (group.isVariant) {
                    setSelectedShoeGroup(group);
                  } else if (group.variants[0]) {
                    addToCart(group.variants[0]);
                  }
                }}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {group.image_url ? (
                    <img
                      src={group.image_url}
                      alt={group.name}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center">
                      <span className="text-3xl font-bold text-slate-300">
                        {group.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                <h2 className="mt-4 font-semibold text-slate-900">
                  {group.name}
                </h2>

                <p className="mt-1 text-xs font-medium text-slate-500">
                  {group.sizes.length} sizes · {group.colors.length} colours
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-lg font-bold text-blue-600">
                    From ${group.priceFrom.toFixed(2)}
                  </span>
                  <span
                    className={
                      group.totalStock > 0
                        ? "text-sm text-slate-500"
                        : "text-sm font-medium text-red-600"
                    }
                  >
                    {group.totalStock > 0
                      ? `${group.totalStock} total stock`
                      : "Out of stock"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={product.stock_quantity <= 0}
                onClick={() => {
                  if (product.product_type === "configurable") {
                    setSelectedConfigurableProduct(product);
                  } else {
                    addToCart(product);
                  }
                }}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center">
                      <span className="text-3xl font-bold text-slate-300">
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                <h2 className="mt-4 font-semibold text-slate-900">
                  {product.name}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  SKU: {product.sku || "—"}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-lg font-bold text-blue-600">
                    ${Number(product.selling_price).toFixed(2)}
                  </span>

                  <span
                    className={
                      product.stock_quantity > 0
                        ? "text-sm text-slate-500"
                        : "text-sm font-medium text-red-600"
                    }
                  >
                    {product.stock_quantity > 0
                      ? `Stock: ${product.stock_quantity}`
                      : "Out of stock"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-6">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <ShoppingCart className="text-blue-600" />

          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Current Order
            </h2>

            <p className="text-sm text-slate-500">
              {cart.reduce(
                (sum, item) => sum + item.quantity,
                0,
              )}{" "}
              items
            </p>
          </div>
        </div>

        <div className="max-h-[370px] overflow-y-auto">
          {cart.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Select a product to add it to the cart.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {cart.map((item) => (
                <div key={item.cartKey} className="p-5">
                  <div className="flex justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {item.name}
                      </h3>

                      {(item.color || item.size) && (
                        <p className="mt-1 text-xs font-semibold text-blue-600">
                          {[item.color, item.size ? `Size ${item.size}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}

                      {item.selectedOptions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.selectedOptions.map((option) => (
                            <span
                              key={option.id}
                              className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
                            >
                              {option.groupName}: {option.name}
                              {option.priceAdjustment > 0
                                ? ` +$${option.priceAdjustment.toFixed(2)}`
                                : ""}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="mt-1 text-sm text-slate-500">
                        ${item.configuredUnitPrice.toFixed(2)} each
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeFromCart(item.cartKey)
                      }
                      className="h-fit rounded-lg p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center rounded-lg border border-slate-300">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.cartKey, -1)
                        }
                        className="p-2 hover:bg-slate-100"
                      >
                        <Minus size={16} />
                      </button>

                      <span className="min-w-10 text-center font-semibold">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.cartKey, 1)
                        }
                        className="p-2 hover:bg-slate-100"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <p className="font-bold text-slate-900">
                      $
                      {(
                        item.configuredUnitPrice *
                        item.quantity
                      ).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={handleCheckout}
          className="border-t border-slate-200 p-6"
        >
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <label className="mt-5 block text-sm font-medium text-slate-700">
  Customer
</label>

<select
  value={customerId}
  onChange={(event) =>
    setCustomerId(event.target.value)
  }
  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
>
  <option value="">Walk-in customer</option>

  {customers.map((customer) => (
    <option
      key={customer.id}
      value={customer.id}
    >
      {customer.name}
      {customer.phone
        ? ` · ${customer.phone}`
        : ""}
    </option>
  ))}
</select>
          <label className="mt-5 block text-sm font-medium text-slate-700">
            Payment method
          </label>

<select
  value={paymentMethod}
  onChange={(event) => {
    const nextPaymentMethod =
      event.target.value as PaymentMethod;

    setPaymentMethod(nextPaymentMethod);
    setMessage("");

    if (nextPaymentMethod === "bank_transfer") {
      setAmountPaid(total.toFixed(2));
    } else {
      setAmountPaid("");
    }
  }}
  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
>
  <option value="cod">COD</option>
  <option value="deposit">Deposit</option>

  <option value="bank_transfer">
    Bank transfer (Fully Paid)
  </option>

  <option value="other">Other</option>
</select>
<div className="mt-5 grid gap-4 sm:grid-cols-2">
  <div>
    <label className="block text-sm font-medium text-slate-700">
      Discount
    </label>

    <input
      type="number"
      min="0"
      step="0.01"
      value={discount}
      onChange={(event) =>
        setDiscount(event.target.value)
      }
      placeholder="0.00"
      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    />
  </div>

  <div>
    <label className="block text-sm font-medium text-slate-700">
      Delivery fee
    </label>

    <input
      type="number"
      min="0"
      step="0.01"
      value={deliveryFee}
      onChange={(event) =>
        setDeliveryFee(event.target.value)
      }
      placeholder="0.00"
      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    />
  </div>
</div>

{(paymentMethod === "deposit"
  ) && (
  <>
    <label className="mt-4 block text-sm font-medium text-slate-700">
      {paymentMethod === "deposit"
        ? "Deposit amount"
        : "Amount paid"}-
    </label>

    <input
      type="number"
      min="0"
      max={total}
      step="0.01"
      value={amountPaid}
      onChange={(event) =>
        setAmountPaid(event.target.value)
      }
      placeholder="0.00"
      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
    />
  </>
)}

{paymentMethod === "other" && (
  <>
    <label className="mt-4 block text-sm font-medium text-slate-700">
      Amount paid
    </label>

    <input
      type="number"
      min={total}
      step="0.01"
      value={amountPaid}
      onChange={(event) =>
        setAmountPaid(event.target.value)
      }
      placeholder={total.toFixed(2)}
      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
    />

    <div className="mt-4 flex justify-between text-sm">
      <span className="text-slate-500">
        Amount paid
      </span>

      <span className="font-semibold text-slate-900">
        ${paidNumber.toFixed(2)}
      </span>
    </div>

    <div className="mt-2 flex justify-between text-sm">
      <span className="text-slate-500">
        Change
      </span>

      <span className="font-semibold text-green-600">
        ${change.toFixed(2)}
      </span>
    </div>
  </>
)}

<div className="mt-2 flex justify-between text-sm">
  <span className="text-slate-500">
     Left to pay
  </span>

  <span
    className={
      remainingBalance > 0
        ? "font-semibold text-amber-600"
        : "font-semibold text-green-600"
    }
  >
    ${remainingBalance.toFixed(2)}
  </span>
</div>
          {message && (
            <div
              className={`mt-4 rounded-xl p-3 text-sm ${
                message.includes("successfully")
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || cart.length === 0}
            className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending
              ? "Processing..."
              : `Complete Sale · $${total.toFixed(2)}`}
          </button>
        </form>
      </section>
      </div>

      {selectedConfigurableProduct && (
        <ConfigurableProductModal
          product={selectedConfigurableProduct}
          groups={optionGroups.filter(
            (group) => group.product_id === selectedConfigurableProduct.id,
          )}
          options={options.filter(
            (option) => option.product_id === selectedConfigurableProduct.id,
          )}
          isMilkTea={isMilkTeaMode}
          onClose={() => setSelectedConfigurableProduct(null)}
          onAdd={(optionIds, selectedOptions) => {
            addConfiguredToCart(
              selectedConfigurableProduct,
              optionIds,
              selectedOptions,
            );
            setSelectedConfigurableProduct(null);
          }}
        />
      )}

      {selectedShoeGroup && (
        <ShoeVariantModal
          group={selectedShoeGroup}
          onClose={() => setSelectedShoeGroup(null)}
          onAdd={(product) => {
            addToCart(product);
            setSelectedShoeGroup(null);
          }}
        />
      )}
    </>
  );
}

function CategoryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ConfigurableProductModal({
  product,
  groups,
  options,
  isMilkTea,
  onClose,
  onAdd,
}: {
  product: Product;
  groups: ProductOptionGroup[];
  options: ProductOption[];
  isMilkTea: boolean;
  onClose: () => void;
  onAdd: (optionIds: string[], selectedOptions: SelectedOptionSnapshot[]) => void;
}) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const group of groups) {
      const groupOptions = options.filter((option) => option.group_id === group.id);
      const defaults = groupOptions.filter((option) => option.is_default).map((option) => option.id);
      if (group.selection_type === "single") {
        const first = defaults[0] ?? (group.is_required ? groupOptions[0]?.id : undefined);
        initial[group.id] = first ? [first] : [];
      } else {
        initial[group.id] = defaults.slice(0, group.max_selections);
      }
    }
    return initial;
  });
  const [error, setError] = useState("");

  const selectedIds = Object.values(selectedByGroup).flat();
  const selectedOptions = selectedIds
    .map((id) => {
      const option = options.find((row) => row.id === id);
      if (!option) return null;
      const group = groups.find((row) => row.id === option.group_id);
      return {
        id: option.id,
        name: option.name,
        groupName: group?.name ?? "Option",
        priceAdjustment: Number(option.price_adjustment),
      } satisfies SelectedOptionSnapshot;
    })
    .filter((value): value is SelectedOptionSnapshot => value !== null);

  const optionTotal = selectedOptions.reduce(
    (sum, option) => sum + option.priceAdjustment,
    0,
  );
  const unitPrice = Number(product.selling_price) + optionTotal;

  function toggleOption(group: ProductOptionGroup, optionId: string) {
    setError("");
    setSelectedByGroup((current) => {
      const selected = current[group.id] ?? [];
      if (group.selection_type === "single") {
        return { ...current, [group.id]: [optionId] };
      }
      if (selected.includes(optionId)) {
        return {
          ...current,
          [group.id]: selected.filter((id) => id !== optionId),
        };
      }
      if (selected.length >= group.max_selections) {
        setError(`Choose up to ${group.max_selections} options for ${group.name}.`);
        return current;
      }
      return { ...current, [group.id]: [...selected, optionId] };
    });
  }

  function handleAdd() {
    for (const group of groups) {
      const count = (selectedByGroup[group.id] ?? []).length;
      if (group.is_required && count === 0) {
        setError(`Choose ${group.name}.`);
        return;
      }
      if (count < group.min_selections || count > group.max_selections) {
        setError(
          `${group.name} requires ${group.min_selections === group.max_selections
            ? group.min_selections
            : `${group.min_selections}-${group.max_selections}`} selection${group.max_selections === 1 ? "" : "s"}.`,
        );
        return;
      }
    }
    onAdd(selectedIds, selectedOptions);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
              {isMilkTea ? "Customize drink" : "Configure product"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{product.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isMilkTea
                ? "Choose cup size, sweetness, ice, milk and toppings."
                : "Choose the options before adding this item to the sale."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {groups.length === 0 ? (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              This configurable product has no option groups yet.
            </div>
          ) : (
            groups.map((group) => {
              const groupOptions = options.filter((option) => option.group_id === group.id);
              const selected = selectedByGroup[group.id] ?? [];
              return (
                <section key={group.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{group.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {group.selection_type === "single"
                          ? "Choose one"
                          : `Choose ${group.min_selections}-${group.max_selections}`}
                        {!group.is_required ? " · Optional" : ""}
                      </p>
                    </div>
                    {selected.length > 0 && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {selected.length} selected
                      </span>
                    )}
                  </div>

                  <div className={`mt-3 grid gap-2 ${isMilkTea ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                    {groupOptions.map((option) => {
                      const active = selected.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleOption(group, option.id)}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-amber-500 bg-amber-50 ring-2 ring-amber-100"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-slate-900">{option.name}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {Number(option.price_adjustment) > 0
                              ? `+$${Number(option.price_adjustment).toFixed(2)}`
                              : "Included"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>
          )}

          <div className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Configured price</p>
                <p className="text-sm text-slate-600">
                  Base ${Number(product.selling_price).toFixed(2)}
                  {optionTotal > 0 ? ` + options $${optionTotal.toFixed(2)}` : ""}
                </p>
              </div>
              <p className="text-2xl font-bold text-amber-600">${unitPrice.toFixed(2)}</p>
            </div>
            <button
              type="button"
              disabled={groups.length === 0 || product.stock_quantity <= 0}
              onClick={handleAdd}
              className="w-full rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Customized {isMilkTea ? "Drink" : "Item"} · ${unitPrice.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShoeVariantModal({
  group,
  onClose,
  onAdd,
}: {
  group: ShoeProductGroup;
  onClose: () => void;
  onAdd: (product: Product) => void;
}) {
  const initialVariant =
    group.variants.find((row) => row.stock_quantity > 0) ?? group.variants[0];
  const [variantId, setVariantId] = useState(initialVariant?.id ?? "");
  const variant =
    group.variants.find((row) => row.id === variantId) ?? initialVariant;

  if (!variant) return null;

  const selectedColor = variant.color?.trim() ?? group.colors[0] ?? "";
  const sizeRows = group.variants
    .filter((row) => (row.color?.trim() ?? "") === selectedColor)
    .sort((a, b) =>
      (a.size ?? "").localeCompare(b.size ?? "", undefined, { numeric: true }),
    );

  function chooseColor(color: string) {
    const sameSize = group.variants.find(
      (row) =>
        row.color?.trim() === color &&
        row.size === variant.size &&
        row.stock_quantity > 0,
    );
    const firstAvailable = group.variants.find(
      (row) => row.color?.trim() === color && row.stock_quantity > 0,
    );
    const fallback = group.variants.find(
      (row) => row.color?.trim() === color,
    );
    const next = sameSize ?? firstAvailable ?? fallback;
    if (next) setVariantId(next.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{group.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose the exact colour and size before adding to the sale.
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

        <div className="space-y-6 p-5">
          {group.image_url && (
            <img
              src={group.image_url}
              alt={group.name}
              className="aspect-[16/9] w-full rounded-2xl border border-slate-200 object-cover"
            />
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800">Colour</p>
              <span className="text-xs text-slate-400">{selectedColor}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {group.colors.map((color) => {
                const available = group.variants.some(
                  (row) =>
                    row.color?.trim() === color && row.stock_quantity > 0,
                );
                const active = selectedColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    disabled={!available}
                    onClick={() => chooseColor(color)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700 hover:border-slate-300"
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
              <p className="text-sm font-semibold text-slate-800">Size</p>
              <span className="text-xs text-slate-400">
                {variant.size ? `EU ${variant.size}` : "Choose"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {sizeRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={row.stock_quantity <= 0}
                  onClick={() => setVariantId(row.id)}
                  className={`rounded-xl border px-2 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300 ${
                    row.id === variant.id
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-800 hover:border-slate-300"
                  }`}
                >
                  {row.size || "—"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">
                  {variant.color} · Size {variant.size || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  SKU {variant.sku || "—"} · {variant.stock_quantity} in stock
                </p>
              </div>
              <p className="text-xl font-bold text-blue-600">
                ${Number(variant.selling_price).toFixed(2)}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={variant.stock_quantity <= 0}
            onClick={() => onAdd(variant)}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Size {variant.size || "—"} to Sale
          </button>
        </div>
      </div>
    </div>
  );
}
