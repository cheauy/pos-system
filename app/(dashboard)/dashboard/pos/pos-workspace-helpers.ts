import { currencyQuoteIssue, settlementCurrencyIssue } from './pos-currency';
import type { CartDraft, CartLine, CatalogFilters, CheckoutInput, DiscountType, HeldOrder, Product, ProductGroup, ShippingDetails, Tender, Workspace } from './pos-workspace-types';

export const EMPTY_FILTERS: CatalogFilters = { search: '', category: 'all', brand: 'all', stock: 'all', price: 'all', color: 'all', size: 'all', favoritesOnly: false, sort: 'popular' };
export const MAX_LINES = 100;
export function cents(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
export function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
}
export function cartKey(productId: string, optionIds: string[]) { return `${productId}:${[...new Set(optionIds)].sort().join(',')}`; }
export function uuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
// Global stock is the existing checkout engine's hard limit. A branch mirror is
// NOT an additional inventory pool. Include inactive locations before deciding
// that a business genuinely has only one inventory location.
function stockUnits(value: unknown): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
export function inventoryFor(product: Product, branchId: string, data: Workspace) {
  const global = stockUnits(product.stock_quantity);
  if(!branchId)return {global,recorded:global,assigned:global,available:global,unassigned:0,singleLocation:false,mirrorNeedsSync:false,reason:global>0?"available":"sold_out"};
  const rows = data.stock.filter(row => row.product_id === product.id);
  const record = rows.find(row => row.location_id === branchId);
  const recorded = stockUnits(record?.quantity);
  const assigned = rows.reduce((sum, row) => sum + stockUnits(row.quantity), 0);
  const validBranch = data.branches.some(b => b.id === branchId);
  const singleLocation = data.inventoryVersion === 2 && data.inventoryLocationCount === 1 && validBranch;
  const available = validBranch ? (singleLocation ? global : Math.min(global, recorded)) : 0;
  const unassigned = singleLocation ? 0 : Math.max(0, global - assigned);
  const reason = available > 0 ? 'available' : global === 0 ? 'sold_out' : unassigned > 0 ? 'unassigned' : 'other_branch';
  return { global, recorded, assigned, available, unassigned, singleLocation,
    mirrorNeedsSync: singleLocation && (!record || recorded !== global), reason };
}
export function stockFor(product: Product, branchId: string, data: Workspace): number {
  return inventoryFor(product, branchId, data).available;
}
export function stockLabel(product: Product, branchId: string, data: Workspace): string {
  const stock = inventoryFor(product, branchId, data);
  return stock.reason === 'sold_out' ? 'Out of stock' : stock.reason === 'unassigned' ? 'Stock unassigned' : stock.reason === 'other_branch' ? 'Not at this branch' : 'In stock';
}
export function isVariantGroup(group: ProductGroup): boolean {
  return group.variants.length > 1 || group.variants.some(p => Boolean(p.variant_group_id || p.color || p.size) || p.product_type === 'variant');
}
export function shippingIssue(shipping: ShippingDetails, deliveryFee: number): string | null {
  if (!shipping || !['in_store', 'pickup', 'delivery'].includes(shipping.method)) return 'Choose an order type.';
  if (typeof shipping.recipientName !== 'string' || shipping.recipientName.length > 120 || typeof shipping.phone !== 'string' || shipping.phone.length > 40 || typeof shipping.address !== 'string' || shipping.address.length > 500) return 'Enter valid recipient details.';
  if (shipping.method === 'delivery' && (!shipping.recipientName.trim() || !shipping.phone.trim() || !shipping.address.trim())) return 'Delivery needs a recipient name, phone number and address.';
  if (shipping.method !== 'delivery' && deliveryFee !== 0) return 'Delivery fees only apply to Delivery. Choose Delivery or remove the fee.';
  return null;
}
export function discountIssue(value: number, type: DiscountType, subtotal: number): string | null {
  if (!['amount','percent'].includes(type) || !Number.isFinite(value) || value < 0 || value > 999999999 || Math.abs(value * 100 - cents(value)) > 0.000001) return 'Enter a non-negative discount with up to 2 decimal places.';
  if (type === 'percent' && value > 100) return 'Percentage discount must be between 0 and 100%.';
  if (type === 'amount' && cents(value) > cents(subtotal)) return 'The fixed discount cannot exceed the merchandise subtotal.';
  return null;
}
export function discountCents(subtotal: number, value: number, type: DiscountType = 'amount'): number {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isFinite(value) || value < 0 || value > 999999999) return 0;
  if (type === 'amount') return cents(value);
  if (type !== 'percent' || value > 100) return 0;
  // 2 decimal percent: 12.50% = 1250/10000. Half-up cents matches SQL round().
  return Number((BigInt(subtotal) * BigInt(cents(value)) + BigInt(5000)) / BigInt(10000));
}
export function tenderIssue(tenders: Tender[], total: number): string | null {
  if (!Array.isArray(tenders) || tenders.length < 2 || tenders.length > 5) return 'Enter 2–5 split payments.';
  for (const t of tenders) {
    if (!t || !['cash','bank_transfer','other'].includes(t.method) || !Number.isFinite(t.amount) || t.amount <= 0 || t.amount > 999999999 || Math.abs(t.amount * 100 - cents(t.amount)) > 0.000001 || typeof t.reference !== 'string' || t.reference.length > 120) return 'Each payment needs a positive amount with up to 2 decimal places and a valid method.';
  }
  if (tenders.reduce((sum, t) => sum + cents(t.amount), 0) !== cents(total)) return 'Split payments must add up exactly to the order total.';
  return null;
}
export function splitRemaining(tenders: Tender[], total: number, excludingIndex?: number): number {
  return (cents(total) - tenders.reduce((sum, t, i) => sum + (i === excludingIndex || !Number.isFinite(t.amount) ? 0 : cents(t.amount)), 0)) / 100;
}
export function restoreHeldDraft(saved: HeldOrder, data: Workspace): CartDraft {
  const d = saved.draft;
  if (d?.baseCurrency && d.baseCurrency !== data.settings.currency) throw new Error('The held order accounting currency changed. Do not reinterpret its old prices; start a new cart.');
  if (!d || !Array.isArray(d.lines) || d.lines.length < 1 || d.lines.length > MAX_LINES || !data.branches.some(b => b.id === d.branchId)) throw new Error('The held order branch or cart is no longer available.');
  if (data.shift && data.shift.location_id !== d.branchId) throw new Error('Use the register branch for this held order, or close your current shift.');
  const lines = d.lines.map(l => {
    if (!l || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 999 || !Array.isArray(l.optionIds)) throw new Error('A held order quantity or option is invalid.');
    const p = data.products.find(p => p.id === l.productId);
    if (!p) throw new Error(`${l.name} is unavailable. The held order has not been deleted.`);
    return { ...configuredLine(p, l.optionIds, data), quantity: l.quantity };
  });
  const customerId = data.customers.some(c => c.id === d.customerId) ? d.customerId : '';
  const shipping: ShippingDetails = d.shipping && ['in_store','pickup','delivery'].includes(d.shipping.method) ? {
    method: d.shipping.method, recipientName: String(d.shipping.recipientName || ''), phone: String(d.shipping.phone || ''), address: String(d.shipping.address || ''), carrier: ['', 'jt','vet','grab','other'].includes(d.shipping.carrier || '') ? d.shipping.carrier : '', carrierOther: String(d.shipping.carrierOther || '').slice(0,80)
  } : { method: Number(d.deliveryFee) > 0 ? 'delivery' : 'in_store', recipientName: '', phone: '', address: '' };
  const tenders = Array.isArray(d.tenders) ? d.tenders.filter(t => t && ['cash','bank_transfer','other'].includes(t.method) && Number.isFinite(t.amount) && t.amount >= 0).slice(0,5).map(t => ({ ...t, reference: String(t.reference || '').slice(0,120) })) : [];
  return { ...d, lines, customerId, discount: String(d.discount || '0'), discountType: d.discountType === 'percent' ? 'percent' : 'amount',
    deliveryFee: shipping.method === 'delivery' ? String(d.deliveryFee || '0') : '0', points: customerId ? String(d.points || '0') : '0',
    note: String(d.note || ''), shipping, tenders, paymentMethod: ['cash','cod','deposit','bank_transfer','other','credit','split'].includes(d.paymentMethod) ? d.paymentMethod : 'cash' };
}
export function thresholdFor(product: Product, branchId: string, data: Workspace): number {
  const value = data.stock.find(s => s.location_id === branchId && s.product_id === product.id)?.low_stock_threshold;
  return Math.max(0, Number(value ?? product.low_stock_quantity ?? 0));
}
export function configuredLine(product: Product, optionIds: string[], data: Workspace): CartLine {
  const ids = [...new Set(optionIds)].sort();
  const selected = ids.map(id => data.options.find(o => o.id === id && o.product_id === product.id && o.is_active));
  if (selected.some(o => !o)) throw new Error('A selected option is unavailable. Choose the options again.');
  if (product.product_type !== 'configurable' && ids.length) throw new Error('This item does not support options.');
  if (product.product_type === 'configurable') {
    const groups = data.groups.filter(g => g.product_id === product.id);
    for (const g of groups) {
      const count = selected.filter(o => o?.group_id === g.id).length;
      const min = Math.max(Number(g.min_selections), g.is_required ? 1 : 0);
      const max = g.selection_type === 'single' ? 1 : Number(g.max_selections);
      if (count < min || count > max) throw new Error(`${g.name}: choose ${min === max ? min : `${min}–${max}`} option(s).`);
    }
    if (selected.some(o => !groups.some(g => g.id === o?.group_id))) throw new Error('An option group is no longer available.');
  }
  const options = selected.map(o => ({ id: o!.id, name: o!.name, groupName: data.groups.find(g => g.id === o!.group_id)?.name ?? '', priceAdjustment: Number(o!.price_adjustment) }));
  const price = (cents(Number(product.selling_price)) + options.reduce((sum, o) => sum + cents(o.priceAdjustment), 0)) / 100;
  if (!Number.isFinite(price) || price < 0) throw new Error('This product has an invalid configured price.');
  return { key: cartKey(product.id, ids), productId: product.id, quantity: 1, optionIds: ids, unitPrice: price, name: product.name, variant: [product.color, product.size].filter(Boolean).join(' / '), image: product.variant_image_url || product.image_url, selectedOptions: options };
}
export function cartIssue(lines: CartLine[], branchId: string, data: Workspace): string | null {
  if (!data.branches.some(b => b.id === branchId)) return 'Choose an active branch.';
  if (data.shift && data.shift.location_id !== branchId) return 'The sale must use your open register branch.';
  if (lines.length > MAX_LINES) return `A sale can have up to ${MAX_LINES} configured lines.`;
  const quantities = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 999) return 'Quantities must be whole numbers from 1 to 999.';
    const p = data.products.find(p => p.id === l.productId);
    if (!p) return `${l.name} is no longer available. Remove it from this sale.`;
    let current: CartLine;
    try { current = configuredLine(p, l.optionIds, data); } catch (e) { return e instanceof Error ? e.message : 'Invalid options.'; }
    if (cents(current.unitPrice) !== cents(l.unitPrice)) return `${p.name} has a new price. Use “Update cart prices” before checkout.`;
    quantities.set(p.id, (quantities.get(p.id) ?? 0) + l.quantity);
    if ((quantities.get(p.id) ?? 0) > stockFor(p, branchId, data)) return `${p.name}: only ${stockFor(p, branchId, data)} available at this branch.`;
  }
  return null;
}
export function totals(lines: CartLine[], discount: number, delivery: number, points: number, taxRate: number, pointValue: number, discountType: DiscountType = 'amount') {
  const subtotal = lines.reduce((sum, line) => sum + cents(line.unitPrice) * line.quantity, 0);
  const manual = discountCents(subtotal, discount, discountType);
  const validPoints = Number.isSafeInteger(points) && points >= 0 ? points : 0;
  // Point value is stored to four decimals; round once after multiplication.
  const pointUnits = Math.round((Number.isFinite(pointValue) && pointValue >= 0 && pointValue <= 1000000 ? pointValue : 0) * 10000);
  const reward = Number((BigInt(validPoints) * BigInt(pointUnits) + BigInt(50)) / BigInt(100));
  const taxable = Math.max(0, subtotal - manual - reward);
  const rateUnits = Math.max(0, Math.round((Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100 ? taxRate : 0) * 1000));
  const safeTaxable = Number.isSafeInteger(taxable) && taxable >= 0 ? taxable : 0;
  const tax = Number((BigInt(safeTaxable) * BigInt(rateUnits) + BigInt(50000)) / BigInt(100000));
  return { subtotal: subtotal / 100, manualDiscount: manual / 100, reward: reward / 100, discount: (manual + reward) / 100, tax: tax / 100, delivery: (cents(delivery) || 0) / 100, total: Math.max(0, taxable + tax + (cents(delivery) || 0)) / 100 };
}
export function validateCheckout(input: CheckoutInput): string | null {
  if(input?.couponCode!==undefined&&input.couponCode!==''&&!/^[A-Z0-9_-]{3,30}$/.test(input.couponCode))return 'Enter a valid coupon code.';
  if (!input || !uuid(input.requestId) || !uuid(input.branchId) || (input.customerId !== null && !uuid(input.customerId))) return 'Invalid sale or branch.';
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > MAX_LINES) return 'Add 1–100 items to the sale.';
  for (const i of input.items) {
    if (!i || !uuid(i.productId) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 999 || !Array.isArray(i.optionIds) || i.optionIds.length > 50 || !i.optionIds.every(uuid) || new Set(i.optionIds).size !== i.optionIds.length || !Number.isFinite(i.expectedUnitPrice) || i.expectedUnitPrice < 0) return 'The cart contains invalid items or options.';
  }
  if (!['cash','cod','deposit','bank_transfer','other','credit','split'].includes(input.paymentMethod)) return 'Choose a valid payment method.';
  if ([input.discount,input.deliveryFee,input.amountPaid,input.expectedTotal,input.expectedTaxRate].some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 999999999)) return 'Enter valid non-negative amounts.';
  if ([input.discount,input.deliveryFee,input.amountPaid,input.expectedTotal].some(v => Math.abs(v * 100 - cents(v)) > 0.000001)) return 'Payment, discount and delivery amounts must have at most 2 decimal places.';
  if (input.expectedTaxRate > 100 || !Number.isInteger(input.redeemPoints) || input.redeemPoints < 0 || input.redeemPoints > 1000000) return 'Invalid tax rate or points.';
  if (typeof input.note !== 'string' || input.note.length > 1000) return 'Order notes may contain up to 1,000 characters.';
  if (input.holdId !== null && (!uuid(input.holdId) || !Number.isInteger(input.holdVersion) || Number(input.holdVersion) < 1)) return 'Invalid held order version.';
  const paid = cents(input.amountPaid), due = cents(input.expectedTotal);
  if (input.paymentMethod === 'credit' && (!input.customerId || due <= 0)) return 'Select a customer to use customer credit.';
  if (input.paymentMethod === 'cod' && paid > due) return 'COD received amount cannot exceed the total.';
  if (input.paymentMethod === 'deposit' && (paid <= 0 || paid >= due)) return 'The deposit must be greater than zero and less than the total.';
  if (input.paymentMethod === 'cash' && paid < due) return 'Cash received is less than the total.';
  if (['bank_transfer','other'].includes(input.paymentMethod) && (!input.paymentsConfirmed || paid !== due)) return 'Confirm the full payment was received before recording it.';
  if (!Array.isArray(input.tenders)) return 'Invalid payments.';
  if (input.paymentMethod === 'split') {
    if (paid !== due) return 'Split received amount must equal the order total.';
    const splitError = tenderIssue(input.tenders, input.expectedTotal);
    if (splitError) return splitError;
    if (!input.paymentsConfirmed) return 'Confirm all split payments have been received.';
  }
  if (input.discountType !== undefined || input.discountValue !== undefined) {
    const subtotal = input.items.reduce((sum, i) => sum + cents(i.expectedUnitPrice) * i.quantity, 0);
    const invalidDiscount = discountIssue(input.discountValue!, input.discountType!, subtotal / 100);
    if (invalidDiscount) return invalidDiscount;
    if (discountCents(subtotal, input.discountValue!, input.discountType) !== cents(input.discount)) return 'The discount changed. Review the total before saving.';
  }
  if (input.shipping !== undefined) {
    const invalidShipping = shippingIssue(input.shipping, input.deliveryFee);
    if (invalidShipping) return invalidShipping;
  }
  if (input.uiVersion === 3) {
    if (!input.currencyQuote) return 'Refresh POS currency settings before checkout.';
    const currencyError = currencyQuoteIssue(input.currencyQuote); if (currencyError) return currencyError;
    const settlementError=settlementCurrencyIssue(input.expectedTotal,input.amountPaid,input.paymentMethod==='split'?input.tenders.map(t=>t.amount):[],input.currencyQuote);if(settlementError)return settlementError;
    if (!input.shipping) return 'Choose an order type.';
    const orderTypeError = orderDetailsIssue(input.shipping, input.createCustomer === true, input.customerId); if (orderTypeError) return orderTypeError;
  }
  if (input.redeemPoints && (!input.customerId || ['credit','deposit'].includes(input.paymentMethod) || (input.paymentMethod === 'cod' && paid !== due))) return 'Points can be redeemed on fully paid customer sales only.';
  return null;
}
export function productGroups(data: Workspace, branchId: string, filters: CatalogFilters, favorites: string[]): ProductGroup[] {
  const groups = new Map<string, Product[]>();
  const keyword = filters.search.trim().toLowerCase();
  for (const p of data.products) {
    const key = p.variant_group_id ? `variant:${p.variant_group_id}` : p.id;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const matches = (p: Product): boolean => {
    const stock = stockFor(p, branchId, data), low = thresholdFor(p, branchId, data), price = Number(p.selling_price);
    if (keyword && ![p.name,p.sku,p.barcode,p.color,p.size,p.brand].some(v => v?.toLowerCase().includes(keyword))) return false;
    if (filters.category !== 'all' && p.category_id !== filters.category) return false;
    if (filters.brand !== 'all' && (p.brand || 'unbranded') !== filters.brand) return false;
    if ((filters.stock === 'in' && stock <= 0) || (filters.stock === 'low' && !(stock > 0 && stock <= low)) || (filters.stock === 'out' && stock > 0)) return false;
    if ((filters.price === 'under25' && price >= 25) || (filters.price === '25to100' && (price < 25 || price > 100)) || (filters.price === 'over100' && price <= 100)) return false;
    if ((filters.color !== 'all' && p.color !== filters.color) || (filters.size !== 'all' && p.size !== filters.size)) return false;
    return true;
  };
  return Array.from(groups).filter(([key, variants]) => (!filters.favoritesOnly || favorites.includes(key)) && variants.some(matches))
    .map(([key, variants]) => ({ key, variants, name: variants[0].name, image: variants[0].variant_image_url || variants[0].image_url, category: data.categories.find(c => c.id === variants[0].category_id)?.name || 'Uncategorized', price: Math.min(...variants.map(v => Number(v.selling_price))), stock: variants.reduce((sum,v) => sum + stockFor(v,branchId,data),0), threshold: variants.reduce((sum,v) => sum + thresholdFor(v,branchId,data),0), sold: variants.reduce((sum,v) => sum + Number(v.sold || 0),0), createdAt: variants[0].created_at, favorite: favorites.includes(key) }))
    .sort((a,b) => filters.sort === 'priceAsc' ? a.price-b.price : filters.sort === 'priceDesc' ? b.price-a.price : filters.sort === 'newest' ? Date.parse(b.createdAt)-Date.parse(a.createdAt) : filters.sort === 'name' ? a.name.localeCompare(b.name) : b.sold-a.sold || a.name.localeCompare(b.name));
}

export function customerPhoneKey(phone: string): string { return phone.replace(/[^0-9]/g,''); }
export function orderDetailsIssue(shipping: ShippingDetails, createCustomer: boolean, customerId: string | null): string | null {
  if (shipping.method === 'pickup' && (!shipping.recipientName.trim() || !shipping.phone.trim())) return 'Pickup needs a recipient name and phone number.';
  if (shipping.method === 'in_store' && (shipping.recipientName || shipping.phone || shipping.address)) return 'In-store recipient fields must be empty. Select the customer account separately.';
  if (shipping.method === 'delivery' && !['jt','vet','grab','other'].includes(shipping.carrier || '')) return 'Choose a shipping type (carrier).';
  if (typeof shipping.carrierOther !== 'undefined' && (typeof shipping.carrierOther !== 'string' || shipping.carrierOther.length > 80)) return 'Carrier name must be 80 characters or fewer.';
  if (createCustomer && (customerId !== null || shipping.method === 'in_store' || !shipping.recipientName.trim() || customerPhoneKey(shipping.phone).length < 5 || customerPhoneKey(shipping.phone).length > 20)) return 'To save a new customer, enter a recipient name and a valid phone, without selecting an existing customer.';
  return null;
}
