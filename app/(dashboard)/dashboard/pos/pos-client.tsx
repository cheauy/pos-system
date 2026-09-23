'use client';

import Link from 'next/link';
import { posBranchSwitchReason } from '@/lib/branches/switch-model';
import { useWorkspaceBranch, useBranchSwitchGuard } from "../workspace-branch-provider";
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Barcode, Banknote, Check, ChevronDown, Clock, CreditCard, Gift, Grid2X2, Heart, List, Minus, Package, Plus, Printer, RefreshCw, Search, Settings2, ShoppingCart, SlidersHorizontal, Store, Trash2, UserRound, X } from 'lucide-react';
import { allocatePosStock, checkPosSale, completePosSale, deletePosHold, loadPosWorkspace, savePosHold, savePosSettings } from './pos-workspace-actions';
import { cartIssue, cents, configuredLine, discountIssue, EMPTY_FILTERS, inventoryFor, isVariantGroup, restoreHeldDraft, money, productGroups, stockFor, thresholdFor, totals, validateCheckout } from './pos-workspace-helpers';
import { currencyQuote, currencySymbol, quoteMoney } from './pos-currency';
import { CurrencyAmountInput } from './pos-currency-components';
import { CheckoutPanel, VariantPicker } from './pos-workspace-flow';
import { BarcodeScanner, Modal, ProductImage, ReceiptContent } from './pos-workspace-components';
import { PosCustomerPicker } from './pos-customer-picker';
import type { PickerCustomer } from './pos-customer-helpers';
import type { CartDraft, CartLine, CatalogFilters, CheckoutInput, DiscountType, ShippingDetails, HeldOrder, PaymentMethod, Product, ProductGroup, SaleReceipt, Tender, Workspace } from './pos-workspace-types';
import s from './pos-workspace.module.css';

type Dialog = 'scan' | 'variant' | 'options' | 'customer' | 'adjustments' | 'settings' | 'hold' | 'holds' | 'clear' | 'checkout' | 'stock' | 'receipt' | null;
function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const messageOf = (e: unknown) => e instanceof Error ? e.message : 'The request failed. Please try again.';

export default function PosClient({ initialData }: { initialData: Workspace }) {
  const { requestSwitch } = useWorkspaceBranch();
  const [data, setData] = useState(initialData);
  const [branch, setBranch] = useState(initialData.defaultBranchId);
  const [filters, setFilters] = useState<CatalogFilters>({ ...EMPTY_FILTERS });
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [extraFilters, setExtraFilters] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [shown, setShown] = useState(32);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [cartCurrency,setCartCurrency] = useState(initialData.settings.currency);
  const [selectedCurrency,setSelectedCurrency] = useState(initialData.settings.currency);
  const [createCustomer,setCreateCustomer] = useState(false);
  const [entryErrors,setEntryErrors] = useState<Record<string,string|null>>({});
  const [discountEntryError,setDiscountEntryError] = useState<string|null>(null);
  const recipientEdited = useRef(false);
  const previousCurrencySettings = useRef(`${initialData.settings.dualCurrencyEnabled}:${initialData.settings.usdKhrRate}`);
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [shipping, setShipping] = useState<ShippingDetails>({ method:'in_store',recipientName:'',phone:'',address:'' });
  const [adjustmentDraft, setAdjustmentDraft] = useState({ discount:'0',discountType:'amount' as DiscountType,points:'0' });
  const [allocationGroup, setAllocationGroup] = useState<ProductGroup | null>(null);
  const [allocationPreview, setAllocationPreview] = useState<Array<{ productId:string; quantity:number }>>([]);
  const [delivery, setDelivery] = useState('0');
  const [points, setPoints] = useState('0');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paid, setPaid] = useState('');
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [variantGroup, setVariantGroup] = useState<ProductGroup | null>(null);
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [hold, setHold] = useState<HeldOrder | null>(null);
  const [holdLabel, setHoldLabel] = useState('');
  const [holdDelete, setHoldDelete] = useState<string | null>(null);
  const [taxSetting, setTaxSetting] = useState(String(initialData.settings.taxRate));
  const [pointSetting, setPointSetting] = useState(String(initialData.settings.pointValue));
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'error' | 'success' | 'info' } | null>(null);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState('');
  const [recovery, setRecovery] = useState<CheckoutInput | null>(null);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [clock, setClock] = useState(initialData.loadedAt);
  const inFlight = useRef(false);
  const recoveryRef = useRef<CheckoutInput | null>(null);
  const holdIdRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const favoriteKey = `tenh-pos:favorites:${initialData.businessId}:${initialData.userId}`;
  const recoveryKey = `tenh-pos:pending-sale:${initialData.businessId}:${initialData.userId}`;
  const frozen = Boolean(busy || recovery);
  useBranchSwitchGuard(targetId => posBranchSwitchReason(targetId, {
    busy: Boolean(inFlight.current || busy), pendingBranchId: (recoveryRef.current || recovery)?.branchId || null,
    hasCart: lines.length > 0, hasDialog: Boolean(dialog),
  }));
  const customer = data.customers.find(c => c.id === customerId);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const values = totals(lines, Number(discount), Number(delivery), Number(points), Number(data.settings.taxRate), Number(data.settings.pointValue), discountType);
  const quote = currencyQuote(data.settings);
  const cash = (value: number) => quoteMoney(value, quote);
  const productIssue = cartIssue(lines, branch, data);
  const amountIssue = discountIssue(Number(discount), discountType, values.subtotal) || ([delivery, points].some(v => !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 999999999) ? 'Enter valid discount, delivery and points amounts.' : values.discount > values.subtotal ? 'Discount and redeemed points exceed the merchandise subtotal.' : !Number.isInteger(Number(points)) ? 'Loyalty points must be a whole number.' : Number(points) > Number(customer?.loyalty_points ?? 0) ? 'The customer does not have enough loyalty points.' : null);
  const currencyChanged = lines.length > 0 && cartCurrency !== data.settings.currency ? 'The store accounting currency changed. Clear this unsaved cart and start again; prices cannot be reinterpreted as another currency.' : null;
  const issue = currencyChanged || productIssue || amountIssue;
  const groups = useMemo(() => productGroups(data, branch, filters, favorites), [data, branch, filters, favorites]);
  const allGroupCount = useMemo(() => productGroups(data, branch, EMPTY_FILTERS, []).length, [data, branch]);
  const lowStockCount = data.products.filter(p => stockFor(p, branch, data) > 0 && stockFor(p, branch, data) <= thresholdFor(p, branch, data)).length;
  const brands = Array.from(new Set(data.products.map(p => p.brand || 'unbranded'))).sort();
  const colors = Array.from(new Set(data.products.map(p => p.color).filter((v): v is string => Boolean(v)))).sort();
  const sizes = Array.from(new Set(data.products.map(p => p.size).filter((v): v is string => Boolean(v)))).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeFilters = Object.entries(filters).filter(([k,v]) => k !== 'sort' && k !== 'search' && (k === 'favoritesOnly' ? v : v !== 'all'));
  const branchName = data.branches.find(b => b.id === branch)?.name || 'All branches';
  const timezone = data.branches.find(b => b.id === branch)?.timezone || 'Asia/Phnom_Penh';
  let dateLabel = '', timeLabel = '';
  try { dateLabel = new Date(clock).toLocaleDateString('en-GB', { timeZone: timezone, day: '2-digit', month: 'short', year: 'numeric' }); timeLabel = new Date(clock).toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }); } catch { dateLabel = new Date(clock).toISOString().slice(0,10); timeLabel = 'UTC'; }

  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem(favoriteKey) || '[]'); if (Array.isArray(stored)) setFavorites(stored.filter(v => typeof v === 'string')); } catch { /* Favorites are optional, never block checkout. */ }
    try {
      const pending = JSON.parse(sessionStorage.getItem(recoveryKey) || 'null');
      if (pending && typeof pending.requestId === 'string') { recoveryRef.current = pending; setRecovery(pending); setNotice({ text: 'A previous sale needs confirmation. Check or retry that same sale before starting another.', kind: 'info' }); }
    } catch { /* No readable pending sale. */ }
    setRecoveryLoaded(true);
  }, [favoriteKey, recoveryKey]);
  useEffect(() => { const timer = setInterval(() => setClock(new Date().toISOString()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { setShown(32); }, [filters, branch, view]);
  useEffect(() => { setConfirmed(false); }, [lines, discount, discountType, delivery, points, method, tenders, customerId, shipping, createCustomer, selectedCurrency, data.settings.usdKhrRate]);
  useEffect(() => { setPaid(''); }, [values.total, method]);
  useEffect(() => {
    if (!lines.length && !recovery) return;
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [lines.length, recovery]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (event.key === 'F2' && !dialog) { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [dialog]);

  useEffect(() => {
    const key=`${data.settings.dualCurrencyEnabled}:${data.settings.usdKhrRate}`;
    if (previousCurrencySettings.current === key) return;
    previousCurrencySettings.current=key;
    if (recoveryRef.current) return;
    if (!data.settings.dualCurrencyEnabled) setSelectedCurrency(data.settings.currency);
    setPaid('');setConfirmed(false);setEntryErrors({});
    setNotice({kind:'info',text:'Currency settings changed. The current order display has updated; product prices and saved orders are unchanged. Review payment again.'});
  },[data.settings.dualCurrencyEnabled,data.settings.usdKhrRate,data.settings.currency]);
  useEffect(() => {
    const reload=()=>{if(!inFlight.current && !recoveryRef.current && document.visibilityState === 'visible') void refresh(true);};
    let channel:BroadcastChannel|null=null;
    try {if(typeof BroadcastChannel !== 'undefined')channel=new BroadcastChannel(`tenh-pos-currency:${initialData.businessId}`);} catch { /* Restricted browser: refresh on focus still works. */ }
    if(channel) channel.onmessage=reload;
    const storage=(event:StorageEvent)=>{if(event.key===`tenh-pos-currency:${initialData.businessId}`)reload();};
    window.addEventListener('focus',reload);window.addEventListener('storage',storage);
    return ()=>{channel?.close();window.removeEventListener('focus',reload);window.removeEventListener('storage',storage);};
  },[initialData.businessId]);
  function setEntryError(key:string,error:string|null) { setEntryErrors(old=>old[key]===error?old:{...old,[key]:error}); }

  function selectCustomer(id:string) {
    const next=data.customers.find(c=>c.id===id);
    setCustomerId(next?.id || '');setPoints('0');setCreateCustomer(false);recipientEdited.current=false;
    setShipping(old=>next?{...old,recipientName:next.name,phone:next.phone || '',address:next.address || ''}:{method:'in_store',recipientName:'',phone:'',address:'',carrier:'',carrierOther:''});
    if(!next){setDelivery('0');setMethod('cash');setTenders([]);}
    setPaid('');setEntryErrors({});setDialog(null);setConfirmed(false);
  }
  function upsertWorkspaceCustomer(row: PickerCustomer) {
    setData(old => ({ ...old, customers: [{ id: row.id, name: row.name, phone: row.phone, address: row.address || '', loyalty_points: Number(row.loyalty_points || 0) }, ...old.customers.filter(c => c.id !== row.id)] }));
  }
  function selectPickerCustomer(row: PickerCustomer) {
    upsertWorkspaceCustomer(row);
    setCustomerId(row.id);setPoints('0');setCreateCustomer(false);recipientEdited.current=false;
    setShipping(old => ({ ...old, recipientName: row.name, phone: row.phone || '', address: row.address || '' }));
    setPaid('');setEntryErrors({});setDialog(null);setConfirmed(false);
  }
  function handleCustomerCreated(row: PickerCustomer) {
    upsertWorkspaceCustomer(row);
    setNotice({ kind: 'success', text: `${row.name} saved. You can select the new customer now.` });
  }
  function setPickerBusy(value: boolean) {
    if (value) setBusy('customer-picker');
    else setBusy(current => current === 'customer-picker' ? '' : current);
  }
  function selectPickup() {
    if (frozen) return;
    // Guest pickup is an order type, not a saved customer or a loyalty account.
    // Clear contact details from the previous customer instead of reusing them.
    setCustomerId('');setPoints('0');setCreateCustomer(false);recipientEdited.current=false;
    setShipping({method:'pickup',recipientName:'',phone:'',address:'',carrier:'',carrierOther:''});
    setDelivery('0');setMethod('cash');setPaid('');setTenders([]);setConfirmed(false);setEntryErrors({});
    setDialog(null);setModalError('');
  }
  function useCustomerDetails() {
    if(!customer)return;
    recipientEdited.current=false;
    setShipping(old=>({...old,recipientName:customer.name,phone:customer.phone || '',address:customer.address || ''}));
    setNotice({kind:'info',text:'Saved customer details copied to this order. Editing them here does not update the customer account.'});
  }
  function updateShipping(next:ShippingDetails) {
    const changingMethod=next.method!==shipping.method;
    if(!changingMethod)recipientEdited.current=true;
    if(changingMethod && next.method!=='in_store' && customer && !recipientEdited.current) {
      next={...next,recipientName:customer.name,phone:customer.phone || '',address:customer.address || ''};
    }
    setShipping(next);
  }
  function open(next: Dialog) { if (next === 'adjustments') {setAdjustmentDraft({discount,discountType,points});setDiscountEntryError(null);} setModalError(''); setDialog(next); }
  function changeFilter<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) { setFilters(previous => ({ ...previous, [key]: value })); }
  function favorite(key: string) {
    setFavorites(previous => { const next = previous.includes(key) ? previous.filter(id => id !== key) : [...previous, key]; try { localStorage.setItem(favoriteKey, JSON.stringify(next)); } catch { setNotice({ text: 'Favorites are available this session only because browser storage is unavailable.', kind: 'info' }); } return next; });
  }
  async function refresh(silent = false) {
    if (!silent && inFlight.current) return;
    if (!silent) setBusy('refresh');
    try { const result = await loadPosWorkspace(data.businessId, branch); if (result.success) { setData(result.data); if (!silent) setNotice({ kind: 'success', text: 'Products, stock and held orders refreshed.' }); } else setNotice({ kind: 'error', text: result.message }); }
    catch (e) { setNotice({ kind: 'error', text: messageOf(e) }); }
    finally { if (!silent) setBusy(''); }
  }
  async function changeBranch(next: string) {
    if (next === branch || frozen) return;
    await requestSwitch(next);
  }
  function addProduct(product: Product, ids: string[] = []): boolean {
    if (frozen) return false;
    if(!branch){setNotice({kind:"info",text:"Choose a branch before adding products to an order."});return false;}
    try {
      const line = configuredLine(product, ids, data);
      const existing = lines.find(l => l.key === line.key);
      const next = existing ? lines.map(l => l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l) : [...lines, line];
      const error = cartIssue(next, branch, data);
      if (error) throw new Error(error);
      if(!lines.length)setCartCurrency(data.settings.currency);setLines(next); setNotice({ kind: 'success', text: `${product.name} added to the current order.` });
      setDialog(null); return true;
    } catch (e) { setModalError(messageOf(e)); setNotice({ kind: 'error', text: messageOf(e) }); return false; }
  }
  function chooseProduct(product: Product) {
    if (product.product_type === 'configurable') {
      setOptionProduct(product); setOptionIds(data.options.filter(o => o.product_id === product.id && o.is_active && o.is_default).map(o => o.id)); open('options');
    } else addProduct(product);
  }
  function chooseGroup(group: ProductGroup) {
    if (isVariantGroup(group) || group.stock <= 0) { setVariantGroup(group); open('variant'); }
    else chooseProduct(group.variants[0]);
  }
  function scan(code: string): boolean {
    const exact = code.trim().toLowerCase();
    const matched = data.products.filter(p => p.barcode?.toLowerCase() === exact || p.sku?.toLowerCase() === exact);
    if (matched.length !== 1) { if (matched.length > 1) { changeFilter('search', code); setNotice({ kind: 'error', text: 'Several products share this barcode or SKU. Select the correct item manually.' }); } return false; }
    if (matched[0].product_type === 'configurable') { chooseProduct(matched[0]); return true; }
    return addProduct(matched[0]);
  }
  function updateQuantity(key: string, delta: number) {
    const next = lines.map(l => l.key === key ? { ...l, quantity: l.quantity + delta } : l).filter(l => l.quantity > 0);
    // Reducing/removing remains available even when some other item became invalid.
    const error = delta > 0 ? cartIssue(next, branch, data) : null;
    if (error) setNotice({ kind: 'error', text: error }); else setLines(next);
  }
  function updatePrices() {
    try { const next = lines.map(l => { const p = data.products.find(p => p.id === l.productId); if (!p) throw new Error(`${l.name} is unavailable; remove it first.`); return { ...configuredLine(p, l.optionIds, data), quantity: l.quantity }; }); setLines(next); setNotice({ kind: 'success', text: 'Cart prices updated. Review the total before taking payment.' }); }
    catch (e) { setNotice({ kind: 'error', text: messageOf(e) }); }
  }
  function clearCart() { setCreateCustomer(false);setEntryErrors({});recipientEdited.current=false;setLines([]); setCustomerId(''); setPoints('0'); setDiscount('0'); setDiscountType('amount'); setShipping({method:'in_store',recipientName:'',phone:'',address:''}); setDelivery('0'); setNote(''); setMethod('cash'); setPaid(''); setTenders([]); setConfirmed(false); setHold(null); holdIdRef.current = null; }
  function draft(): CartDraft { return { branchId: branch, customerId, lines, discount:discount || '0', discountType, shipping, tenders, displayCurrency:quote.displayCurrency, baseCurrency:cartCurrency, createCustomer, deliveryFee:delivery || '0', points:points || '0', note, paymentMethod: method }; }
  async function saveHold() {
    if (inFlight.current || frozen) return;
    if (!holdLabel.trim()) { setModalError('Enter a label for the held order.'); return; }
    if (currencyChanged || amountIssue) { setModalError(currencyChanged || amountIssue || 'Review this cart.'); return; }
    inFlight.current = true; setBusy('hold');
    try {
      const id = hold?.id || holdIdRef.current || newRequestId(); holdIdRef.current = id;
      const result = await savePosHold(data.businessId, id, hold?.version ?? null, holdLabel, draft());
      if (!result.success) { setModalError(result.message); return; }
      clearCart(); setDialog(null); setNotice({ kind: 'success', text: 'Order held. No payment taken and no stock reserved.' }); await refresh(true);
    } catch (e) { setModalError(`${messageOf(e)} Your cart is still here. Check Held Orders before retrying.`); }
    finally { inFlight.current = false; setBusy(''); }
  }
  async function resume(saved: HeldOrder) {
    if (inFlight.current || frozen) return;
    if (lines.length) { setModalError('Hold or clear the current cart before resuming another order.'); return; }
    inFlight.current = true; setBusy('resume');
    try {
      const result = await loadPosWorkspace(data.businessId, branch);
      if (!result.success) throw new Error(result.message);
      const latest = result.data.holds.find(h => h.id === saved.id);
      if (!latest) throw new Error('This hold was deleted or completed elsewhere. Refresh Held Orders.');
      const d = restoreHeldDraft(latest, result.data);
      setData(result.data); setCartCurrency(result.data.settings.currency); setLines(d.lines); setBranch(d.branchId); setCustomerId(d.customerId);
      setDiscount(d.discount); setDiscountType(d.discountType || 'amount'); setShipping(d.shipping!); setDelivery(d.deliveryFee);
      setPoints(d.points); setNote(d.note); setMethod(d.paymentMethod); setTenders(d.tenders || []); setSelectedCurrency(d.displayCurrency || result.data.settings.currency);setCreateCustomer(d.createCustomer === true && !d.customerId);recipientEdited.current=true;setEntryErrors({});
      // Saved allocations are drafts, never proof that payment was received.
      setPaid(''); setConfirmed(false); setHold(latest); setHoldLabel(latest.label); holdIdRef.current = latest.id; setDialog(null);
      setNotice({ kind:'info',text:'Held order resumed with its size/color, discount, shipping and split draft. Current prices and stock were loaded. Review totals and confirm payment again.' });
    } catch (e) { setModalError(messageOf(e)); }
    finally { inFlight.current = false; setBusy(''); }
  }
  async function removeHold(saved: HeldOrder) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('deleteHold');
    try { const result = await deletePosHold(data.businessId, saved.id, saved.version); if (!result.success) setModalError(result.message); else { setHoldDelete(null); if (hold?.id === saved.id) setHold(null); await refresh(true); } }
    catch (e) { setModalError(messageOf(e)); }
    finally { inFlight.current = false; setBusy(''); }
  }
  function changePayment(next: PaymentMethod, total = values.total) {
    setMethod(next); setConfirmed(false);setEntryErrors({});
    if (next === 'split' && tenders.length < 2) {
      const first = Math.floor(cents(total) / 2) / 100;
      setTenders([{method:'cash',amount:first,reference:''},{method:'bank_transfer',amount:(cents(total)-cents(first))/100,reference:''}]);
    }
  }
  async function beginCheckout(split = false) {
    if (inFlight.current || frozen || !recoveryLoaded) return;
    if (!lines.length || issue) { setNotice({kind:'error',text:issue || 'Add products first.'}); return; }
    inFlight.current = true; setBusy('review');
    try {
      const result = await loadPosWorkspace(data.businessId, branch);
      if (!result.success) throw new Error(result.message);
      if(result.data.checkoutVersion !== 3) throw new Error('Apply 20260919_pos_customer_delivery_currency.sql, then refresh POS.');
      if (!result.data.shift || result.data.shift.location_id !== branch) throw new Error('Open the register for this branch before taking payment. Your cart has not been submitted.');
      setData(result.data);
      const error = cartIssue(lines,branch,result.data);
      if (error) throw new Error(error);
      const quote = totals(lines,Number(discount),Number(delivery),Number(points),Number(result.data.settings.taxRate),Number(result.data.settings.pointValue),discountType);
      if (split && quote.total < 0.02) throw new Error('Split payment needs a total of at least 0.02.');
      if (split) changePayment('split',quote.total);
      const latestCustomer=result.data.customers.find(c=>c.id===customerId);
      if(latestCustomer && !recipientEdited.current)setShipping(old=>({...old,recipientName:latestCustomer.name,phone:latestCustomer.phone || '',address:latestCustomer.address || ''}));
      setEntryErrors({});
      setConfirmed(false); open('checkout');
    } catch (e) { setNotice({kind:'error',text:messageOf(e)}); }
    finally { inFlight.current = false; setBusy(''); }
  }
  function reviewAllocation(group: ProductGroup) {
    setAllocationGroup(group);
    setAllocationPreview(group.variants.map(p => ({productId:p.id,quantity:inventoryFor(p,branch,data).unassigned})).filter(row => row.quantity > 0));
    open('stock');
  }
  async function allocateStock() {
    if (inFlight.current || frozen || !allocationPreview.length) return;
    inFlight.current = true; setBusy('allocate');
    try {
      const result = await allocatePosStock(data.businessId,branch,allocationPreview);
      if (!result.success) throw new Error(result.message);
      await refresh(true); setDialog(null); setNotice({kind:'success',text:'Existing stock assigned to this branch. No global stock was added. Choose your size and color again.'});
    } catch (e) { setModalError(messageOf(e)); }
    finally { inFlight.current = false; setBusy(''); }
  }
  function receivedAmount() { return method === 'credit' ? 0 : method === 'split' || method === 'bank_transfer' || method === 'other' ? values.total : paid === '' ? method === 'cash' ? values.total : 0 : Number(paid); }
  function saleInput(requestId: string): CheckoutInput {
    return { uiVersion:3,currencyQuote:quote,createCustomer:createCustomer && !customerId && shipping.method !== 'in_store',requestId, branchId:branch, customerId:customerId || null,
      items:lines.map(l => ({productId:l.productId,quantity:l.quantity,optionIds:l.optionIds,expectedUnitPrice:l.unitPrice})),
      paymentMethod:method,amountPaid:receivedAmount(),tenders:method === 'split' ? tenders : [],paymentsConfirmed:confirmed,
      discount:values.manualDiscount,discountType,discountValue:Number(discount),shipping:shipping.method === 'in_store' ? {method:'in_store',recipientName:'',phone:'',address:'',carrier:'',carrierOther:''} : {...shipping,carrier:shipping.method==='delivery'?shipping.carrier || '':'',carrierOther:shipping.method==='delivery' && shipping.carrier==='other'?shipping.carrierOther || '':''},
      deliveryFee:Number(delivery),redeemPoints:Number(points),note,expectedTotal:values.total,expectedTaxRate:Number(data.settings.taxRate),holdId:hold?.id ?? null,holdVersion:hold?.version ?? null };
  }
  const reviewIssue = Object.values(entryErrors).find(Boolean) || (method === 'cash' && paid === '' && values.total > 0 ? 'Enter cash received or choose Exact amount.' : null) || issue || validateCheckout(saleInput('00000000-0000-4000-8000-000000000000'));
  function setPending(input: CheckoutInput | null) {
    recoveryRef.current = input; setRecovery(input);
    if (input) sessionStorage.setItem(recoveryKey, JSON.stringify(input));
    else { try { sessionStorage.removeItem(recoveryKey); } catch { /* Server receipt has already confirmed the outcome. */ } }
  }
  async function finishReceipt(r: SaleReceipt) {
    setPending(null); setReceipt(r); clearCart(); setDialog('receipt'); setNotice({ kind: 'success', text: `Sale ${r.orderNumber} saved. ${r.remaining > 0 ? 'A balance remains due.' : 'Payment recorded.'}` }); await refresh(true);
  }
  async function submit(retry = false) {
    if (!retry && reviewIssue) { setModalError(reviewIssue); return; }
    if (inFlight.current || busy) return;
    let input = retry ? recoveryRef.current : null;
    if (!retry) {
      if (recoveryRef.current || !recoveryLoaded) return;
      if (issue || !lines.length) { setNotice({ kind: 'error', text: issue || 'Add products before completing the sale.' }); return; }
      input = saleInput(newRequestId());
      const error = validateCheckout(input); if (error) { setModalError(error); setNotice({ kind:'error',text:error }); return; }
    }
    if (!input) return;
    inFlight.current = true; setBusy('checkout'); setNotice(null);
    try {
      // Persist BEFORE sending; this same token survives a reload or lost response.
      try { setPending(input); } catch { if (!retry) { recoveryRef.current = null; setRecovery(null); } setNotice({ kind: 'error', text: 'Browser session storage is unavailable. Enable it before checkout so an interrupted sale can be recovered safely.' }); return; }
      const result = await completePosSale(data.businessId, input);
      if (result.success) await finishReceipt(result.data);
      else { if (!result.uncertain) setPending(null); setModalError(result.message); if (result.uncertain) setDialog(null); setNotice({ kind:'error',text:result.message }); await refresh(true); }
    } catch { setDialog(null); setNotice({ kind: 'error', text: 'The sale result is not confirmed. Do not take payment again. Check or retry this same sale below; its request ID prevents a duplicate order.' }); }
    finally { inFlight.current = false; setBusy(''); }
  }
  async function checkPending() {
    if (inFlight.current || !recoveryRef.current) return;
    inFlight.current = true; setBusy('check');
    try {
      const result = await checkPosSale(data.businessId, recoveryRef.current.requestId);
      if (!result.success) setNotice({ kind: 'error', text: result.message });
      else if (result.data) await finishReceipt(result.data);
      else setNotice({ kind: 'info', text: 'No completed result was found yet. Use “Retry same sale”; do not create a different request or collect payment again.' });
    } catch (e) { setNotice({ kind: 'error', text: messageOf(e) }); }
    finally { inFlight.current = false; setBusy(''); }
  }
  async function saveSettings() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('settings');
    try { const result = await savePosSettings(data.businessId, Number(taxSetting), Number(pointSetting)); if (!result.success) setModalError(result.message); else { await refresh(true); setDialog(null); setConfirmed(false); setNotice({ kind: 'success', text: 'POS rates saved. Review the recalculated total.' }); } }
    catch (e) { setModalError(messageOf(e)); }
    finally { inFlight.current = false; setBusy(''); }
  }

  return <main className={s.workspace} ref={rootRef}>
    <div className={s.catalogColumn}>
      <header className={s.pageHeader}>
        <div><h1>Point of Sale</h1><p>Search products, filter inventory, and complete sales quickly.</p></div>
        <div className={s.headerStats}>
          <div className={s.productSummary} aria-label="Products">
            <div className={s.productCount}><span><Package size={19}/></span><div><strong>{allGroupCount}</strong><small>Products</small></div></div>

          </div>
          <button className={`${s.miniStat} ${s.warningStat}`} onClick={() => changeFilter('stock', filters.stock === 'low' ? 'all' : 'low')} aria-pressed={filters.stock === 'low'}><span><AlertTriangle size={19} /></span><div><strong>{lowStockCount}</strong><small>Low stock SKUs</small></div></button>
          <label className={s.branchStat}><Store size={19} /><span><small>Branch</small><select aria-label="Sale branch" value={branch} onChange={e => changeBranch(e.target.value)} disabled={frozen}>{data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></span></label>
        </div>
      </header>
      {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`${s.notice} ${notice.kind === 'error' ? s.error : notice.kind === 'success' ? s.success : ''}`}><span>{notice.text}</span><button className={s.iconButton} aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={16} /></button></div>}
      {recovery && <section className={`${s.notice} ${s.recovery}`}><div><strong>Confirm interrupted sale · {cash(recovery.expectedTotal)}</strong><p>Request {recovery.requestId.slice(0,8)}. The cart is locked until the saved request is resolved.</p></div><div className={s.row}><button className={s.button} disabled={Boolean(busy)} onClick={checkPending}>Check sale</button><button className={s.primary} disabled={Boolean(busy)} onClick={() => submit(true)}>Retry same sale</button></div></section>}
      <section className={s.filterPanel} aria-label="Product search and filters">
        <div className={s.searchRow}><div className={s.searchInput}><Search size={19} /><input ref={searchRef} value={filters.search} onChange={e => changeFilter('search', e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && filters.search.trim()) { e.preventDefault(); scan(filters.search); } }} placeholder="Search by product name, SKU, or barcode…" aria-label="Search products" /><kbd>F2</kbd></div><button className={s.softButton} onClick={() => open('scan')} disabled={frozen}><Barcode size={20} /> Scan Barcode</button></div>
        <div className={s.filterRow}>
          <label className={s.filterSelect}><span>Category</span><select aria-label="Category" value={filters.category} onChange={e => changeFilter('category', e.target.value)}><option value="all">All categories</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className={s.filterSelect}><span>Brand</span><select aria-label="Brand" value={filters.brand} onChange={e => changeFilter('brand', e.target.value)}><option value="all">All brands</option>{brands.map(b => <option key={b} value={b}>{b === 'unbranded' ? 'Unbranded' : b}</option>)}</select></label>
          <label className={s.filterSelect}><span>Stock status</span><select aria-label="Stock status" value={filters.stock} onChange={e => changeFilter('stock', e.target.value)}><option value="all">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
          <label className={s.filterSelect}><span>Price range</span><select aria-label="Price range" value={filters.price} onChange={e => changeFilter('price', e.target.value)}><option value="all">Any price</option><option value="under25">Under {cash(25)}</option><option value="25to100">{cash(25)} – {cash(100)}</option><option value="over100">Over {cash(100)}</option></select></label>
          <div className={s.viewToggle} aria-label="Product view"><button className={view === 'grid' ? s.activeView : ''} onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}><Grid2X2 size={18}/></button><button className={view === 'list' ? s.activeView : ''} onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}><List size={19}/></button></div>
          <button className={s.button} onClick={() => setExtraFilters(!extraFilters)} aria-expanded={extraFilters}><SlidersHorizontal size={17} /> Filters</button>
        </div>
        {extraFilters && <div className={s.extraFilters}><label>Color<select aria-label="Color" value={filters.color} onChange={e => changeFilter('color', e.target.value)}><option value="all">All colors</option>{colors.map(c => <option key={c}>{c}</option>)}</select></label><label>Size<select aria-label="Size" value={filters.size} onChange={e => changeFilter('size', e.target.value)}><option value="all">All sizes</option>{sizes.map(v => <option key={v}>{v}</option>)}</select></label><label className={s.checkLabel}><input type="checkbox" checked={filters.favoritesOnly} onChange={e => changeFilter('favoritesOnly', e.target.checked)} /> Favorites only</label></div>}
        <div className={s.chipsRow}><div className={s.chips}><button className={!activeFilters.length ? s.chipActive : s.chip} onClick={() => setFilters({ ...EMPTY_FILTERS, search: filters.search, sort: filters.sort })}>All products</button>{activeFilters.map(([key,value]) => <button key={key} className={s.chip} onClick={() => setFilters(old => ({ ...old, [key]: key === 'favoritesOnly' ? false : 'all' }))}>{key === 'category' ? data.categories.find(c => c.id === value)?.name : key === 'favoritesOnly' ? 'Favorites' : `${key}: ${value}`}<X size={12}/></button>)}{(activeFilters.length > 0 || filters.search) && <button className={s.textButton} onClick={() => setFilters({ ...EMPTY_FILTERS })}>Clear all</button>}</div><label className={s.sortLabel}>Sort:<select aria-label="Sort products" value={filters.sort} onChange={e => changeFilter('sort', e.target.value)}><option value="popular">Popular (30 days)</option><option value="name">Name A–Z</option><option value="newest">Newest</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option></select></label></div>
      </section>
      <div className={s.catalogMeta}><span>{groups.length} products · {branchName}{data.shift ? ' · Open register' : ' · No open register'}</span><div className={s.row}><button className={s.textButton} disabled={Boolean(busy)} onClick={() => refresh()}><RefreshCw size={14} className={busy === 'refresh' ? s.spin : ''}/> Refresh stock</button>{data.canConfigure && <button className={s.textButton} disabled={frozen} onClick={() => { setTaxSetting(String(data.settings.taxRate)); setPointSetting(String(data.settings.pointValue)); open('settings'); }}><Settings2 size={15}/> POS rates</button>}</div></div>
      {!groups.length ? <div className={s.empty}><Package size={38}/><h2>{data.products.length ? 'No matching products' : 'Your catalog is empty'}</h2><p>{data.products.length ? 'Try a different search or clear your filters.' : 'Create active products and add branch stock before selling.'}</p><button className={s.button} onClick={() => setFilters({ ...EMPTY_FILTERS })}>Reset filters</button></div> : <div className={view === 'grid' ? s.productGrid : s.productList}>
        {groups.slice(0, shown).map(group => {
          const inCart = lines.filter(l => group.variants.some(v => v.id === l.productId)).reduce((sum,l) => sum+l.quantity,0);
          const single = group.variants.length === 1 ? group.variants[0] : null;
          const isLow = group.stock > 0 && group.stock <= group.threshold;
          const groupLabel = group.stock > 0 ? (isLow ? 'Low stock' : 'In stock') : group.variants.some(p => inventoryFor(p,branch,data).unassigned > 0) ? 'Stock unassigned' : group.variants.some(p => Number(p.stock_quantity) > 0) ? 'Not at this branch' : 'Out of stock';
          return <article key={group.key} className={s.productCard}>
            <div className={s.productPhoto}><button className={s.photoButton} disabled={frozen || !branch} onClick={() => chooseGroup(group)} aria-label={`Choose ${group.name}`}><ProductImage src={group.image} alt={group.name}/></button><button className={`${s.favorite} ${group.favorite ? s.isFavorite : ''}`} aria-label={`${group.favorite ? 'Unfavorite' : 'Favorite'} ${group.name}`} aria-pressed={group.favorite} onClick={() => favorite(group.key)}><Heart size={18}/></button><span className={`${s.stockBadge} ${group.stock === 0 ? s.outStock : isLow ? s.lowStock : ''}`}>{groupLabel}</span>{inCart > 0 && <span className={s.cartBadge}>{inCart} in cart</span>}</div>
            <div className={s.productInfo}><small>{group.category}</small><h3 title={group.name}>{group.name}</h3><p className={s.sku}>{single ? `SKU: ${single.sku || '—'}` : `${group.variants.length} variants · choose size / color`}</p><div className={s.priceRow}><strong>{group.variants.length > 1 ? 'From ' : ''}{cash(group.price)}</strong>{single?.compare_at_price != null && single.compare_at_price > single.selling_price && <del>{cash(single.compare_at_price)}</del>}<span className={isLow ? s.orangeText : ''}>Stock: {group.stock}</span></div></div>
            <button className={s.addButton} disabled={frozen || !branch} onClick={() => chooseGroup(group)}><ShoppingCart size={17}/>{isVariantGroup(group) ? 'Choose Size / Color' : group.stock <= 0 ? 'View stock' : single?.product_type === 'configurable' ? 'Choose Options' : 'Add to Cart'}</button>
          </article>;
        })}
      </div>}
      {groups.length > shown && <button className={`${s.button} ${s.loadMore}`} onClick={() => setShown(n => n + 32)}>Show more products ({groups.length - shown} remaining)</button>}
      <p className={s.footnote}>Stock checked again on sale. Favorites are saved on this browser. “Popular” uses completed sales from the last 30 days.</p>
    </div>

    <aside className={s.orderPanel} aria-label="Current order">
      <header className={s.orderHeader}><ShoppingCart size={29}/><div><h2>Current Order</h2><p>{count} {count === 1 ? 'item' : 'items'}{hold ? ` · ${hold.label}` : ''}</p></div><div className={s.orderDate}><span>{dateLabel}</span><strong>{timeLabel}</strong></div></header>
      <fieldset disabled={frozen} className={s.orderFieldset}>
        <div className={s.customerBlock}><div className={s.between}><label>Customer</label><button className={s.dangerText} onClick={() => open('clear')} disabled={!lines.length}><Trash2 size={14}/> Clear All</button></div><button className={s.customerButton} onClick={() => open('customer')}><UserRound size={20}/><span>{customer?.name || (shipping.method === 'pickup' ? 'Pickup customer' : shipping.method === 'delivery' ? 'Delivery customer' : 'Walk-in customer')}{customer?.phone && <small>{customer.phone}</small>}</span><ChevronDown size={15}/></button>
          <button className={s.loyaltyBanner} onClick={() => open('adjustments')}><Gift size={23}/><span><strong>{!data.settings.loyaltyEnabled ? 'Loyalty program is off' : customer ? `${customer.loyalty_points || 0} loyalty points` : 'No loyalty account selected'}</strong><small>{!data.settings.loyaltyEnabled ? 'Enable loyalty in Promotions & Loyalty.' : !customer ? 'Add a customer to earn and redeem points.' : data.settings.pointValue > 0 ? `${cash(data.settings.pointValue)} per point · Manage redemption` : 'Earn points on eligible sales. Redemption is not configured.'}</small></span></button>
        </div>
        <div className={s.cartItems}>
          {!lines.length && <div className={s.cartEmpty}><ShoppingCart size={34}/><h3>Start a new sale</h3><p>Select a product or scan its barcode.</p></div>}
          {lines.map(line => <div key={line.key} className={s.cartItem}><ProductImage className={s.cartImage} src={line.image} alt={line.name}/><div className={s.cartItemInfo}><h3>{line.name}</h3>{line.variant && <p>{line.variant}</p>}{line.selectedOptions.length > 0 && <p>{line.selectedOptions.map(o => o.name).join(' · ')}</p>}<strong>{cash(line.unitPrice)}</strong></div><div className={s.quantity}><button aria-label={`Decrease ${line.name}`} onClick={() => updateQuantity(line.key,-1)}><Minus size={13}/></button><span aria-label={`Quantity of ${line.name}`}>{line.quantity}</span><button aria-label={`Increase ${line.name}`} disabled={line.quantity >= 999} onClick={() => updateQuantity(line.key,1)}><Plus size={13}/></button></div><strong className={s.lineTotal}>{cash(line.unitPrice * line.quantity)}</strong><button className={s.removeItem} aria-label={`Remove ${line.name}`} onClick={() => setLines(old => old.filter(l => l.key !== line.key))}><Trash2 size={15}/></button></div>)}
        </div>
        {issue && lines.length > 0 && <div className={`${s.notice} ${s.error}`}><span>{issue}</span><button className={s.textButton} onClick={updatePrices}>Update cart prices</button></div>}
        <div className={s.checkoutArea}><dl className={s.totals}><div><dt>Subtotal ({count} items)</dt><dd>{cash(values.subtotal)}</dd></div><div><dt><button onClick={() => open('adjustments')}>Discount{discountType === 'percent' ? ` (${discount}%)` : ''}{Number(points) > 0 ? ` · ${points} points` : ''}</button></dt><dd className={s.blueText}>−{cash(values.discount)}</dd></div><div><dt>Tax ({data.settings.taxRate}%)</dt><dd>{cash(values.tax)}</dd></div><div><dt>Shipping Fee</dt><dd>{cash(values.delivery)}</dd></div><div className={s.totalRow}><dt>Total</dt><dd>{cash(values.total)}</dd></div></dl>
          <p className={s.checkoutHint}>Continue to review payment and order type. No sale is saved until you confirm.</p>
          <label className={s.field}>Order note (optional)<textarea value={note} aria-label="Order note" onChange={e => setNote(e.target.value)} placeholder="Add a note to this order…" rows={2} maxLength={1000}/></label>
          <div className={s.checkoutButtons}><button className={s.softButton} disabled={!lines.length} onClick={() => { setHoldLabel(hold?.label || (customer ? `${customer.name}'s order` : `Order ${timeLabel}`)); open('hold'); }}><Clock size={16}/> Hold Order</button><button className={s.softButton} disabled={!lines.length || values.total < 0.02} onClick={() => beginCheckout(true)}><CreditCard size={16}/> Split Payment</button></div>
          <button className={s.completeButton} disabled={!lines.length || Boolean(issue) || !recoveryLoaded} onClick={() => beginCheckout()}><Check size={20}/>Continue · {cash(values.total)}</button>
        </div>
      </fieldset>
      <footer className={s.orderFooter}><button className={s.textButton} disabled={Boolean(busy) || Boolean(recovery)} onClick={() => { open('holds'); void refresh(true); }}><Clock size={15}/> Held Orders ({data.holds.length})</button><button className={s.textButton} disabled={!receipt || Boolean(busy)} onClick={() => open('receipt')}><Printer size={15}/> Last Receipt</button><Link href="/dashboard/register" onClick={e => { if (frozen || (lines.length && !window.confirm('Leave this sale? Hold the order first to keep it.'))) e.preventDefault(); }} className={s.textButton}><Banknote size={15}/> Register</Link></footer>
      {busy && <div className={s.busyOverlay} role="status"><RefreshCw className={s.spin} size={18}/>{busy === 'checkout' ? 'Saving sale. Please wait…' : 'Working…'}</div>}
    </aside>

    {dialog && <Modal title={{ scan:'Scan Barcode', variant:'Choose Product Variant', options:'Customize Product', customer:'Select Customer', adjustments:'Discount & Loyalty', settings:'POS Tax & Loyalty Value', hold:'Hold Current Order', holds:'Held Orders', clear:'Clear Current Order?', checkout:'Payment & Order Type', stock:'Assign Existing Stock', receipt:'Sale Saved' }[dialog]} onClose={() => { setDialog(null); setModalError(''); }} wide={['holds','variant','checkout','stock'].includes(dialog)} locked={Boolean(busy)}>
      <fieldset disabled={Boolean(busy)} className={s.flowFieldset}>
      {modalError && <p className={`${s.notice} ${s.error}`} role="alert">{modalError}</p>}
      {dialog === 'scan' && <BarcodeScanner onScan={scan}/>}
      {dialog === 'clear' && <div className={s.stack}><p>This clears the current cart, customer, discounts and payment entries. No completed sale is deleted.{hold ? ' The saved held order remains in Held Orders.' : ''}</p><div className={s.modalActions}><button className={s.button} onClick={() => setDialog(null)}>Keep order</button><button className={s.dangerButton} onClick={() => { clearCart(); setDialog(null); }}>Clear order</button></div></div>}
      {dialog === 'variant' && variantGroup && <VariantPicker quote={quote} group={variantGroup} data={data} branchId={branch} lines={lines} onAdd={chooseProduct} onAllocate={reviewAllocation} initialColor={filters.color} initialSize={filters.size}/>}
      {dialog === 'stock' && allocationGroup && <div className={s.stack}><p>Assign <strong>{allocationPreview.reduce((sum,row) => sum+row.quantity,0)} existing, unallocated units</strong> of {allocationGroup.name} to <strong>{branchName}</strong>?</p><p className={s.paymentInfo}>This does not increase total stock and does not take units from another branch. Confirm only when these units physically belong at this branch. The server rechecks every quantity.</p><div className={s.stack}>{allocationPreview.map(row => { const p = data.products.find(p => p.id === row.productId); return <div key={row.productId} className={s.between}><span>{[p?.color,p?.size,p?.sku].filter(Boolean).join(' · ')}</span><strong>{row.quantity} units</strong></div>; })}</div><div className={s.modalActions}><button className={s.button} onClick={() => open('variant')}>Back</button><button className={s.primary} disabled={!allocationPreview.length || !data.canConfigure} onClick={allocateStock}>Confirm branch allocation</button></div></div>}
      {dialog === 'checkout' && <CheckoutPanel quote={quote} customerId={customerId} customerName={customer?.name} onUseCustomer={useCustomerDetails} createCustomer={createCustomer} canCreateCustomer={data.canCreateCustomer === true} setCreateCustomer={setCreateCustomer} onEntryError={setEntryError} total={values.total} subtotal={values.subtotal} discount={values.discount} discountLabel={discountType === 'percent' ? `Discount (${discount}%)${Number(points) ? ' + loyalty' : ''}` : 'Discount / loyalty'} tax={values.tax} taxRate={data.settings.taxRate}
        shipping={shipping} setShipping={updateShipping} delivery={delivery} setDelivery={setDelivery}
        method={method} setMethod={changePayment} paid={paid} setPaid={setPaid} received={receivedAmount()}
        tenders={tenders} setTenders={setTenders} confirmed={confirmed} setConfirmed={setConfirmed}
        error={reviewIssue} busy={Boolean(busy)} onBack={() => setDialog(null)} onConfirm={() => submit()}/>}
      {dialog === 'options' && optionProduct && <div className={s.stack}><div className={s.productDialogHeading}><ProductImage src={optionProduct.image_url} alt={optionProduct.name}/><div><h3>{optionProduct.name}</h3><p>Base price {cash(Number(optionProduct.selling_price))}</p></div></div>{data.groups.filter(g => g.product_id === optionProduct.id).map(g => <fieldset className={s.optionFieldset} key={g.id}><legend>{g.name} <small>{g.is_required ? 'Required' : 'Optional'} · {g.selection_type === 'single' ? 'Choose one' : `Choose up to ${g.max_selections}`}</small></legend>{data.options.filter(o => o.group_id === g.id && o.is_active).map(o => <label className={s.optionChoice} key={o.id}><input type={g.selection_type === 'single' ? 'radio' : 'checkbox'} name={g.id} checked={optionIds.includes(o.id)} onChange={e => setOptionIds(old => g.selection_type === 'single' ? [...old.filter(id => !data.options.some(p => p.id === id && p.group_id === g.id)), o.id] : e.target.checked ? [...old,o.id] : old.filter(id => id !== o.id))}/><span>{o.name}</span><strong>{Number(o.price_adjustment) >= 0 ? '+' : ''}{cash(Number(o.price_adjustment))}</strong></label>)}{!g.is_required && <button className={s.textButton} onClick={() => setOptionIds(old => old.filter(id => !data.options.some(o => o.id === id && o.group_id === g.id)))}>Clear {g.name}</button>}</fieldset>)}<button className={s.primary} onClick={() => addProduct(optionProduct, optionIds)}><ShoppingCart size={17}/>Add configured item</button></div>}
      {dialog === 'customer' && <PosCustomerPicker
        businessId={data.businessId}
        branchId={branch}
        userId={data.userId}
        customerId={customerId}
        shippingMethod={shipping.method}
        canCreate={Boolean(data.canCreateCustomer)}
        onWalkIn={() => selectCustomer('')}
        onPickup={selectPickup}
        onSelect={selectPickerCustomer}
        onCreated={handleCustomerCreated}
        onBusyChange={setPickerBusy}
      />}
      {dialog === 'adjustments' && (() => {
        const quoteValues = totals(lines,Number(adjustmentDraft.discount),Number(delivery),Number(adjustmentDraft.points),Number(data.settings.taxRate),Number(data.settings.pointValue),adjustmentDraft.discountType);
        const invalid = discountEntryError || discountIssue(Number(adjustmentDraft.discount),adjustmentDraft.discountType,quoteValues.subtotal) || (!Number.isInteger(Number(adjustmentDraft.points)) || Number(adjustmentDraft.points) < 0 ? 'Enter a non-negative whole number of points.' : Number(adjustmentDraft.points) > Number(customer?.loyalty_points || 0) ? 'Not enough loyalty points.' : quoteValues.discount > quoteValues.subtotal ? 'Discount and points cannot exceed the merchandise subtotal.' : null);
        return <div className={s.stack}>
        <div className={s.field}><label>Discount</label>{adjustmentDraft.discountType === 'percent' ? <div className={s.amountWithSuffix}><input aria-label="Discount value" type="number" min="0" max="100" step="0.01" value={adjustmentDraft.discount} onChange={e=>setAdjustmentDraft(d=>({...d,discount:e.target.value}))}/><select aria-label="Discount type" value="percent" className={s.discountSuffix} onChange={()=>{setDiscountEntryError(null);setAdjustmentDraft(d=>({...d,discountType:'amount',discount:'0'}));}}><option value="amount">{currencySymbol(quote.displayCurrency)}</option><option value="percent">%</option></select></div> :
        <CurrencyAmountInput label="Discount value" value={adjustmentDraft.discount} quote={quote} onError={setDiscountEntryError} onChange={value=>setAdjustmentDraft(d=>({...d,discount:value}))} suffix={<select aria-label="Discount type" value="amount" className={s.discountSuffix} onChange={()=>{setDiscountEntryError(null);setAdjustmentDraft(d=>({...d,discountType:'percent',discount:'0'}));}}><option value="amount">{currencySymbol(quote.displayCurrency)}</option><option value="percent">%</option></select>}/>}
        <small>Discount amount: {cash(quoteValues.manualDiscount)} · Applied to merchandise only, before tax.</small></div>
        <label className={s.field}>Redeem loyalty points<input aria-label="Redeem loyalty points" type="number" min="0" step="1" max={customer?.loyalty_points || 0} value={adjustmentDraft.points} disabled={!customer || !data.settings.loyaltyEnabled || data.settings.pointValue <= 0} onChange={e => setAdjustmentDraft(d => ({...d,points:e.target.value}))}/><small>{customer ? `${customer.loyalty_points || 0} points available · ${cash(data.settings.pointValue)} per point` : 'Choose a customer first.'} Redeem only on fully paid sales.</small></label>
        <p className={s.paymentInfo}>Shipping and delivery fees are selected after Continue. Changing quantity recalculates a percentage discount automatically.</p>{invalid && <p role="alert" className={s.orangeText}>{invalid}</p>}<div className={s.between}><strong>Updated total</strong><strong>{cash(quoteValues.total)}</strong></div><button className={s.primary} disabled={Boolean(invalid)} onClick={() => {setDiscount(adjustmentDraft.discount);setDiscountType(adjustmentDraft.discountType);setPoints(adjustmentDraft.points);setDialog(null);}}>Apply to order</button></div>;
      })()}
      {dialog === 'settings' && <div className={s.stack}><p className={s.paymentInfo}>Owner settings for POS only. Both rates start at zero; set the rates appropriate for your business. Loyalty must also be enabled in Promotions & Loyalty.</p><label className={s.field}>Tax rate (%)<input type="number" min="0" max="100" step="0.001" value={taxSetting} onChange={e => setTaxSetting(e.target.value)}/></label><label className={s.field}>Redemption value of 1 point ({data.settings.currency})<input type="number" min="0" max="1000000" step="0.0001" value={pointSetting} onChange={e => setPointSetting(e.target.value)}/><small>Set zero to disable point redemption. Point earning rules remain in Promotions & Loyalty.</small></label><button className={s.primary} disabled={Boolean(busy)} onClick={saveSettings}>Save POS rates</button></div>}
      {dialog === 'hold' && <div className={s.stack}><p>{count} items · {branchName} · {cash(values.total)}</p><label className={s.field}>Held order label<input autoFocus value={holdLabel} onChange={e => setHoldLabel(e.target.value)} maxLength={80} placeholder="Customer name or order label"/></label><p className={s.paymentInfo}>Holds are saved to your account for this business. They do not reserve stock or record any payment. Prices, stock, points and payment are checked again when resumed.</p><button className={s.primary} disabled={Boolean(busy)} onClick={saveHold}><Clock size={17}/>Save held order</button></div>}
      {dialog === 'holds' && <div className={s.stack}><p className={s.muted}>Your saved holds for {data.businessName}. Other cashiers’ holds are not exposed.</p>{!data.holds.length && <div className={s.empty}><Clock size={30}/><h3>No held orders</h3><p>Add products, then choose Hold Order.</p></div>}{data.holds.map(h => <div className={s.heldCard} key={h.id}><div><strong>{h.label}</strong><p>{data.branches.find(b => b.id === h.draft.branchId)?.name || 'Unavailable branch'} · {h.draft.lines.reduce((sum,l) => sum+l.quantity,0)} items</p><small>Saved {new Date(h.updated_at).toLocaleString()}</small></div><div className={s.row}>{holdDelete === h.id ? <><span>Delete this hold?</span><button className={s.dangerButton} disabled={Boolean(busy)} onClick={() => removeHold(h)}>Delete</button><button className={s.button} onClick={() => setHoldDelete(null)}>Keep</button></> : <><button className={s.primary} disabled={Boolean(busy)} onClick={() => resume(h)}>Resume</button><button className={s.iconButton} aria-label={`Delete held order ${h.label}`} disabled={Boolean(busy)} onClick={() => setHoldDelete(h.id)}><Trash2 size={17}/></button></>}</div></div>)}</div>}
      {dialog === 'receipt' && receipt && <div className={s.stack}><p className={`${s.notice} ${s.success}`}><Check size={18}/>{receipt.remaining > 0 ? `Sale saved · ${cash(receipt.remaining)} balance due` : 'Sale saved and payment recorded.'}</p><ReceiptContent receipt={receipt} context={data.receiptContext}/><div className={s.modalActions}><Link className={s.button} href={`/dashboard/orders/${receipt.orderId}`}>View Order</Link><Link className={s.button} href={`/dashboard/pos/receipt/${receipt.orderId}`} target="_blank" rel="noopener noreferrer"><Printer size={17}/>Print Receipt</Link><button className={s.primary} onClick={() => { setDialog(null); searchRef.current?.focus(); }}><Plus size={17}/>Next Sale</button></div></div>}
      </fieldset>
    </Modal>}
  </main>;
}
