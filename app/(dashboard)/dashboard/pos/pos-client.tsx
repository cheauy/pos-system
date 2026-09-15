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

type CartItem = Product & {
  quantity: number;
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
}: {
  products: Product[];
  categories: Category[];
  customers: Customer[];
  businessType: string;
})  {
  const [customerId, setCustomerId] =
  useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedShoeGroup, setSelectedShoeGroup] =
    useState<ShoeProductGroup | null>(null);
  const isShoesMode = businessType === "shoes";
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
    sum +
    Number(item.selling_price) *
      item.quantity,
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
    setMessage("");

    if (product.stock_quantity <= 0) {
      setMessage(`${product.name} is out of stock.`);
      return;
    }

    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.id === product.id,
      );

      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          setMessage(
            `Only ${product.stock_quantity} units are available.`,
          );

          return currentCart;
        }

        return currentCart.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [
        ...currentCart,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(
    productId: string,
    changeValue: number,
  ) {
    setMessage("");

    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.id !== productId) {
            return item;
          }

          const nextQuantity = item.quantity + changeValue;

          if (nextQuantity > item.stock_quantity) {
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

  function removeFromCart(productId: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== productId),
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
                onClick={() => addToCart(product)}
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
                <div key={item.id} className="p-5">
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

                      <p className="mt-1 text-sm text-slate-500">
                        $
                        {Number(
                          item.selling_price,
                        ).toFixed(2)}{" "}
                        each
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeFromCart(item.id)
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
                          updateQuantity(item.id, -1)
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
                          updateQuantity(item.id, 1)
                        }
                        className="p-2 hover:bg-slate-100"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <p className="font-bold text-slate-900">
                      $
                      {(
                        Number(item.selling_price) *
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
