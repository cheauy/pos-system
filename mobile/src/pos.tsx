import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { api, ApiError, deviceStorage as storage, money, type Workspace } from './client';
import { Button, Card, Field, Label, styles, useTheme } from './ui';
import { clearCache } from './screens';
import { checkoutPayment } from './checkout-payment';
import { matchesHeldOrder, type HoldRequest } from './held-order';

type Product = { id: string; name: string; size: string | null; color: string | null; sku: string | null; selling_price: number; available: number; image_url: string | null };
type Item = { productId: string; quantity: number; optionIds: string[] };
type Shipping = { method: string; recipientName: string; phone: string; address: string; carrier: string; carrierOther: string };
type SavedDraft = { items: Item[]; customerId: string; paymentMethod: string; shipping: Shipping; deliveryFee: string; discount: string; discountType: string; couponCode: string; redeemPoints: string; hold: { id: string; version: number } | null };
type Hold = { id: string; version: number; label: string; draft: { branchId: string; baseCurrency?: string; lines: Item[]; customerId: string; paymentMethod: string; shipping?: Partial<Shipping>; deliveryFee: string; discount: string; discountType?: string; couponCode?: string; points: string; note?: string } };
type Catalog = { products: Product[]; holds: Hold[]; customers: { id: string; name: string; phone: string | null; address?: string | null; loyalty_points: number }[]; groups: { id: string; product_id: string; name: string; selection_type: string }[]; options: { id: string; product_id: string; group_id: string; name: string; price_adjustment: number; is_active: boolean }[]; settings: { currency: string; couponsEnabled?: boolean; loyaltyEnabled?: boolean }; shift: { id: string } | null };
type Checkout = { requestId: string; branchId: string; paymentMethod: string; amountPaid: number; paymentsConfirmed: boolean; expectedTotal: number; [key: string]: unknown };
type Quote = { input: Checkout; lines: { name: string; quantity: number; unitPrice: number; variant: string }[]; total: { subtotal: number; tax: number; total: number; discount: number; delivery: number } };
type Receipt = { orderId: string; orderNumber: string; total: number; currency: string; change: number; remaining?: number };

export default function Pos({ workspace, online, onLocked }: { workspace: Workspace; online: boolean; onLocked: (value: boolean) => void }) {
  const theme = useTheme();
  const scope = { businessId: workspace.business.id, branchId: workspace.branchId };
  const pendingKey = `tenh-sale-${workspace.userId}-${scope.businessId}-${scope.branchId}`;
  const draftKey = `${pendingKey}-draft`;
  const holdRequestKey = `${pendingKey}-hold`;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [received, setReceived] = useState('');
  const [splitMethods,setSplitMethods]=useState<[string,string]>(['cash','bank_transfer']);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [chooseCustomer, setChooseCustomer] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
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
  const [error, setError] = useState('');
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
          setCouponCode(saved.couponCode || ''); setRedeemPoints(saved.redeemPoints || '0'); setHold(saved.hold || null);
        }
      }
      setStorageReady(true);
    }).catch(() => { if (active) setError('Unable to restore pending sale. Do not start another sale on this device until storage is available.'); });
    return () => { active = false; };
  }, [pendingKey, draftKey, holdRequestKey]);
  useEffect(() => {
    if (!storageReady || pending || pendingHold || busy) return;
    const timer = setTimeout(() => {
      const draft: SavedDraft = { items, customerId, paymentMethod, shipping, deliveryFee, discount, discountType, couponCode, redeemPoints, hold };
      storage.setItem(draftKey, JSON.stringify(draft)).catch(() => { if (current.current) setError('Cart could not be saved on this device. Keep the app open until checkout.'); });
    }, 250);
    return () => clearTimeout(timer);
  }, [items, draftKey, pending, pendingHold, busy, storageReady, customerId, paymentMethod, shipping, deliveryFee, discount, discountType, couponCode, redeemPoints, hold]);
  useEffect(() => {
    // Keep the cashier in this workspace until a saved sale is resolved.
    onLocked(!!pending || !!pendingHold || busy || !storageReady || items.length > 0);
  }, [pending, pendingHold, busy, storageReady, items.length, onLocked]);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    api<Catalog>('pos', { businessId: scope.businessId, branchId: scope.branchId }, undefined, controller.signal).then(data => { if (!controller.signal.aborted) { setCatalog(data); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [online, scope.businessId, scope.branchId, receipt]);
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
    setProduct(null); setQuote(null);
  }
  async function finish(saved: Receipt) {
    await storage.removeItem(draftKey);
    await storage.removeItem(pendingKey);
    if (!current.current) return;
    clearCache(); setPending(null); setQuote(null); setItems([]); setReceipt(saved); setDefiniteFailure(false);
    setCustomerId(''); setPaymentMethod('cash'); setShipping({ method: 'in_store', recipientName: '', phone: '', address: '', carrier: 'other', carrierOther: '' }); setDeliveryFee('0');
    setDiscount('0'); setDiscountType('amount'); setCouponCode(''); setRedeemPoints('0');
    setHold(null);
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
      label: holdLabel.trim(), currency: catalog?.settings.currency || '' };
  }
  async function checkHold(request: HoldRequest) {
    const refreshed = await api<Catalog>('pos', scope); setCatalog(refreshed);
    const saved = refreshed.holds.find(value => value.id === (request.holdId || request.requestId));
    if (!saved || !matchesHeldOrder(saved, request, scope.branchId)) throw new Error('The saved hold is not confirmed. Keep this request and check again. If it changed on another device, review the saved hold before continuing.');
    await storage.removeItem(draftKey); await storage.removeItem(holdRequestKey);
    setPendingHold(null); setItems([]); setHold(null); setHoldLabel(''); setQuote(null);
    setCustomerId(''); setDiscount('0'); setCouponCode(''); setRedeemPoints('0'); setDeliveryFee('0');
    setShipping({ method: 'in_store', recipientName: '', phone: '', address: '', carrier: 'other', carrierOther: '' });
    theme.alert('Order held', 'The order is saved. No payment was recorded and no stock was deducted.');
  }
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Label large>Point of Sale</Label>
    {error ? <Card><Text accessibilityRole="alert" style={{ color: theme.dark ? '#fda4af' : '#be123c' }}>{error}</Text></Card> : null}
    {!storageReady && <ActivityIndicator />}
    {receipt && <Card><Label large>{receipt.remaining ? 'Order recorded' : 'Sale completed'}</Label><Label>{receipt.orderNumber}</Label><Label>{money(receipt.total, receipt.currency)}</Label><Label>{receipt.remaining ? `Payment due · ${money(receipt.remaining, receipt.currency)}` : `Change · ${money(receipt.change, receipt.currency)}`}</Label><Button title="New sale" onPress={() => setReceipt(null)} /></Card>}
    {pendingHold ? <Card><Label large>Check saved hold</Label><Label>{pendingHold.label}</Label><Label>Keep this request until the saved draft is confirmed. No sale has been submitted.</Label>
      <Button title="Check saved hold" busy={busy} disabled={!online} onPress={() => void run(() => checkHold(pendingHold))} />
      <Button title="Retry saving same hold" secondary disabled={!online || busy} onPress={() => void run(async () => { await api('hold', scope, pendingHold); await checkHold(pendingHold); })} />
      <Button title="Discard local draft" secondary disabled={busy || !online} onPress={() => theme.alert('Discard local draft?', 'A saved hold may still exist. No sale or payment was submitted. Check Held orders before starting this order again.', [{ text: 'Keep draft', style: 'cancel' }, { text: 'Discard local draft', style: 'destructive', onPress: () => void run(async () => { await storage.removeItem(draftKey); await storage.removeItem(holdRequestKey); setItems([]); setHold(null); setPendingHold(null); setQuote(null); const refreshed = await api<Catalog>('pos', scope); setCatalog(refreshed); setChooseHold(true); }) }])} />
    </Card> : pending ? <Card><Label large>Check pending sale</Label><Label>Keep this request until the server confirms its result. Retrying uses the same sale ID.</Label><Label muted>{pending.requestId}</Label>
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
    </Card> : !receipt && <>
      {!items.length && <Button title={`Held orders (${catalog?.holds.length || 0})`} secondary disabled={!online || busy || !storageReady} onPress={() => void run(async () => { const refreshed = await api<Catalog>('pos', scope); setCatalog(refreshed); setChooseHold(true); })} />}
      {catalog && !catalog.shift && <Card><Label>No register is open. Open a shift in Register before taking cash sales.</Label></Card>}
      {items.length > 0 && <Card><Label large>Current order</Label>{items.map((item, index) => <View key={`${item.productId}:${item.optionIds.join(',')}`} style={[styles.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}><Label>{`${item.quantity} × ${catalog?.products.find(product => product.id === item.productId)?.name ?? 'Product'}`}</Label></View>
        <Button title="−" secondary disabled={busy} onPress={() => setItems(rows => rows.flatMap((row, i) => i !== index ? [row] : row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []))} />
      </View>)}
        <Button title={catalog?.customers.find(customer => customer.id === customerId)?.name || 'Walk-in customer'} secondary disabled={busy} onPress={() => setChooseCustomer(true)} />
        <View style={[styles.row, { flexWrap: 'wrap' }]}>{[['in_store', 'Walk-in'], ['pickup', 'Pickup'], ['delivery', 'Delivery']].map(([method, title]) => <Button key={method} title={title} secondary={shipping.method !== method} disabled={busy} onPress={() => setShipping(value => ({ ...value, method }))} />)}</View>
        {shipping.method !== 'in_store' && <>
          <Field label="Customer name" value={shipping.recipientName} editable={!busy} onChangeText={recipientName => setShipping(value => ({ ...value, recipientName }))} />
          <Field label="Phone" value={shipping.phone} keyboardType="phone-pad" editable={!busy} onChangeText={phone => setShipping(value => ({ ...value, phone }))} />
          <Field label="Address" value={shipping.address} editable={!busy} onChangeText={address => setShipping(value => ({ ...value, address }))} />
          {shipping.method === 'delivery' && <><Field label="Delivery fee" value={deliveryFee} editable={!busy} keyboardType="decimal-pad" onChangeText={setDeliveryFee} />
            <View style={[styles.row, { flexWrap: 'wrap' }]}>{[['jt', 'J&T'], ['vet', 'VET'], ['grab', 'Grab'], ['other', 'Other']].map(([carrier, title]) => <Button key={carrier} title={title} secondary={shipping.carrier !== carrier} disabled={busy} onPress={() => setShipping(value => ({ ...value, carrier }))} />)}</View>
            {shipping.carrier === 'other' && <Field label="Carrier name" value={shipping.carrierOther} editable={!busy} maxLength={80} onChangeText={carrierOther => setShipping(value => ({ ...value, carrierOther }))} />}
          </>}
        </>}
        <Field label="Discount" value={discount} keyboardType="decimal-pad" editable={!busy && !couponCode} onChangeText={setDiscount} />
        <View style={styles.row}>{[['amount', 'Amount'], ['percent', 'Percent']].map(([value, title]) => <Button key={value} title={title} secondary={discountType !== value} disabled={busy || !!couponCode} onPress={() => setDiscountType(value)} />)}</View>
        {(catalog?.settings.couponsEnabled || couponCode) && <Field label="Coupon code" value={couponCode} maxLength={30} autoCapitalize="characters" editable={!busy} onChangeText={value => { setCouponCode(value.trim().toUpperCase()); if (value) setDiscount('0'); }} />}
        {customerId && (catalog?.settings.loyaltyEnabled || Number(redeemPoints) > 0) && <><Label muted>{`${catalog?.customers.find(customer => customer.id === customerId)?.loyalty_points || 0} points available`}</Label><Field label="Loyalty points to redeem" value={redeemPoints} keyboardType="number-pad" editable={!busy} onChangeText={setRedeemPoints} /></>}
        <Label>Payment method</Label><View style={[styles.row, { flexWrap: 'wrap' }]}>{[['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['cod', 'COD'], ['split', 'Split payment'], ['deposit', 'Deposit']].map(([method, title]) => <Button key={method} title={title} secondary={paymentMethod !== method} disabled={busy} onPress={() => setPaymentMethod(method)} />)}</View>
        <Button title="Review checkout" disabled={!online || !catalog?.shift || !storageReady} busy={busy} onPress={() => void run(async () => {
          const next = await api<Quote>('quote', scope, checkoutRequest()); setQuote(next); setReceived(['split', 'deposit'].includes(paymentMethod) ? '' : next.total.total.toFixed(2));
        })} />
        <Field label="Hold name" value={holdLabel} maxLength={80} editable={!busy} onChangeText={setHoldLabel} />
        <Button title="Hold order" secondary disabled={!online || busy || !holdLabel.trim()} onPress={() => void run(async () => {
          const request = checkoutRequest();
          await api('quote', scope, request);
          await storage.setItem(draftKey, JSON.stringify({ items, customerId, paymentMethod, shipping, deliveryFee, discount, discountType, couponCode, redeemPoints, hold }));
          await storage.setItem(holdRequestKey, JSON.stringify(request)); setPendingHold(request);
          await api('hold', scope, request); await checkHold(request);
        })} />
        <Button title="Clear cart" secondary disabled={busy} onPress={() => theme.alert('Clear cart?', hold ? 'Clear this local copy? The held order stays saved on the server.' : 'Remove these unsaved items?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', onPress: () => { setItems([]); setHold(null); } }])} />
      </Card>}
      <Field label="Search" placeholder="Product name or SKU" value={search} onChangeText={setSearch} />
      {!catalog && <ActivityIndicator />}
      {(catalog?.products ?? []).filter(product => `${product.name} ${product.sku} ${product.size} ${product.color}`.toLowerCase().includes(search.toLowerCase())).slice(0, 50).map(product => <Pressable key={product.id} accessibilityRole="button" disabled={busy || !storageReady || product.available <= 0} onPress={() => {
        if (catalog?.groups.some(group => group.product_id === product.id)) { setProduct(product); setOptions([]); }
        else add(product, []);
      }}><Card><View style={styles.row}>{product.image_url && <Image source={{ uri: product.image_url }} style={{ width: 54, height: 64, borderRadius: 8 }} />}
        <View style={{ flex: 1 }}><Label>{product.name}</Label><Label muted>{[product.size, product.color].filter(Boolean).join(' · ')}</Label><Label>{`${money(product.selling_price, catalog?.settings.currency)} · ${product.available} available`}</Label></View>
      </View></Card></Pressable>)}
      {catalog && catalog.products.length > 50 && <Label muted>Search to find more products. Up to 50 matches are shown.</Label>}
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
        setCouponCode(saved.draft.couponCode || ''); setRedeemPoints(saved.draft.points); setHold({ id: saved.id, version: saved.version }); setHoldLabel(saved.label); setChooseHold(false); setQuote(null);
      }} /><Button title="Delete held order" secondary disabled={busy || !online} onPress={() => theme.alert('Delete held order?', `${saved.label} — no payment or stock will change.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(async () => { try { await api('delete-hold', scope, { id: saved.id, version: saved.version }); } finally { setCatalog(await api<Catalog>('pos', scope)); } }) }])} /></Card>)}
      <Button title="Close" secondary disabled={busy} onPress={() => setChooseHold(false)} />
    </ScrollView></SafeAreaView></Modal>
    <Modal visible={chooseCustomer} animationType="slide" onRequestClose={() => setChooseCustomer(false)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Label large>Select customer</Label><Field label="Search" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Name or phone" />
      <Button title="Walk-in customer" secondary onPress={() => { setCustomerId(''); setShipping(value => ({ ...value, recipientName: '', phone: '', address: '' })); setChooseCustomer(false); }} />
      {catalog?.customers.filter(customer => `${customer.name} ${customer.phone || ''}`.toLowerCase().includes(customerSearch.toLowerCase())).slice(0, 50).map(customer => <Button key={customer.id} title={`${customer.name} · ${customer.phone || ''}`} secondary onPress={() => { setCustomerId(customer.id); setShipping(value => ({ ...value, recipientName: customer.name, phone: customer.phone || '', address: customer.address || '' })); setChooseCustomer(false); }} />)}
      <Button title="Close" secondary onPress={() => setChooseCustomer(false)} />
    </ScrollView></SafeAreaView></Modal>
    <Modal visible={!!product} animationType="slide" onRequestClose={() => setProduct(null)}><SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={styles.page}>
      <Label large>{product?.name}</Label>{catalog?.groups.filter(group => group.product_id === product?.id).map(group => <Card key={group.id}><Label>{group.name}</Label>
        {catalog.options.filter(option => option.group_id === group.id && option.is_active).map(option => <Button key={option.id} title={`${options.includes(option.id) ? '✓ ' : ''}${option.name} (+${money(option.price_adjustment, catalog.settings.currency)})`} secondary onPress={() => setOptions(ids => ids.includes(option.id) ? ids.filter(id => id !== option.id) : [...(group.selection_type === 'single' ? ids.filter(id => !catalog.options.some(value => value.id === id && value.group_id === group.id)) : ids), option.id])} />)}
      </Card>)}<Button title="Add to order" onPress={() => { if (product) add(product, options); }} /><Button title="Cancel" secondary onPress={() => setProduct(null)} />
    </ScrollView></SafeAreaView></Modal>
  </ScrollView>;
}
