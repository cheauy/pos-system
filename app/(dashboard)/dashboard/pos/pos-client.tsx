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
  barcode: string | null;
  selling_price: number;
  stock_quantity: number;
  category_id: string | null;
};

type CartItem = Product & {
  quantity: number;
};
type Customer = {
  id: string;
  name: string;
  phone: string | null;
};
type PaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "other";

export default function PosClient({
  products,
  categories,
  customers,
}: {
  products: Product[];
  categories: Category[];
  customers: Customer[];
})  {
  const [customerId, setCustomerId] =
  useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "all" ||
        product.category_id === selectedCategory;

      const matchesSearch =
        !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        product.sku?.toLowerCase().includes(keyword) ||
        product.barcode?.toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const total = cart.reduce(
    (sum, item) =>
      sum + Number(item.selling_price) * item.quantity,
    0,
  );

  const paidNumber = Number(amountPaid || 0);

  const change =
    paymentMethod === "cash"
      ? Math.max(0, paidNumber - total)
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
      paymentMethod === "cash" &&
      paidNumber < total
    ) {
      setMessage("The amount paid is less than the total.");
      return;
    }

    startTransition(async () => {
      const result = await checkoutOrder({
  items: cart.map((item) => ({
    productId: item.id,
    quantity: item.quantity,
  })),
  paymentMethod,
  amountPaid:
    paymentMethod === "cash"
      ? paidNumber
      : total,
  customerId: customerId || null,
});
      if (!result.success) {
        setMessage(result.message);
        return;
      }

    setCart([]);
setAmountPaid("");
setCustomerId("");
setMessage("Order completed successfully.");

window.location.href =
  `/dashboard/orders/${result.orderId}`;
    });
  }

  return (
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

        {filteredProducts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="font-medium text-slate-700">
              No products found
            </p>
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
                <div className="flex min-h-24 items-center justify-center rounded-xl bg-slate-100">
                  <span className="text-3xl font-bold text-slate-300">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
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
            onChange={(event) =>
              setPaymentMethod(
                event.target.value as PaymentMethod,
              )
            }
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">
              Bank transfer
            </option>
            <option value="other">Other</option>
          </select>

          {paymentMethod === "cash" && (
            <>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Amount paid
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(event) =>
                  setAmountPaid(event.target.value)
                }
                placeholder="0.00"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
              />

              <div className="mt-4 flex justify-between text-sm">
                <span className="text-slate-500">
                  Change
                </span>

                <span className="font-semibold text-green-600">
                  ${change.toFixed(2)}
                </span>
              </div>
            </>
          )}

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