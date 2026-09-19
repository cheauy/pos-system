'use client';

import { useEffect, useState } from 'react';
import { Check, CreditCard, MapPin, Package, Plus, ShoppingCart, Store, Trash2, Truck } from 'lucide-react';
import type { CurrencyQuote, CartLine, PaymentMethod, Product, ProductGroup, ShippingDetails, Tender, Workspace } from './pos-workspace-types';
import { inventoryFor, money, splitRemaining, stockFor, stockLabel, tenderIssue } from './pos-workspace-helpers';
import { CurrencyAmountInput } from './pos-currency-components';
import { paymentHiddenForWalkIn } from './pos-customer-helpers';
import { quoteMoney } from './pos-currency';
import { ProductImage } from './pos-workspace-components';
import { CarrierCards, PaymentMethodSelect } from './pos-checkout-controls';
import s from './pos-workspace.module.css';

export const PAYMENT_METHODS: Array<[PaymentMethod, string]> = [
  ['cash','Cash'], ['cod','Cash on delivery (COD)'], ['deposit','Cash deposit'],
  ['bank_transfer','Bank transfer — received'], ['other','Other payment — received'],
  ['credit','Customer credit'], ['split','Split payment']
];
export const shippingLabel = (method: ShippingDetails['method']) => method === 'delivery' ? 'Delivery' : method === 'pickup' ? 'Pickup' : 'In-store';

export function VariantPicker({ group, data, branchId, lines, onAdd, onAllocate, initialColor = '', initialSize = '', quote }: {
  group: ProductGroup; data: Workspace; branchId: string; lines: CartLine[];
  onAdd: (product: Product) => void; onAllocate: (group: ProductGroup) => void;
  initialColor?: string; initialSize?: string; quote?: CurrencyQuote;
}) {
  const variants = data.products.filter(p => group.variants.some(v => v.id === p.id));
  const colorOptions = Array.from(new Set(variants.map(p => p.color || 'Standard')));
  const [color, setColor] = useState(colorOptions.includes(initialColor) ? initialColor : colorOptions[0] || 'Standard');
  const [size, setSize] = useState(initialSize === 'all' ? '' : initialSize);
  const [chosenId, setChosenId] = useState('');
  const allSizes = Array.from(new Set(variants.map(p => p.size || 'Standard'))).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  const matching = variants.filter(p => (p.color || 'Standard') === color && (p.size || 'Standard') === size);
  const selected = matching.length === 1 ? matching[0] : matching.find(p => p.id === chosenId);
  const cartQty = selected ? lines.filter(l => l.productId === selected.id).reduce((sum,l) => sum+l.quantity,0) : 0;
  const stock = selected ? inventoryFor(selected, branchId, data) : null;
  const remaining = Math.max(0, (stock?.available || 0) - cartQty);
  const unassigned = variants.reduce((sum,p) => sum + inventoryFor(p, branchId, data).unassigned, 0);
  const branchName = data.branches.find(b => b.id === branchId)?.name || 'Selected branch';
  const cash = (v: number) => quote ? quoteMoney(v,quote) : money(v, data.settings.currency);
  return <div className={s.stack}>
    <div className={s.productDialogHeading}><ProductImage src={selected?.variant_image_url || selected?.image_url || group.image} alt={group.name}/><div><h3>{group.name}</h3><p>Choose the exact color and size · {branchName}</p></div></div>
    <fieldset className={s.optionFieldset}><legend>1. Color</legend><div className={s.choiceChips}>{colorOptions.map(c => <button type="button" key={c} className={color === c ? s.selectedChoice : s.choice} aria-pressed={color === c} onClick={() => { setColor(c); setChosenId(''); if (!variants.some(p => (p.color || 'Standard') === c && (p.size || 'Standard') === size)) setSize(''); }}>{c}</button>)}</div></fieldset>
    <fieldset className={s.optionFieldset}><legend>2. Size</legend><div className={s.choiceChips}>{allSizes.map(z => {
      const options = variants.filter(p => (p.color || 'Standard') === color && (p.size || 'Standard') === z);
      const available = options.reduce((sum,p) => sum + stockFor(p,branchId,data),0);
      return <button type="button" key={z} disabled={!options.length} className={size === z ? s.selectedChoice : s.choice} aria-pressed={size === z} onClick={() => { setSize(z); setChosenId(''); }}><strong>{z}</strong><small>{!options.length ? 'Not available' : available > 0 ? `${available} in stock` : options.some(p => inventoryFor(p,branchId,data).unassigned > 0) ? 'Unassigned' : 'No branch stock'}</small></button>;
    })}</div></fieldset>
    {matching.length > 1 && <label className={s.field}>Select SKU<select value={chosenId} onChange={e => setChosenId(e.target.value)}><option value="">Choose the exact SKU</option>{matching.map(p => <option key={p.id} value={p.id}>{p.sku || p.name} · {cash(Number(p.selling_price))}</option>)}</select></label>}
    {selected && stock && <div className={s.stockDetail}>
      <div className={s.between}><strong>{[selected.color,selected.size].filter(Boolean).join(' / ') || 'Standard'}</strong><strong className={s.blueText}>{cash(Number(selected.selling_price))}</strong></div>
      <p>SKU: {selected.sku || '—'}</p><div className={s.between}><span>{branchName}</span><strong>{stock.available} available · {cartQty} in cart</strong></div>
      <div className={s.between}><span>Total stock across the business</span><strong>{stock.global}</strong></div>
      {stock.mirrorNeedsSync && <small>Using existing total stock for this single-location business. The branch mirror is synchronized during checkout; no stock is created.</small>}
      {stock.available === 0 && <p className={s.orangeText}>{stockLabel(selected,branchId,data)}. {stock.unassigned > 0 ? `${stock.unassigned} existing units have not been assigned to a branch.` : stock.global > 0 ? 'Use the correct branch or transfer stock through Inventory.' : 'Add stock through Inventory before selling this variant.'}</p>}
    </div>}
    {unassigned > 0 && <div className={s.stockDetail}><p>{unassigned} existing units in this product group are unassigned. This is different from being sold out.</p>{data.canConfigure ? <button className={s.button} onClick={() => onAllocate(group)}><Package size={16}/>Review branch allocation</button> : <p className={s.muted}>Ask the owner to allocate stock to this branch.</p>}</div>}
    <button className={s.primary} disabled={!selected || remaining <= 0} onClick={() => { if (selected) onAdd(selected); }}><ShoppingCart size={17}/>{!selected ? 'Choose a size and color' : remaining <= 0 ? 'No additional units available' : `Add selected variant · ${cash(Number(selected.selling_price))}`}</button>
  </div>;
}

type CheckoutPanelProps = {
  quote: CurrencyQuote; total: number; subtotal: number; discount: number; discountLabel: string; tax: number; taxRate: number;
  delivery: string; setDelivery: (value: string) => void;
  shipping: ShippingDetails; setShipping: (value: ShippingDetails) => void;
  customerId: string; customerName?: string; onUseCustomer: () => void;
  createCustomer: boolean; canCreateCustomer: boolean; setCreateCustomer: (value:boolean)=>void;
  method: PaymentMethod; setMethod: (value: PaymentMethod) => void;
  paid: string; setPaid: (value: string) => void;
  tenders: Tender[]; setTenders: (value: Tender[]) => void;
  confirmed: boolean; setConfirmed: (value: boolean) => void;
  onEntryError: (key:string,error:string|null)=>void;
  received: number; error: string | null; busy: boolean; onBack: () => void; onConfirm: () => void;
};

export function CheckoutPanel(p: CheckoutPanelProps) {
  const [cashRevision,setCashRevision]=useState(0);
  const [tenderRevision,setTenderRevision]=useState(0);
  const [chooseType,setChooseType] = useState(Boolean(p.customerId) || p.shipping.method !== 'in_store');
  const cash = (v: number) => quoteMoney(v,p.quote);
  const isWalkIn = !p.customerId && p.shipping.method === 'in_store';
  const splitError = p.method === 'split' ? tenderIssue(p.tenders,p.total) : null;
  useEffect(() => {
    if (paymentHiddenForWalkIn(p.method, isWalkIn)) p.setMethod('cash');
  }, [isWalkIn, p.method, p.setMethod]);
  function updateTender(index: number, patch: Partial<Tender>) { p.setTenders(p.tenders.map((t,i) => i === index ? { ...t,...patch } : t)); }
  const shippingMethods = [
    { id:'in_store' as const, label:'In-store', text:'Customer takes the items now.', Icon:Store },
    { id:'pickup' as const, label:'Pickup', text:'Customer collects from the shop.', Icon:Package },
    { id:'delivery' as const, label:'Delivery', text:'Deliver to the customer.', Icon:Truck }
  ];
  return <fieldset disabled={p.busy} className={s.flowFieldset}>
    <div className={s.stack}>
      <div className={s.checkoutStep}><span>1</span><div><h3>Order type</h3><p>Choose how the customer receives this order.</p></div></div>
      {!p.customerId && !chooseType && p.shipping.method === 'in_store' ? <div className={s.walkInSummary}>
        <Store size={23}/><div><strong>In-store · Walk-in customer</strong><p>No recipient, phone or delivery details needed.</p></div>
        <button type="button" className={s.textButton} onClick={()=>setChooseType(true)}>Arrange pickup / delivery</button>
      </div> : <div className={s.shippingChoices}>{shippingMethods.map(({id,label,text,Icon}) => <button key={id} type="button" aria-pressed={p.shipping.method === id} className={p.shipping.method === id ? s.selectedShipping : s.shippingChoice} onClick={() => {
        p.setShipping({ ...p.shipping,method:id,carrier:id === 'delivery' ? p.shipping.carrier || '' : '',carrierOther:id === 'delivery' ? p.shipping.carrierOther || '' : '' });
        if (id !== 'delivery') p.setDelivery('0'); if (id === 'in_store') p.setCreateCustomer(false);
      }}><Icon size={20}/><strong>{label}</strong><small>{text}</small></button>)}</div>}
      {p.shipping.method !== 'in_store' && <div className={s.shippingForm}>
        {p.customerId && <div className={`${s.customerPrefill} ${s.fullWidth}`}><span>{p.customerName} · Recipient details are for this order only.</span><button type="button" className={s.textButton} onClick={p.onUseCustomer}>Use saved customer details</button></div>}
        <label className={s.field}>Recipient name *<input aria-label="Recipient name" value={p.shipping.recipientName} maxLength={120} onChange={e => p.setShipping({ ...p.shipping,recipientName:e.target.value })}/></label>
        <label className={s.field}>Phone *<input type="tel" aria-label="Delivery phone" value={p.shipping.phone} maxLength={40} onChange={e => p.setShipping({ ...p.shipping,phone:e.target.value })}/></label>
        {p.shipping.method === 'delivery' && <>
          <label className={`${s.field} ${s.fullWidth}`}>Delivery address *<textarea aria-label="Delivery address" value={p.shipping.address} rows={2} maxLength={500} placeholder="Enter this customer’s delivery address" onChange={e => p.setShipping({ ...p.shipping,address:e.target.value })}/></label>
          <CarrierCards value={p.shipping.carrier || ''} disabled={p.busy} onChange={carrier=>p.setShipping({...p.shipping,carrier,carrierOther:''})}/>
          {p.shipping.carrier === 'other' && <label className={`${s.field} ${s.fullWidth}`}>Carrier name (optional)<input aria-label="Other carrier" value={p.shipping.carrierOther || ''} maxLength={80} onChange={e=>p.setShipping({...p.shipping,carrierOther:e.target.value})}/></label>}
          <label className={s.field}>Shipping fee ({p.quote.displayCurrency})<CurrencyAmountInput label="Delivery fee" value={p.delivery} onChange={p.setDelivery} quote={p.quote} onError={error=>p.onEntryError('delivery',error)}/></label>
          <p className={s.muted}><MapPin size={14}/> Saved with this order. Carrier selection does not book a courier or fetch carrier rates.</p>
        </>}
        {!p.customerId && <div className={s.fullWidth}>{p.canCreateCustomer && <label className={s.confirmation}><input type="checkbox" aria-label="Save as new customer" checked={p.createCustomer} onChange={e=>p.setCreateCustomer(e.target.checked)}/><span>Save as new customer after this sale succeeds</span></label>}<p className={s.muted}>{p.createCustomer ? 'Name and phone are required. An existing matching phone will ask you to select that customer instead; accounts are never silently merged.' : 'Recipient details stay on this order. No customer account is created automatically.'}</p></div>}
      </div>}
      <div className={s.checkoutStep}><span>2</span><div><h3>Payment method</h3><p>Record the payment received, or an amount still due.</p></div></div>
      <p className={s.currencyNotice}>Entry currency: <strong>{p.quote.displayCurrency}</strong>{p.quote.enabled && <> · $1 = {p.quote.usdKhrRate.toLocaleString('en-US',{maximumFractionDigits:4})}៛</>}. Accounting stays in {p.quote.baseCurrency}.</p>
      <PaymentMethodSelect value={p.method} onChange={p.setMethod} disabled={p.busy} total={p.total} hasCustomer={Boolean(p.customerId)} isWalkIn={isWalkIn}/>
      {['cash','cod','deposit'].includes(p.method) && <div className={s.field}><label>{p.method === 'cash' ? 'Cash received' : p.method === 'deposit' ? 'Cash deposit received' : 'Cash already received (optional)'} ({p.quote.displayCurrency})</label>
        <CurrencyAmountInput key={cashRevision} label="Amount received" value={p.paid} quote={p.quote} onChange={p.setPaid} placeholder={p.method === 'cash' || p.method === 'cod' ? p.total : 0} onError={error=>p.onEntryError('paid',error)}/>
        {(p.method === 'cash' || p.method === 'cod') && <button type="button" className={s.textButton} onClick={()=>{p.setPaid(p.total.toFixed(2));setCashRevision(n=>n+1);}}>Exact amount · {cash(p.total)}</button>}
        {p.method === 'cash' && p.paid !== '' && p.received >= p.total && <small>Change to give: <strong>{cash(p.received-p.total)}</strong></small>}
        {p.method !== 'cash' && <small>Balance due: {cash(Math.max(0,p.total-p.received))}</small>}
      </div>}
      {p.method === 'credit' && <p className={s.paymentInfo}>A customer account is required. The total is charged to that account; the server checks its credit limit.</p>}
      {['bank_transfer','other'].includes(p.method) && <label className={s.confirmation}><input type="checkbox" aria-label="Payment received confirmation" checked={p.confirmed} onChange={e => p.setConfirmed(e.target.checked)}/><span>I verified that {cash(p.total)} has been received. This records payment; it does not charge a card or bank account.</span></label>}
      {p.method === 'split' && <div className={s.splitEditor}>
        <div className={s.between}><strong><CreditCard size={16}/> Split payment</strong><span>2–5 payment parts · {p.quote.displayCurrency}</span></div>
        <p className={s.muted}>Enter the net amount applied to this sale for each payment. Cash change is not part of the allocation. All parts use the selected entry currency.</p>
        {p.tenders.map((t,i) => <div key={`${i}-${tenderRevision}`} className={s.tenderRow}>
          <label>Method<select aria-label={`Payment ${i+1} method`} value={t.method} onChange={e => updateTender(i,{ method:e.target.value as Tender['method'] })}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
          <div className={s.field}><label>Amount</label><CurrencyAmountInput label={`Payment ${i+1} amount`} quote={p.quote} value={String(t.amount || '')} onChange={value=>updateTender(i,{amount:Number(value)})} onError={error=>p.onEntryError(`tender-${i}`,error)}/><button type="button" className={s.textButton} disabled={splitRemaining(p.tenders,p.total,i) <= 0} onClick={() => {updateTender(i,{ amount:splitRemaining(p.tenders,p.total,i) });setTenderRevision(n=>n+1);}}>Fill remaining</button></div>
          <label className={s.tenderReference}>Reference<input aria-label={`Payment ${i+1} reference`} value={t.reference} onChange={e => updateTender(i,{ reference:e.target.value })} maxLength={120} placeholder="Optional reference"/></label>
          <button type="button" className={s.iconButton} disabled={p.tenders.length <= 2} aria-label={`Remove payment ${i+1}`} onClick={() => {p.setTenders(p.tenders.filter((_,j) => i !== j));setTenderRevision(n=>n+1);}}><Trash2 size={16}/></button>
        </div>)}
        {p.tenders.length < 5 && <button type="button" className={s.button} onClick={() => p.setTenders([...p.tenders,{method:'cash',amount:Math.max(0,splitRemaining(p.tenders,p.total)),reference:''}])}><Plus size={15}/>Add payment part</button>}
        <div className={s.between}><strong>{splitRemaining(p.tenders,p.total) < 0 ? 'Overallocated' : 'Still to allocate'}</strong><strong className={splitError ? s.orangeText : s.blueText}>{cash(Math.abs(splitRemaining(p.tenders,p.total)))}</strong></div>
        {splitError && <p role="status" className={s.orangeText}>{splitError}</p>}
        <label className={s.confirmation}><input type="checkbox" aria-label="Split payments received confirmation" checked={p.confirmed} disabled={Boolean(splitError)} onChange={e => p.setConfirmed(e.target.checked)}/><span>I verified all split payments have been received.</span></label>
      </div>}
      <dl className={s.reviewTotals}><div><dt>Merchandise subtotal</dt><dd>{cash(p.subtotal)}</dd></div><div><dt>{p.discountLabel}</dt><dd>−{cash(p.discount)}</dd></div><div><dt>Tax ({p.taxRate}%)</dt><dd>{cash(p.tax)}</dd></div><div><dt>Shipping fee</dt><dd>{cash(Number(p.delivery))}</dd></div><div className={s.totalRow}><dt>Total</dt><dd>{cash(p.total)}</dd></div></dl>
      {p.error && <p role="status" className={s.paymentInfo}>{p.error}</p>}
      <div className={s.flowActions}><button type="button" className={s.button} onClick={p.onBack}>Back to cart</button><button type="button" className={s.primary} disabled={Boolean(p.error)} onClick={p.onConfirm}><Check size={18}/>{p.busy ? 'Saving sale…' : `Confirm Sale · ${cash(p.total)}`}</button></div>
    </div>
  </fieldset>;
}
