import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChoiceChip, LayoutPicker, Pagination } from './list-controls';
import { LoadingState, Shimmer } from './loading';
import { outputOrderDocument } from './order-document';
import {useViewPreference} from './view-preference';
import { matchingVariants } from './variant-selection';
import { groupProducts } from './product-groups';
import { ProductPanel } from './product-panel';
import * as Crypto from 'expo-crypto';
import { api, ApiError, deviceStorage as storage, money, type Workspace } from './client';
import { SectionTitle, SearchField, Badge, ProductPhoto, Button, Card, Field, Label, styles, useTheme } from './ui';
import { clearCache } from './screens';
import { checkoutPayment } from './checkout-payment';
import { matchesHeldOrder, type HoldRequest } from './held-order';

type Product = { id: string; variant_group_id?: string | null; category_id?: string | null; barcode?: string | null; name: string; size: string | null; color: string | null; sku: string | null; selling_price: number; available: number; image_url: string | null; variant_image_url?: string | null };
type Item = { productId: string; quantity: number; optionIds: string[] };
type Shipping = { method: string; recipientName: string; phone: string; address: string; carrier: string; carrierOther: string };
type SavedDraft = { items: Item[]; customerId: string; paymentMethod: string; shipping: Shipping; deliveryFee: string; discount: string; discountType: string; couponCode: string; redeemPoints: string; holdLabel?: string; hold: { id: string; version: number } | null };
type Hold = { id: string; version: number; label: string; draft: { branchId: string; baseCurrency?: string; lines: Item[]; customerId: string; paymentMethod: string; shipping?: Partial<Shipping>; deliveryFee: string; discount: string; discountType?: string; couponCode?: string; points: string; note?: string } };
type Catalog = { categories?: { id: string; name: string }[]; products: Product[]; holds: Hold[]; customers: { id: string; name: string; phone: string | null; address?: string | null; loyalty_points: number }[]; groups: { id: string; product_id: string; name: string; selection_type: string }[]; options: { id: string; product_id: string; group_id: string; name: string; price_adjustment: number; is_active: boolean }[]; settings: { currency: string; couponsEnabled?: boolean; loyaltyEnabled?: boolean }; shift: { id: string } | null };
type Checkout = { requestId: string; branchId: string; paymentMethod: string; amountPaid: number; paymentsConfirmed: boolean; expectedTotal: number; [key: string]: unknown };
type Quote = { input: Checkout; lines: { name: string; quantity: number; unitPrice: number; variant: string }[]; total: { subtotal: number; tax: number; total: number; discount: number; delivery: number } };
type Receipt = { orderId: string; orderNumber: string; total: number; currency: string; change: number; remaining?: number };
const paymentMethods = [['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['cod', 'COD'], ['split', 'Split payment'], ['deposit', 'Deposit']];

export default function Pos({ workspace, online, onLocked }: { workspace: Workspace; online: boolean; onLocked: (value: boolean) => void }) {
  const theme = useTheme();
  const scope = { businessId: workspace.business.id, branchId: workspace.branchId };
  const pendingKey = `tenh-sale-${workspace.userId}-${scope.businessId}-${scope.branchId}`;
  const draftKey = `${pendingKey}-draft`;
  const holdRequestKey = `${pendingKey}-hold`;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const cartOpen = checkout === '1';
  const setCartOpen = (open: boolean) => router.setParams({ checkout: open ? '1' : '' });
  const [category, setCategory] = useState('all');
  const {value:columns,change:setColumns,error:viewError}=useViewPreference({...scope,userId:workspace.userId},'POS');
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(40);
  const [variants, setVariants] = useState<Product[]>([]);
  const [selectedColor,setSelectedColor]=useState<string|null>(null),[selectedSize,setSelectedSize]=useState<string|null>(null);

  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  useEffect(() => {
    if (!cartOpen) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { router.setParams({ checkout: '' }); return true; });
    return () => listener.remove();
  }, [cartOpen]);
  const [options, setOptions] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [received, setReceived] = useState('');
  const [splitMethods,setSplitMethods]=useState<[string,string]>(['cash','bank_transfer']);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [chooseCustomer, setChooseCustomer] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [choosePayment, setChoosePayment] = useState(false);
  const [shipping, setShipping] = useState({ method: 'in_store', recipientName: '', phone: '', address: '', carrier: 'other', carrierOther: '' });
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState('amount');
  const [couponCode, setCouponCode] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('0');
  const [hold, setHold] = useState<{ id: string; version: number } | null>(null);
  const [chooseHold, setChooseHold] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [pendingHold, setPendingHold] = useState<HoldRequest | null>(null);
  const [pending, setPending] = useState<Checkout | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [definiteFailure, setDefiniteFailure] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [printing, setPrinting] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [cartOpen, quote, receipt, page, columns]);
  const working = useRef(false);
  const current = useRef(true);
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  useEffect(() => () => onLocked(false), [onLocked]);
  useEffect(() => {
    let active = true;
    Promise.all([storage.getItem(pendingKey), storage.getItem(draftKey), storage.getItem(holdRequestKey)]).then(([value, draft, holdRequest]) => {
      if (!active) return;
      if (value) setPending(JSON.parse(value));
      if (holdRequest) setPendingHold(JSON.parse(holdRequest));
      if (draft) {
        const saved = JSON.parse(draft);
        const rows = Array.isArray(saved) ? saved : saved.items;
        if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row || typeof row.productId !== 'string' || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || !Array.isArray(row.optionIds))) throw new Error('Invalid saved cart.');
        setItems(rows);
        if (!Array.isArray(saved)) {
          setCustomerId(saved.customerId || ''); setPaymentMethod(saved.paymentMethod || 'cash');
          if (saved.shipping) setShipping(saved.shipping);
          setDeliveryFee(saved.deliveryFee || '0'); setDiscount(saved.discount || '0'); setDiscountType(saved.discountType || 'amount');
          setCouponCode(saved.couponCode || ''); setRedeemPoints(saved.redeemPoints || '0'); setHold(saved.hold || null); setHoldLabel(saved.holdLabel || '');
        }
      }
      setStorageReady(true);
    }).catch(() => { if (active) setError('Unable to restore pending sale. Do not start another sale on this device until storage is available.'); });
    return () => { active = false; };
  }, [pendingKey, draftKey, holdRequestKey]);
  useEffect(() => {
    if (!storageReady || pending || pendingHold || busy) return;
    const timer = setTimeout(() => {
      const draft: SavedDraft = { items, customerId, paymentMethod, shipping, deliveryFee, discount, discountType, couponCode, redeemPoints, hold, holdLabel };
      storage.setItem(draftKey, JSON.stringify(draft)).catch(() => { if (current.current) setError('Cart could not be saved on this device. Keep the app open until checkout.'); });
    }, 250);
    return () => clearTimeout(timer);
  }, [items, draftKey, pending, pendingHold, busy, storageReady, customerId, paymentMethod, shipping, deliveryFee, discount, discountType, couponCode, redeemPoints, hold, holdLabel]);
  useEffect(() => {
    // Keep the cashier in this workspace until a saved sale is resolved.
    onLocked(!!pending || !!pendingHold || busy || !storageReady || items.length > 0);
  }, [pending, pendingHold, busy, storageReady, items.length, onLocked]);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    api<Catalog>('pos', { businessId: scope.businessId, branchId: scope.branchId }, undefined, controller.signal).then(data => { if (!controller.signal.aborted) { setCatalog(data); if (catalogRevision === 0) setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [online, scope.businessId, scope.branchId, catalogRevision]);
  async function run(operation: () => Promise<void>) {
    if (working.current || !online || !storageReady) return;
    working.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (error) { if (current.current) setError((error as Error).message); }
    finally { working.current = false; if (current.current) setBusy(false); }
  }
  function add(selected: Product, selectedOptions: string[]) {
    const key = [...selectedOptions].sort().join(',');
    const used = items.filter(item => item.productId === selected.id).reduce((sum, item) => sum + item.quantity, 0);
    if (used >= selected.available) { theme.alert('Insufficient stock', 'No more stock is available in this branch.'); return; }
    setItems(rows => {
      const index = rows.findIndex(item => item.productId === selected.id && [...item.optionIds].sort().join(',') === key);
      if (index < 0) return [...rows, { productId: selected.id, optionIds: selectedOptions, quantity: 1 }];
      return rows.map((item, i) => i === index ? { ...item, quantity: item.quantity + 1 } : item);
    });
    setProduct(null); setVariants([]); setQuote(null);
  }
  async function printReceipt(saved: Receipt, shipping = false) {
    const document = await api<{html: string; width?: number}>(`${shipping ? "shipping-label" : "receipt"}?id=${saved.orderId}`, scope);
    await outputOrderDocument(document, false, shipping, await import('expo-print'));
  }
  async function finish(saved: Receipt) {
    await storage.removeItem(draftKey);
    await storage.removeItem(pendingKey);
    if (!current.current) return;
    clearCache(); setPending(null); setQuote(null); setItems([]); setCartOpen(false); setDefiniteFailure(false);
    setCustomerId(''); setPaymentMethod('cash'); setShipping({ method: 'in_store', recipientName: '', phone: '', address: '', carrier: 'other', carrierOther: '' }); setDeliveryFee('0');
    setDiscount('0'); setDiscountType('amount'); setCouponCode(''); setRedeemPoints('0');
    setHold(null); setHoldLabel(''); setPrinting(true);
    // The sale is already saved. Printing failure must never retry checkout.
    try { await printReceipt(saved); }
    catch { if (current.current) setError('Sale saved. Printing was cancelled or unavailable. You can print the receipt again below.'); }
    finally { if (current.current) { setPrinting(false); setReceipt(saved); setCatalogRevision(value => value + 1); } }
  }
  async function submit(input: Checkout) {
    setDefiniteFailure(false);
    try {
      const result = await api<{ success: true; data: Receipt }>('sale', scope, input);
      await finish(result.data);
    } catch (error) {
      if (current.current) setDefiniteFailure(error instanceof ApiError && error.uncertain === false);
      throw error;
    }
  }
  function checkoutRequest(): HoldRequest {
    if (shipping.method === 'delivery' && !/^\d+(\.\d{1,2})?$/.test(deliveryFee)) throw new Error('Enter a valid delivery fee.');
    if (!/^\d+(\.\d{1,2})?$/.test(discount) || !/^\d+$/.test(redeemPoints)) throw new Error('Enter a valid discount and whole loyalty points.');
    return { requestId: Crypto.randomUUID(), items, customerId: customerId || null,
      shipping: shipping.method === 'in_store' ? { method: 'in_store', recipientName: '', phone: '', address: '' } : shipping,
      deliveryFee: shipping.method === 'delivery' ? Number(deliveryFee) : 0, paymentMethod, discount: Number(discount), discountType, couponCode,
      redeemPoints: customerId ? Number(redeemPoints) : 0, holdId: hold?.id || null, holdVersion: hold?.version || null,
      label: holdLabel.trim() || 'Held order', currency: catalog?.settings.currency || '' };
  }
  async function checkHold(request: HoldRequest) {
    const refreshed = await api<Catalog>('pos', scope); setCatalog(refreshed);
    const saved = refreshed.holds.find(value => value.id === (request.holdId || request.requestId));
    if (!saved || !matchesHeldOrder(saved, request, scope.branchId)) throw new Error('The saved hold is not confirmed. Keep this request and check again. If it changed on another device, review the saved hold before continuing.');
    await storage.removeItem(draftKey); await storage.removeItem(holdRequestKey);
    setPendingHold(null); setCartOpen(false); setItems([]); setHold(null); setHoldLabel(''); setQuote(null);
    setCustomerId(''); setDiscount('0'); setCouponCode(''); setRedeemPoints('0'); setDeliveryFee('0');
    setShipping({ method: 'in_store', recipientName: '', phone: '', address: '', carrier: 'other', carrierOther: '' });
    theme.alert('Order held', 'The order is saved. No payment was recorded and no stock was deducted.');
  }
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const productGroups = useMemo(() => groupProducts(catalog?.products ?? []).filter(rows => rows.some(row =>
    (category === 'all' || row.category_id === category) && [row.name,row.sku,row.barcode,row.size,row.color].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))), [catalog?.products, category, search]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(productGroups.length / 10)));
  const visibleProducts = columns === 1 ? productGroups.slice((currentPage - 1) * 10, currentPage * 10) : productGroups.slice(0, visibleCount);
  return <View style={{ flex: 1 }}><ScrollView ref={scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    {viewError&&<Label>{viewError}</Label>}
    {error ? <Card><Text accessibilityRole="alert" style={{ color: theme.dark ? '#fda4af' : '#be123c' }}>{error}</Text></Card> : null}
    {!storageReady && <ActivityIndicator />}
    {printing && <Card><LoadingState label="Opening receipt print…"/><Label>The sale is saved.</Label></Card>}
    {receipt && <Card><Label large>{receipt.remaining ? 'Order recorded' : 'Sale completed'}</Label><Label>{receipt.orderNumber}</Label><Label>{money(receipt.total, receipt.currency)}</Label><Label>{receipt.remaining ? `Payment due · ${money(receipt.remaining, receipt.currency)}` : `Change · ${money(receipt.change, receipt.currency)}`}</Label><Button title="Print receipt" secondary busy={busy} disabled={!online} onPress={() => void run(() => printReceipt(receipt))}/><Button title="Print shipping label" secondary busy={busy} disabled={!online} onPress={() => void run(() => printReceipt(receipt,true))}/><Button title="New sale" disabled={busy} onPress={() => { setReceipt(null); setError(''); }} /></Card>}
    {pendingHold ? <Card><Label large>Check saved hold</Label><Label>{pendingHold.label}</Label><Label>Keep this request until the saved draft is confirmed. No sale has been submitted.</Label>
      <Button title="Check saved hold" busy={busy} disabled={!online} onPress={() => void run(() => checkHold(pendingHold))} />
      <Button title="Retry saving same hold" secondary disabled={!online || busy} onPress={() => void run(async () => { await api('hold', scope, pendingHold); await checkHold(pendingHold); })} />
      <Button title="Discard local draft" secondary disabled={busy || !online} onPress={() => theme.alert('Discard local draft?', 'A saved hold may still exist. No sale or payment was submitted. Check Held orders before starting this order again.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Discard local draft', style: 'destructive', onPress: () => void run(async () => { await storage.removeItem(draftKey); await storage.removeItem(holdRequestKey); setItems([]); setHold(null); setPendingHold(null); setQuote(null); const refreshed = await api<Catalog>('pos', scope); setCatalog(refreshed); setChooseHold(true); }) }])} />
    </Card> : pending ? busy ? <Card><LoadingState label="Saving sale…"/><Label>Keep this screen open while the sale is confirmed.</Label></Card> : <Card><Label large>Check pending sale</Label><Label>Keep this request until the server confirms its result. Retrying uses the same sale ID.</Label><Label muted>{pending.requestId}</Label>
      <Button title="Check sale" disabled={!online} busy={busy} onPress={() => void run(async () => {
        const result = await api<{ data: Receipt | null }>(`sale-status?id=${pending.requestId}`, scope);
        if (result.data) await finish(result.data);
        else setError('No confirmed sale yet. Retry this same sale; do not create a second order.');
      })} />
      <Button title="Retry same sale" disabled={!online || busy} secondary onPress={() => void run(() => submit(pending))} />
      {definiteFailure && <Button title="Return to cart" secondary disabled={busy} onPress={() => void run(async () => { await storage.removeItem(pendingKey); setPending(null); setQuote(null); setDefiniteFailure(false); })} />}
    </Card> : quote ? <Card><Label large>Review sale</Label>
      {quote.lines.map((line, index) => <Label key={index}>{`${line.quantity} × ${line.name} ${line.variant} · ${money(line.unitPrice, catalog?.settings.currency)}`}</Label>)}
      <Label>{`Subtotal · ${money(quote.total.subtotal, catalog?.settings.currency)}`}</Label><Label>{`Discount · ${money(quote.total.discount, catalog?.settings.currency)}`}</Label><Label>{`Delivery · ${money(quote.total.delivery, catalog?.settings.currency)}`}</Label><Label>{`Tax · ${money(quote.total.tax, catalog?.settings.currency)}`}</Label><Label large>{money(quote.total.total, catalog?.settings.currency)}</Label>
      {quote.input.paymentMethod==='split'&&<>{[0,1].map(index=><View key={index} style={[styles.row,{flexWrap:'wrap'}]}><Label>{index===0?'First payment':'Remaining payment'}</Label>{[['cash','Cash'],['bank_transfer','Bank transfer'],['other','Other']].map(([value,title])=><Button key={value} title={title} secondary={splitMethods[index]!==value} disabled={busy||splitMethods[1-index]===value} onPress={()=>setSplitMethods(pair=>index===0?[value,pair[1]]:[pair[0],value])}/>)}</View>)}</>}
      {['cash', 'deposit', 'split'].includes(quote.input.paymentMethod) && <Field label={quote.input.paymentMethod === 'split' ? 'First payment amount' : quote.input.paymentMethod === 'deposit' ? 'Deposit received' : 'Cash received'} keyboardType="decimal-pad" value={received} editable={!busy} onChangeText={setReceived} />}
      {quote.input.paymentMethod === 'split' && <Label>{`Remaining payment · ${money(Math.max(0, quote.total.total - (Number(received) || 0)), catalog?.settings.currency)}`}</Label>}
      <Label>{quote.input.paymentMethod === 'cod' ? 'Cash on Delivery · payment remains due' : quote.input.paymentMethod === 'bank_transfer' || quote.input.paymentMethod === 'split' ? 'Verify bank transfer in your bank account before confirming.' : quote.input.paymentMethod === 'deposit' ? 'The remaining balance will stay due.' : 'Cash'}</Label>
      <Button title={quote.input.paymentMethod === 'cod' ? 'Confirm COD order' : 'Confirm payment received'} disabled={!online || busy || !workspace.permissions.includes('orders.create')} busy={busy} onPress={() => theme.alert('Confirm order', quote.input.paymentMethod === 'cod' ? 'Record this order with payment still due? Stock will be updated.' : quote.input.paymentMethod === 'deposit' ? 'Confirm you received this deposit. The remaining balance will stay due, and stock will be updated.' : 'Only continue after verifying you received the full payment. This records the sale and updates stock.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void run(async () => {
          const input = { ...quote.input, ...checkoutPayment(quote.input.paymentMethod, quote.total.total, received,splitMethods) };
          await storage.setItem(pendingKey, JSON.stringify(input));
          setPending(input);
          await submit(input);
        }) },
      ])} />
      <Button title="Back to cart" secondary disabled={busy} onPress={() => setQuote(null)} />
    </Card> : !receipt && !printing && <>
      {catalog && !catalog.shift && <Card><Label>No register is open. Open a shift in Register before taking cash sales.</Label></Card>}
      {cartOpen&&<><SectionTitle title="Checkout" icon="bag-handle-outline"/>{!items.length&&<Card><Label>Your cart is empty</Label></Card>}</>}
      {cartOpen && items.length > 0 && <Card><SectionTitle title="Items" icon="list-outline"/>{items.map((item, index) => <View key={`${item.productId}:${item.optionIds.join(',')}`} style={[styles.row, { justifyContent: 'space-between' }]}>
        <ProductPhoto uri={catalog?.products.find(product => product.id === item.productId)?.variant_image_url || catalog?.products.find(product => product.id === item.productId)?.image_url} size={48} />
        <View style={{ flex: 1 }}><Label>{`${item.quantity} × ${catalog?.products.find(product => product.id === item.productId)?.name ?? 'Product'}`}</Label><Label muted>{[catalog?.products.find(p=>p.id===item.productId)?.size,catalog?.products.find(p=>p.id===item.productId)?.color,...item.optionIds.map(id=>catalog?.options.find(o=>o.id===id)?.name)].filter(Boolean).join(' · ')}</Label></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove item" disabled={busy} onPress={()=>{setItems(rows=>rows.filter((_,i)=>i!==index));setQuote(null);}} style={{padding:10,minHeight:44}}><Ionicons name="trash-outline" size={21} color="#c13c4c"/></Pressable>
        <Button title="−" secondary disabled={busy} onPress={() => setItems(rows => rows.flatMap((row, i) => i !== index ? [row] : row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []))} />
      </View>)}
        <SectionTitle title="Customer & fulfillment" icon="person-outline"/>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>{[['in_store', 'Walk-in'], ['pickup', 'Pickup'], ['delivery', 'Delivery']].map(([method, title]) => <Button key={method} title={title} secondary={shipping.method !== method} disabled={busy} onPress={() => setShipping(value => ({ ...value, method }))} />)}</View>
        <Button title={catalog?.customers.find(customer => customer.id === customerId)?.name || 'Select customer'} secondary disabled={busy} onPress={() => setChooseCustomer(true)} />
        {shipping.method !== 'in_store' && <>
          <Field label="Customer name" value={shipping.recipientName} editable={!busy} onChangeText={recipientName => setShipping(value => ({ ...value, recipientName }))} />
          <Field label="Phone" value={shipping.phone} keyboardType="phone-pad" editable={!busy} onChangeText={phone => setShipping(value => ({ ...value, phone }))} />
          <Field label="Address" value={shipping.address} editable={!busy} onChangeText={address => setShipping(value => ({ ...value, address }))} />
          {shipping.method === 'delivery' && <><Field label="Delivery fee" value={deliveryFee} editable={!busy} keyboardType="decimal-pad" onChangeText={setDeliveryFee} />
            <View style={[styles.row, { flexWrap: 'wrap' }]}>{[['jt', 'J&T'], ['vet', 'VET'], ['grab', 'Grab'], ['other', 'Other']].map(([carrier, title]) => <Button key={carrier} title={title} secondary={shipping.carrier !== carrier} disabled={busy} onPress={() => setShipping(value => ({ ...value, carrier }))} />)}</View>
            {shipping.carrier === 'other' && <Field label="Carrier name" value={shipping.carrierOther} editable={!busy} maxLength={80} onChangeText={carrierOther => setShipping(value => ({ ...value, carrierOther }))} />}
          </>}
        </>}
        <SectionTitle title="Discounts & payment" icon="card-outline"/>
        <View style={[styles.row,{alignItems:'flex-end'}]}><View style={{flex:1}}><Field label="Discount" value={discount} keyboardType="decimal-pad" editable={!busy && !couponCode} onChangeText={setDiscount}/></View>{[['amount', catalog?.settings.currency === 'KHR' ? '៛' : '$'], ['percent', '%']].map(([value,title]) => <ChoiceChip key={value} title={title} selected={discountType===value} disabled={busy||!!couponCode} onPress={()=>setDiscountType(value)}/>)}</View>
        {(catalog?.settings.couponsEnabled || couponCode) && <Field label="Coupon code" value={couponCode} maxLength={30} autoCapitalize="characters" editable={!busy} onChangeText={value => { setCouponCode(value.trim().toUpperCase()); if (value) setDiscount('0'); }} />}
        {customerId && (catalog?.settings.loyaltyEnabled || Number(redeemPoints) > 0) && <><Label muted>{`${catalog?.customers.find(customer => customer.id === customerId)?.loyalty_points || 0} points available`}</Label><Field label="Loyalty points to redeem" value={redeemPoints} keyboardType="number-pad" editable={!busy} onChangeText={setRedeemPoints} /></>}
        <Label>Payment method</Label><Pressable accessibilityRole="button" accessibilityLabel="Select payment method" accessibilityState={{expanded:choosePayment}} disabled={busy} onPress={()=>setChoosePayment(value=>!value)} style={[styles.row,{padding:14,borderWidth:1,borderColor:theme.border,borderRadius:12,justifyContent:'space-between'}]}><Label>{paymentMethods.find(([method])=>method===paymentMethod)?.[1]}</Label><Ionicons name={choosePayment?'chevron-up':'chevron-down'} size={20} color={theme.text}/></Pressable>
        {choosePayment&&<View style={{gap:6}}>{paymentMethods.map(([method,title])=><ChoiceChip key={method} title={title} selected={paymentMethod===method} disabled={busy} onPress={()=>{setPaymentMethod(method);setChoosePayment(false);}}/>)}</View>}
        <Field label="Hold name / note (optional)" value={holdLabel} maxLength={80} editable={!busy} onChangeText={setHoldLabel} />
        <Button title="Hold order" secondary disabled={!online || busy} onPress={() => void run(async () => {
          const request = checkoutRequest();
          await api('quote', scope, request);
          await storage.setItem(draftKey, JSON.stringify({ items, customerId, paymentMethod, shipping, deliveryFee, discount, discountType, couponCode, redeemPoints, hold, holdLabel }));
          await storage.setItem(holdRequestKey, JSON.stringify(request)); setPendingHold(request);
          await api('hold', scope, request); await checkHold(request);
        })} />
        <Button title="Clear cart" secondary disabled={busy} onPress={() => theme.alert('Clear cart?', hold ? 'Clear this local copy? The held order stays saved on the server.' : 'Remove these unsaved items?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', onPress: () => { setItems([]); setHold(null); } }])} />
      </Card>}
      {!cartOpen&&<><SearchField placeholder="Product name, SKU or barcode" value={search} onChangeText={value=>{setSearch(value);setVisibleCount(40);setPage(1);}}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{[{id:'all',name:'All categories'},...(catalog?.categories??[])].map(row=><Button key={row.id} title={row.name} secondary={category!==row.id} onPress={()=>{setCategory(row.id);setVisibleCount(40);setPage(1);}}/>)}</ScrollView>
      <View style={[styles.row,{justifyContent:'space-between'}]}><Label>Products</Label><LayoutPicker value={columns} change={value=>{setColumns(value);setPage(1);}}/></View>
      {!catalog&&<Shimmer rows={5}/>}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{visibleProducts.map(rows=>{const first=rows[0],available=rows.reduce((sum,row)=>sum+row.available,0),price=Math.min(...rows.map(row=>row.selling_price));return <Pressable key={first.variant_group_id||first.id} accessibilityRole="button" accessibilityLabel={`${first.name}, choose product`} style={({pressed})=>({width:columns===1?'100%':columns===2?'48%':'31%',padding:10,gap:8,flexDirection:columns===1?'row':'column',alignItems:columns===1?'center':undefined,borderRadius:18,borderWidth:1,borderColor:theme.border,backgroundColor:theme.panel,opacity:pressed?0.7:available<=0?0.55:1})} disabled={busy||!storageReady||available<=0} onPress={()=>{
        if(rows.length>1||first.variant_group_id||catalog?.groups.some(group=>group.product_id===first.id)){setVariants(rows);setSelectedColor(rows.length===1?first.color||'':null);setSelectedSize(rows.length===1?first.size||'':null);setProduct(rows.length===1?first:null);setOptions([]);}
        else add(first,[]);
      }}><ProductPhoto uri={first.image_url||first.variant_image_url} fill={columns!==1} size={columns===1?56:undefined}/><View style={{flex:1,gap:5}}><Label>{first.name}</Label>{rows.length>1&&<Label muted>{`${rows.length} variants`}</Label>}<Label>{money(price,catalog?.settings.currency)}</Label><Badge title={available>0?`${available} available`:'Out of stock'} positive={available>0}/></View></Pressable>})}</View>
      {catalog&&!productGroups.length&&<Label muted>No matching products</Label>}
      {columns===1&&catalog&&<Pagination page={currentPage} total={productGroups.length} size={10} loading={busy} change={setPage}/>}
      {columns!==1&&productGroups.length>visibleCount&&<Button title="Load more products" secondary onPress={()=>setVisibleCount(count=>count+40)}/>}</>}

    </>}
    <Modal visible={chooseHold} animationType="slide" onRequestClose={() => { if (!busy) setChooseHold(false); }}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page}>
      {error && <Card><Label>{error}</Label></Card>}
      <Label large>Held orders</Label>{!catalog?.holds.length && <Label>No held orders in this branch.</Label>}
      {catalog?.holds.map(saved => <Card key={saved.id}><Button title={saved.label} secondary disabled={busy} onPress={() => {
        if (saved.draft.branchId !== scope.branchId || saved.draft.baseCurrency && saved.draft.baseCurrency !== catalog.settings.currency) { theme.alert('Unable to resume', 'The branch or currency changed. Review this hold on the website.'); return; }
        if (saved.draft.note || !['cash', 'bank_transfer', 'cod', 'split', 'deposit'].includes(saved.draft.paymentMethod)) { theme.alert('Open this hold on the website', 'This hold includes details not yet supported by mobile.'); return; }
        setItems(saved.draft.lines.map(line => ({ productId: line.productId, quantity: line.quantity, optionIds: line.optionIds })));
        setCustomerId(saved.draft.customerId || ''); setPaymentMethod(saved.draft.paymentMethod); setShipping({ method: 'in_store', recipientName: '', phone: '', address: '', carrier: 'other', carrierOther: '', ...saved.draft.shipping });
        setDiscount(saved.draft.couponCode ? '0' : saved.draft.discount); setDiscountType(saved.draft.discountType || 'amount'); setDeliveryFee(saved.draft.deliveryFee);
        setCouponCode(saved.draft.couponCode || ''); setRedeemPoints(saved.draft.points); setHold({ id: saved.id, version: saved.version }); setHoldLabel(saved.label); setChooseHold(false); setCartOpen(true); setQuote(null);
      }} /><Button title="Delete held order" secondary disabled={busy || !online} onPress={() => theme.alert('Delete held order?', `${saved.label} — no payment or stock will change.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(async () => { try { await api('delete-hold', scope, { id: saved.id, version: saved.version }); } finally { setCatalog(await api<Catalog>('pos', scope)); } }) }])} /></Card>)}
      <Button title="Close" secondary disabled={busy} onPress={() => setChooseHold(false)} />
    </ScrollView></SafeAreaView></Modal>
    <Modal visible={chooseCustomer} animationType="slide" onRequestClose={() => setChooseCustomer(false)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Label large>Select customer</Label><Field label="Search" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Name or phone" />
      <Button title="Walk-in customer" secondary onPress={() => { setCustomerId(''); setShipping(value => ({ ...value, recipientName: '', phone: '', address: '' })); setChooseCustomer(false); }} />
      {catalog?.customers.filter(customer => `${customer.name} ${customer.phone || ''}`.toLowerCase().includes(customerSearch.toLowerCase())).slice(0, 50).map(customer => <Button key={customer.id} title={`${customer.name} · ${customer.phone || ''}`} secondary onPress={() => { setCustomerId(customer.id); setShipping(value => ({ ...value, recipientName: customer.name, phone: customer.phone || '', address: customer.address || '' })); setChooseCustomer(false); }} />)}
      <Button title="Close" secondary onPress={() => setChooseCustomer(false)} />
    </ScrollView></SafeAreaView></Modal>
    <ProductPanel visible={variants.length>0} title={variants[0]?.name||'Choose variant'} close={()=>{setVariants([]);setProduct(null);}}>
      <View style={{alignItems:'center'}}><ProductPhoto uri={product?.variant_image_url||product?.image_url||variants.find(row=>(row.color||'')===selectedColor)?.variant_image_url||variants[0]?.image_url} size={144}/></View>
      {variants.length>1&&<>
        <Label>Colour</Label><View style={[styles.row,{flexWrap:'wrap'}]}>{[...new Set(variants.map(row=>row.color||''))].map(color=><ChoiceChip key={color} title={color||'No colour'} selected={selectedColor===color} disabled={!variants.some(row=>(row.color||'')===color&&row.available>items.filter(item=>item.productId===row.id).reduce((sum,item)=>sum+item.quantity,0))} onPress={()=>{setSelectedColor(color);setSelectedSize(null);setProduct(null);setOptions([]);}}/>)}</View>
        <Label>Size</Label><View style={[styles.row,{flexWrap:'wrap'}]}>{[...new Set(variants.map(row=>row.size||''))].map(size=><ChoiceChip key={size} title={size||'One size'} selected={selectedSize===size} disabled={selectedColor===null||!matchingVariants(variants,selectedColor,size).some(row=>row.available>items.filter(item=>item.productId===row.id).reduce((sum,item)=>sum+item.quantity,0))} onPress={()=>{setSelectedSize(size);const matches=matchingVariants(variants,selectedColor,size);setProduct(matches.length===1?matches[0]:null);setOptions([]);}}/>)}</View>
        {selectedColor!==null&&selectedSize!==null&&matchingVariants(variants,selectedColor,selectedSize).length>1&&<><Label>Choose SKU</Label>{matchingVariants(variants,selectedColor,selectedSize).map(row=><Button key={row.id} title={row.sku||row.id} secondary={product?.id!==row.id} disabled={row.available<=items.filter(item=>item.productId===row.id).reduce((sum,item)=>sum+item.quantity,0)} onPress={()=>{setProduct(row);setOptions([]);}}/>)}</>}
      </>}
      {product&&<Label>{`${money(product.selling_price,catalog?.settings.currency)} / ${product.available} available`}</Label>}
      <Label large>{product?.name}</Label>{catalog?.groups.filter(group => group.product_id === product?.id).map(group => <Card key={group.id}><Label>{group.name}</Label>
        {catalog.options.filter(option => option.group_id === group.id && option.is_active).map(option => <Button key={option.id} title={`${options.includes(option.id) ? '✓ ' : ''}${option.name} (+${money(option.price_adjustment, catalog.settings.currency)})`} secondary onPress={() => setOptions(ids => ids.includes(option.id) ? ids.filter(id => id !== option.id) : [...(group.selection_type === 'single' ? ids.filter(id => !catalog.options.some(value => value.id === id && value.group_id === group.id)) : ids), option.id])} />)}
      </Card>)}<Button title="Add to order" disabled={!product||busy||!storageReady} onPress={() => { if (product) add(product, options); }} /><Button title="Cancel" secondary onPress={() => {setProduct(null);setVariants([]);}} />
    </ProductPanel>
  </ScrollView>
  {cartOpen&&items.length>0&&!quote&&!pending&&!pendingHold&&!receipt&&!printing&&<View style={{padding:14,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.panel}}><Button title="Review checkout" disabled={!online||!catalog?.shift||!storageReady} busy={busy} onPress={()=>void run(async()=>{
    const next=await api<Quote>('quote',scope,checkoutRequest());setQuote(next);setReceived(['split','deposit'].includes(paymentMethod)?'':next.total.total.toFixed(2));
  })}/></View>}
  {!cartOpen&&!quote&&!pending&&!pendingHold&&!receipt&&!printing&&<View style={{padding:14,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.panel}}><Pressable accessibilityRole="button" accessibilityLabel={`Checkout, ${itemCount} items`} disabled={!itemCount||busy||!storageReady} onPress={()=>setCartOpen(true)} style={({pressed})=>({minHeight:54,borderRadius:15,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#275de8',opacity:!itemCount?0.5:pressed?0.8:1})}><Ionicons name="bag-handle-outline" color="#fff" size={23}/><Text style={{backgroundColor:'#fff',color:'#275de8',borderRadius:12,minWidth:26,textAlign:'center',padding:3,fontWeight:'700'}}>{itemCount}</Text><Text style={{flex:1,color:'#fff',fontWeight:'700',fontSize:17}}>{theme.t('Checkout')}</Text><Ionicons name="arrow-forward" color="#fff" size={22}/></Pressable></View>}
  </View>;
}
