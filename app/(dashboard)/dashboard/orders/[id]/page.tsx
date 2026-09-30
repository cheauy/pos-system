import Link from 'next/link';
import ScannedOrderComplete from '@/components/scanned-order-complete';
import OrderPrintMenu from '@/components/order-print-menu';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, Clock, CreditCard, ExternalLink, Info, MapPin, Package, Phone, ReceiptText, ShoppingCart, StickyNote, UserRound, Wallet } from 'lucide-react';
import { requirePermission } from '@/lib/auth/require-permission';
import { businessHasPermission } from '@/lib/auth/effective-permissions';
import { createClient } from '@/lib/supabase/branch-server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getBranchContext } from '@/lib/branches/context';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import { PosReceipt } from '@/components/receipts/pos-receipt';
import { ReceiptViewer } from '@/components/receipts/receipt-viewer';
import CancelOrderForm from '@/components/cancel-order-form';
import ReturnItemsForm from './return-items-form';
import { CancelOrderItem, CopyOrderNumber, OrderMoreActions, OrderProgressBanner } from './order-detail-controls';
import { loadDetailedOrder } from './order-detail-data';
import { numeric, one, orderType, paymentName, recordReceipt, titleCase } from './order-detail-model';
import { money } from '../../pos/pos-workspace-helpers';
import s from './order-detail.module.css';
export default async function OrderDetailsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{scanned?:string}>}){
 const scanned=(await searchParams).scanned==='1';
 const business=await requirePermission('orders.view');const {id}=await params;
 const order=await loadDetailedOrder(business.id,id);if(!order)notFound();
 const db=await createClient();const context=await loadReceiptContext(business.id,business.name,id);
 const ownBranch=order.location_id===(await getBranchContext()).branchId;
 const customer=one(order.customers);const items=order.order_items || [];const original=order.pos_checkout?.receipt;
 const [branch,returns,activity,summary]=await Promise.all([
  order.location_id?supabaseAdmin.from('business_locations').select('*').eq('id',order.location_id).eq('business_id',business.id).maybeSingle():Promise.resolve({data:null,error:null}),
  items.length?supabaseAdmin.from('return_items').select('order_item_id,quantity').in('order_item_id',items.map(i=>i.id)):Promise.resolve({data:[],error:null}),
  supabaseAdmin.from('audit_logs').select('id,description,created_at,action').eq('business_id',business.id).eq('entity_type','order').eq('entity_id',id).order('created_at',{ascending:false}).limit(30),
  customer && ownBranch?db.rpc('tenh_order_customer_summary',{p_business_id:business.id,p_customer_id:customer.id}):Promise.resolve({data:null,error:customer?new Error('Switch to the order branch to view customer history.'):null}),
 ]);
 const name=branch.data?.name || original?.branchName || 'Unassigned';const zone=branch.data?.timezone || 'Asia/Phnom_Penh';
 const formatDate=(value:string)=>{try{return new Date(value).toLocaleString('en-US',{timeZone:zone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}catch{return value;}};
 let currency=original?.currency || 'USD';
 if(!original){const store=await db.from('business_storefronts').select('currency').eq('business_id',business.id).maybeSingle();currency=store.data?.currency || 'USD';}
 const cash=(v:number)=>money(numeric(v),currency);const receipt=recordReceipt(order,business.name,currency,name);
 const receiptHref=`/dashboard/orders/${id}/receipt`;
 const qtyMap=new Map<string,number>();for(const r of returns.data || [])qtyMap.set(r.order_item_id,(qtyMap.get(r.order_item_id)||0)+numeric(r.quantity));
 const returnable=items.map(i=>({id:i.id,product_name:[i.product_name || one(i.products)?.name || 'Product',i.variant_label].filter(Boolean).join(' · '),quantity:numeric(i.quantity),unit_price:numeric(i.unit_price),returned_quantity:qtyMap.get(i.id)||0,image_url:one(i.products)?.image_url ?? null,sku:one(i.products)?.sku ?? null})).filter(i=>i.quantity>i.returned_quantity);
 const managed=['new','pending','in_progress','completed'].includes(order.status);const hasReturns=qtyMap.size>0;
 const financiallyLinked=numeric(order.amount_paid)>0 || ['paid','refunded','pending_verification'].includes(order.payment_status || '') || !!order.payment_reference || order.payment_method==='credit' || hasReturns || !!returns.error;
 const [allowReturn,allowCancel,allowEdit,allowCustomerView]=await Promise.all([businessHasPermission(business,'orders.return'),businessHasPermission(business,'orders.cancel'),businessHasPermission(business,'orders.update'),businessHasPermission(business,'customers.view')]);
 const canReturn=ownBranch && managed && !returns.error && returnable.length>0 && allowReturn;
 const canCancel=ownBranch && managed && !financiallyLinked && allowCancel;
 const canCancelItem=ownBranch && allowCancel && ['online','qr'].includes(order.order_source || '') && ['new','pending','in_progress'].includes(order.status) && !financiallyLinked && !order.pos_checkout && !numeric(order.discount);
 const visibleStatus=['online','qr'].includes(order.order_source || '') && ['preparing','ready'].includes(order.online_status || '') && order.status==='pending'?'in_progress':order.status;
 const paymentStatus=order.payment_status==='refunded'?'Refunded':order.payment_status==='pending_verification'?'Pending verification':numeric(order.remaining_balance)>0?(numeric(order.amount_paid)>0?'Partially paid':'Unpaid'):order.payment_status==='paid'?'Paid':titleCase(order.payment_status || 'Unpaid');
 const fulfillment=orderType(order);const source=order.order_source==='qr'?'Table QR':order.order_source==='online'?'Online Store':'POS';
 const actor=order.pos_checkout?.createdBy;let cashier=original?.cashierName || 'Not recorded';
 if(actor && !original?.cashierName){const member=await db.from('business_members').select('user_id').eq('business_id',business.id).eq('user_id',actor).maybeSingle();if(member.data){const profile=await db.from('profiles').select('full_name').eq('id',actor).maybeSingle();cashier=profile.data?.full_name || cashier;}}
 const events=(activity.data || []).map((e:{id:string;description:string;created_at:string;action:string})=>({id:e.id,label:e.description,date:e.created_at})).reverse();
 if(!events.some((e:{date:string})=>e.date===order.created_at))events.unshift({id:'created',label:'Order created',date:order.created_at});
 const customerName=order.guest_name || customer?.name || 'Walk-in customer';
 const initials=customerName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('') || 'C';
 const phone=order.guest_phone || customer?.phone || '';const address=order.guest_address || customer?.address || '';
 const unitsOrdered=items.reduce((n,i)=>n+numeric(i.quantity),0);
 const online=['online','qr'].includes(order.order_source || '');
 const cancelNow=canCancel || (ownBranch && allowCancel && online && ['new','accepted','preparing','ready'].includes(order.online_status || 'new') && !['completed','cancelled','refunded'].includes(order.status));
 return <main className={s.page}>
 {scanned && ownBranch && allowEdit && ['new','pending'].includes(order.status) && <ScannedOrderComplete id={id} number={order.order_number} businessId={business.id} updatedAt={order.updated_at}/>}
 <header className={s.header}><div><Link className={s.back} href="/dashboard/orders"><ArrowLeft size={15}/>Back to orders</Link><h1>Order Details</h1><p>View customer, products and payment information.</p></div><div className={s.headerActions}>
 <OrderPrintMenu orderId={id} className={s.button}/>
 <OrderMoreActions id={id} businessId={business.id} updatedAt={order.updated_at} canEdit={ownBranch && allowEdit} note={order.customer_note || ''}/>
 {canReturn && <ReturnItemsForm orderId={id} orderNumber={order.order_number} items={returnable} triggerClassName={`${s.button} ${s.buttonReturn}`}/>}
 {cancelNow && <CancelOrderForm orderId={id} orderNumber={order.order_number} businessId={business.id} online={online} className={`${s.button} ${s.buttonCancel}`}/>}
 </div></header>
 <section className={s.metrics}>
 <Metric tone="blue" icon={<ReceiptText/>} label="Order number"><strong>{order.order_number}</strong><CopyOrderNumber value={order.order_number}/></Metric>
 <Metric tone="green" icon={<CheckCircle2/>} label="Status"><Badge value={visibleStatus}/></Metric>
 <Metric tone="blue" icon={<CreditCard/>} label="Payment"><strong>{paymentName(order)}</strong><PayBadge value={paymentStatus}/></Metric>
 <Metric tone="blue" icon={<CalendarDays/>} label="Ordered at"><strong>{formatDate(order.created_at)}</strong></Metric>
 </section>
 <OrderProgressBanner id={id} updatedAt={order.updated_at} businessId={business.id} status={visibleStatus} source={order.order_source} onlineStatus={order.online_status} fulfillment={fulfillment} canAdvance={ownBranch && allowEdit}/>
 <section className={s.twoColumns}>
 <div className={s.card}><Heading tone="violet" icon={<ReceiptText/>} title="Order Information" text="General information about this order."/><div className={s.infoGrid}>
 <Field label="Order number" value={order.order_number}/><Field label="Branch" value={name}/><Field label="Sales channel" value={`${source} · ${fulfillment}`}/><Field label="Created at" value={formatDate(order.created_at)}/><Field label="Payment method" value={paymentName(order)}/><Field label="Status" value={<Badge value={visibleStatus}/>}/><Field label="Cashier / Staff" value={cashier}/><Field label="Payment status" value={paymentStatus}/>
 {order.order_code && <Field label="Order code" value={order.order_code}/>}
 </div></div>
 <div className={s.card}><div className={s.between}><Heading tone="blue" icon={<UserRound/>} title="Customer Information" text="Customer details and purchase history."/>{customer && ownBranch && allowCustomerView && <Link className={s.soft} href={`/dashboard/customers/${customer.id}`}>View customer<ExternalLink size={13}/></Link>}</div>
 <div className={s.customerGrid}>
  <div className={s.customerProfile}>
   <div className={s.customerName}><span className={s.avatar}>{initials}</span><strong>{customerName}</strong></div>
   <p><Phone size={16}/>{phone || 'No phone'}</p>
   <p><MapPin size={16}/>{address || 'No address'}</p>
   <p><StickyNote size={16}/><span className={s.noteLabel}>Customer note</span>{order.customer_note || '—'}</p>
  </div>
  <div className={s.customerSide}>
   <div className={s.tags}><span data-tone="blue">{source}</span><span data-tone="violet">{fulfillment}</span><Badge value={visibleStatus}/></div>
   <div className={s.history}><span><ShoppingCart size={20}/></span><div><small>Completed orders</small><strong>{customer?(summary.error?'Unavailable':`${summary.data?.completedCount ?? 0}`):'Guest'}</strong></div><span><BarChart3 size={20}/></span><div><small>Completed sales</small><strong>{customer?(summary.error?'—':cash(summary.data?.completedTotal || 0)):'—'}</strong></div></div>
  </div>
 </div>
 </div></section>
 <section className={s.itemsRow}>
 <div className={s.card}><Heading tone="blue" icon={<ShoppingCart/>} title="Items Purchased" text={`${items.length} item ${items.length===1?'line':'lines'} · ${unitsOrdered} ${unitsOrdered===1?'unit':'units'} originally ordered`}/>
 <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Product</th><th>SKU</th><th>Variant</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{items.map(i=>{const p=one(i.products);return <tr key={i.id}><td><div className={s.product}>{p?.image_url?<img src={p.image_url} alt={i.product_name || p.name}/>:<Package size={26}/>}<div><strong>{i.product_name || p?.name || 'Product'}</strong>{i.selected_options?.length? <small>{i.selected_options.map(o=>o.name).filter(Boolean).join(', ')}</small>:null}{(qtyMap.get(i.id)||0)>0 && <small className={s.returnedText}>Returned: {qtyMap.get(i.id)}</small>}{canCancelItem && <CancelOrderItem orderId={id} itemId={i.id} name={i.product_name || p?.name || 'item'} updatedAt={order.updated_at} businessId={business.id}/>}</div></div></td><td>{p?.sku || '—'}</td><td>{i.variant_label || '—'}</td><td>{numeric(i.quantity)}</td><td>{cash(i.unit_price)}</td><td><strong>{cash(i.subtotal)}</strong></td></tr>;})}</tbody></table>{!items.length && <p className={s.muted}>No recorded items.</p>}</div>
 {returns.error && <p role="alert" className={s.warning}>Return history could not be checked. Return actions are unavailable until it reloads.</p>}
 <p className={s.infoNote}><Info size={16}/>Order-level discounts are shown in the totals. They are not invented as separate line discounts.</p>
 </div>
 <aside className={s.card}><Heading tone="green" icon={<ReceiptText/>} title="Order Summary" text=""/><div className={s.totals}><Total label="Subtotal" value={cash(order.subtotal)}/><Total label="Discount" value={`−${cash(order.discount)}`}/><Total label="Tax included at checkout" value={cash(original?.taxAmount || 0)}/><Total label="Shipping fee" value={cash(order.delivery_fee)}/><hr/><Total label="Amount recorded received" value={cash(order.amount_paid)}/><Total label="Change recorded" value={cash(order.change_amount)}/><Total label="Balance due" value={cash(order.remaining_balance)}/><div className={s.grand}><span>Order total</span><strong>{cash(order.total)}</strong></div>{hasReturns && <p className={s.muted}>Return records are separate. The original POS receipt retains the initial sale amounts.</p>}</div></aside>
 </section>
 <section className={s.twoColumns}><div className={s.card}><Heading tone="violet" icon={<Clock/>} title="Payment & Timeline" text="Recorded events and payment information."/>
 <div className={s.paymentSummary}><Wallet size={18}/><span>{paymentStatus} · Received {cash(order.amount_paid)} · Balance {cash(order.remaining_balance)}</span><PayBadge value={paymentStatus}/></div>
 {activity.error && <p role="alert" className={s.warning}>Activity history is unavailable. No payment or completion events have been assumed.</p>}
 <ol className={s.timeline}>{events.map((e:{id:string;label:string;date:string},index:number)=><li key={e.id}><span className={s.dot} data-latest={index===0}/><div><strong>{e.label}</strong><small>{formatDate(e.date)}</small></div></li>)}</ol>
 </div><div className={s.card}><Heading tone="violet" icon={<ReceiptText/>} title="Receipt" text="Preview and print the recorded receipt."/><div className={s.receiptBox}><div className={s.receiptMini} aria-label="Receipt preview"><PosReceipt receipt={receipt} context={context}/></div><div><h3>{original?'Original receipt':'Order receipt'}</h3><p>{original?'View or print the original POS sale amounts. Later changes remain in order history.':'View the current order record. No original POS snapshot exists for this order.'}</p><ReceiptViewer receipt={receipt} context={context} printHref={receiptHref}/><p className={s.infoNote}><Info size={16}/>{original?'This receipt shows the original transaction record.':'This receipt reflects the current order record.'}</p></div></div></div></section>
 </main>;
}
function Badge({value}:{value:string}){return <span className={s.badge} data-status={value}>{value==='pending'?'Confirmed':titleCase(value)}</span>;}
function Heading({icon,title,text,tone='blue'}:{icon:ReactNode;title:string;text:string;tone?:string}){return <div className={s.heading}><span data-tone={tone}>{icon}</span><div><h2>{title}</h2>{text&&<p>{text}</p>}</div></div>;}
function Field({label,value}:{label:string;value:ReactNode}){return <div className={s.field}><span>{label}</span><div>{value}</div></div>;}
function PayBadge({value}:{value:string}){const tone=value==='Paid'?'paid':value==='Unpaid'?'unpaid':value==='Refunded'?'refunded':'partial';return <span className={s.payBadge} data-tone={tone}>{value}</span>;}
function Metric({icon,label,children,tone='blue'}:{icon:ReactNode;label:string;children:ReactNode;tone?:string}){return <div className={s.metric}><span className={s.metricIcon} data-tone={tone}>{icon}</span><div><small>{label}</small><div className={s.metricValue}>{children}</div></div></div>;}
function Total({label,value}:{label:string;value:string}){return <div className={s.totalRow}><span>{label}</span><strong>{value}</strong></div>;}
