import test from "node:test";
import assert from "node:assert/strict";
import { restoreCart } from "../lib/storefront/cart.ts";

const product = {
  key: "product:shirt", categoryId: null, name: "Shirt", imageUrl: "/shirt.jpg",
  description: null, productType: "standard", priceFrom: 15, totalStock: 3,
  variants: [{ id: "shirt", sku: "SHIRT-M", size: "M", color: "Blue", imageUrl: null, sellingPrice: 15, stockQuantity: 3 }],
  optionGroups: [],
};

test("ignores malformed, unavailable and sold out saved products", () => {
  assert.deepEqual(restoreCart(null, [product]), []);
  assert.deepEqual(restoreCart([null, 1, { productId: "missing", quantity: 1 },
    { productId: "shirt", quantity: -1 }, { productId: "shirt", quantity: 1, optionIds: [null] }], [product]), []);
  assert.deepEqual(restoreCart([{ productId: "shirt", quantity: 1, optionIds: [] }],
    [{ ...product, variants: [{ ...product.variants[0], stockQuantity: 0 }] }]), []);
});

test("rebuilds current price, label and stock instead of trusting saved values", () => {
  const [item] = restoreCart([{ productId: "shirt", quantity: 99, optionIds: [], unitPrice: 1, maxStock: 100, name: "Old name" }], [product]);
  assert.equal(item.quantity, 3);
  assert.equal(item.unitPrice, 15);
  assert.equal(item.name, "Shirt");
  assert.equal(item.variantLabel, "Blue / M");
});

test("merges duplicate lines and limits aggregate stock across configurations", () => {
  const configured = { ...product, optionGroups: [{ id: "extras", name: "Extras", selectionType: "multiple", isRequired: false, minSelections: 0, maxSelections: 1,
    options: [{ id: "gift", name: "Gift wrap", priceAdjustment: 2, isDefault: false }] }] };
  const cart = restoreCart([{ productId: "shirt", quantity: 1, optionIds: [] }, { productId: "shirt", quantity: 1, optionIds: [] }, { productId: "shirt", quantity: 3, optionIds: ["gift"] }], [configured]);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.equal(cart[1].quantity, 1);
  assert.equal(cart[1].unitPrice, 17);
});

test("removes obsolete options and configurations missing required selections", () => {
  const required = { ...product, optionGroups: [{ id: "size", name: "Size", selectionType: "single", isRequired: true, minSelections: 1, maxSelections: 1,
    options: [{ id: "regular", name: "Regular", priceAdjustment: 0, isDefault: true }] }] };
  assert.deepEqual(restoreCart([{ productId: "shirt", quantity: 1, optionIds: [] }, { productId: "shirt", quantity: 1, optionIds: ["removed"] }], [required]), []);
  assert.equal(restoreCart([{ productId: "shirt", quantity: 1, optionIds: ["regular", "regular"] }], [required]).length, 1);
});

test("duplicate additions cannot exceed the checkout limit of 999 per line", () => {
  const stocked = { ...product, variants: [{ ...product.variants[0], stockQuantity: 2000 }] };
  const cart = restoreCart([{ productId: "shirt", quantity: 999, optionIds: [] }, { productId: "shirt", quantity: 999, optionIds: [] }], [stocked]);
  assert.equal(cart[0].quantity, 999);
});
