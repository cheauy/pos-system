import Link from 'next/link';
import OrderPrintMenu from '@/components/order-print-menu';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, CreditCard, ExternalLink, MapPin, Package, Phone, ReceiptText, ShoppingCart, Store, UserRound } from 'lucide-react';
import { requirePermission } from '@/lib/auth/require-permission';
import { businessHasPermission } from '@/lib/auth/effective-permissions';
import { createClient } from '@/lib/supabase/branch-server';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import { PosReceipt } from '@/components/receipts/pos-receipt';
import { ReceiptViewer } from '@/components/receipts/receipt-viewer';
import CancelOrderForm from '@/components/cancel-order-form';
import ReturnItemsForm from './return-items-form';
import { CopyOrderNumber, OrderMoreActions } from './order-detail-controls';
import { loadDetailedOrder } from './order-detail-data';
import { numeric, one, orderType, paymentName, recordReceipt, titleCase } from './order-detail-model';
import { money } from '../../pos/pos-workspace-helpers';
import s from './order-detail.module.css';
export default async function OrderDetailsPage({params}:{params:Promise<{id:string}>}){
 const business=await requirePermission('orders.view');const {id}=await params;
 const order=await loadDetailedOrder(business.id,id);if(!order)notFound();
 const db=await createClient();const context=await loadReceiptContext(business.id,business.name);
 const customer=one(order.customers);const items=order.order_items || [];const original=order.pos_checkout?.receipt;
 const [branch,returns,activity,summary]=await Promise.all([
  order.location_id?db.from('business_locations').select('*').eq('id',order.location_id).eq('business_id',business.id).maybeSingle():Promise.resolve({data:null,error:null}),
  items.length?db.from('return_items').select('order_item_id,quantity').in('order_item_id',items.map(i=>i.id)):Promise.resolve({data:[],error:null}),
  db.from('audit_logs').select('id,description,created_at,action').eq('business_id',business.id).eq('entity_type','order').eq('entity_id',id).order('created_at',{ascending:false}).limit(30),
  customer?db.rpc('tenh_order_customer_summary',{p_business_id:business.id,p_customer_id:customer.id}):Promise.resolve({data:null,error:null}),
 ]);
 const name=branch.data?.name || original?.branchName || 'Unassigned';const zone=branch.data?.timezone || 'Asia/Phnom_Penh';
 const formatDate=(value:string)=>{try{return new Date(value).toLocaleString('en-US',{timeZone:zone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}catch{return value;}};
 let currency=original?.currency || 'USD';
 if(!original){const store=await db.from('business_storefronts').select('currency').eq('business_id',business.id).maybeSingle();currency=store.data?.currency || 'USD';}
 const cash=(v:number)=>money(numeric(v),currency);const receipt=recordReceipt(order,business.name,currency,name);
 const receiptHref=`/dashboard/orders/${id}/receipt`;
 const qtyMap=new Map<string,number>();for(const r of returns.data || [])qtyMap.set(r.order_item_id,(qtyMap.get(r.order_item_id)||0)+numeric(r.quantity));
 const returnable=items.map(i=>({id:i.id,product_name:[i.product_name || one(i.products)?.name || 'Product',i.variant_label].filter(Boolean).join(' · '),quantity:numeric(i.quantity),unit_price:numeric(i.unit_price),returned_quantity:qtyMap.get(i.id)||0})).filter(i=>i.quantity>i.returned_quantity);
 const managed=['new','pending','completed'].includes(order.status);const hasReturns=qtyMap.size>0;
 const financiallyLinked=numeric(order.amount_paid)>0 || ['paid','refunded','pending_verification'].includes(order.payment_status || '') || !!order.payment_reference || order.payment_method==='credit' || hasReturns || !!returns.error;
 const [allowReturn,allowCancel,allowEdit,allowCustomerView]=await Promise.all([businessHasPermission(business,'orders.return'),businessHasPermission(business,'orders.cancel'),businessHasPermission(business,'orders.update'),businessHasPermission(business,'customers.view')]);
 const canReturn=managed && !returns.error && returnable.length>0 && allowReturn;
 const canCancel=managed && !financiallyLinked && allowCancel;
 const paymentStatus=order.payment_status==='refunded'?'Refunded':order.payment_status==='pending_verification'?'Pending verification':numeric(order.remaining_balance)>0?(numeric(order.amount_paid)>0?'Part-paid':'Unpaid'):order.payment_status==='paid'?'Paid':titleCase(order.payment_status || 'Unpaid');
 const fulfillment=orderType(order);const source=order.order_source==='qr'?'Table QR':order.order_source==='online'?'Online Store':'POS';
 const actor=order.pos_checkout?.createdBy;let cashier=original?.cashierName || 'Not recorded';
 if(actor && !original?.cashierName){const member=await db.from('business_members').select('user_id').eq('business_id',business.id).eq('user_id',actor).maybeSingle();if(member.data){const profile=await db.from('profiles').select('full_name').eq('id',actor).maybeSingle();cashier=profile.data?.full_name || cashier;}}
 const events=(activity.data || []).map((e:{id:string;description:string;created_at:string;action:string})=>({id:e.id,label:e.description,date:e.created_at})).reverse();
 if(!events.some((e:{date:string})=>e.date===order.created_at))events.unshift({id:'created',label:'Order created',date:order.created_at});
 return <main className={s.page}>
 <header className={s.header}><div><Link className={s.back} href="/dashboard/orders"><ArrowLeft size={15}/>Back to orders</Link><h1>Order Details</h1><p>View customer, products and payment information.</p></div><div className={s.headerActions}>
 <OrderPrintMenu orderId={id} className={s.button}/>
 <OrderMoreActions id={id} number={order.order_number} businessId={business.id} updatedAt={order.updated_at} status={order.status} source={order.order_source} onlineStatus={order.online_status} canEdit={allowEdit} canDelete={canCancel && ['new','pending','cancelled'].includes(order.status)} note={order.customer_note || ''}/>
 {canReturn && <ReturnItemsForm orderId={id} orderNumber={order.order_number} items={returnable}/>}{canCancel && <CancelOrderForm orderId={id} orderNumber={order.order_number}/>}
 </div></header>
 <section className={s.metrics}>
 <Metric icon={<ReceiptText/>} label="Order number"><strong>{order.order_number}</strong><CopyOrderNumber value={order.order_number}/></Metric>
 <Metric icon={<CheckCircle2/>} label="Status"><Badge value={order.status}/></Metric>
 <Metric icon={<CreditCard/>} label="Payment"><strong>{paymentName(order)}</strong><small>{paymentStatus}</small></Metric>
 <Metric icon={<CalendarDays/>} label="Ordered at"><strong>{formatDate(order.created_at)}</strong></Metric>
 </section>
 <section className={s.twoColumns}>
 <div className={s.card}><Heading icon={<ReceiptText/>} title="Order Information" text="General information about this order"/><div className={s.infoGrid}>
 <Field label="Order number" value={order.order_number}/><Field label="Branch" value={name}/><Field label="Sales channel" value={`${source} · ${fulfillment}`}/><Field label="Created at" value={formatDate(order.created_at)}/><Field label="Payment method" value={paymentName(order)}/><Field label="Status" value={<Badge value={order.status}/>}/><Field label="Cashier / Staff" value={cashier}/><Field label="Payment status" value={paymentStatus}/>
 </div></div>
 <div className={s.card}><div className={s.between}><Heading icon={<UserRound/>} title="Customer Information" text="Customer details and purchase history"/>{customer && allowCustomerView && <Link className={s.soft} href={`/dashboard/customers/${customer.id}`}>View customer<ExternalLink size={13}/></Link>}</div>
 <div className={s.customerGrid}><div className={s.customerFields}><Field label="Customer name" value={order.guest_name || customer?.name || 'Walk-in customer'}/><Field label="Phone" value={order.guest_phone || customer?.phone || '—'}/><Field label="Address" value={order.guest_address || customer?.address || '—'}/><Field label="Customer note" value={order.customer_note || '—'}/></div>
 <div><div className={s.history}><ShoppingCart size={22}/><div><small>Completed orders</small><strong>{customer?(summary.error?'Unavailable':`${summary.data?.completedCount ?? 0}`):'Guest'}</strong></div><div><small>Completed sales</small><strong>{customer?(summary.error?'—':cash(summary.data?.completedTotal || 0)):'—'}</strong></div></div><p className={s.muted}>Order context</p><div className={s.tags}><span>{source}</span><span>{fulfillment}</span><Badge value={order.status}/></div></div></div>
 </div></section>
 <section className={s.card}><Heading icon={<ShoppingCart/>} title="Items Purchased" text={`${items.length} item lines · ${items.reduce((n,i)=>n+numeric(i.quantity),0)} units originally ordered`}/>
 <div className={s.itemsLayout}><div className={s.tableWrap}><table className={s.table}><thead><tr><th>Product</th><th>SKU</th><th>Variant</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{items.map(i=>{const p=one(i.products);return <tr key={i.id}><td><div className={s.product}>{p?.image_url?<img src={p.image_url} alt={i.product_name || p.name}/>:<Package size={26}/>}<div><strong>{i.product_name || p?.name || 'Product'}</strong>{i.selected_options?.length? <small>{i.selected_options.map(o=>o.name).filter(Boolean).join(', ')}</small>:null}{(qtyMap.get(i.id)||0)>0 && <small>Returned: {qtyMap.get(i.id)}</small>}</div></div></td><td>{p?.sku || '—'}</td><td>{i.variant_label || '—'}</td><td>{numeric(i.quantity)}</td><td>{cash(i.unit_price)}</td><td><strong>{cash(i.subtotal)}</strong></td></tr>;})}</tbody></table>{!items.length && <p className={s.muted}>No recorded items.</p>}
 {returns.error && <p role="alert" className={s.warning}>Return history could not be checked. Return actions are unavailable until it reloads.</p>}
 <p className={s.muted}>Order-level discounts are shown in the totals. They are not invented as separate line discounts.</p>
 </div><aside className={s.totals}><Total label="Subtotal" value={cash(order.subtotal)}/><Total label="Discount" value={`−${cash(order.discount)}`}/><Total label="Tax included at checkout" value={cash(original?.taxAmount || 0)}/><Total label="Shipping fee" value={cash(order.delivery_fee)}/><hr/><Total label="Amount recorded received" value={cash(order.amount_paid)}/><Total label="Change recorded" value={cash(order.change_amount)}/><Total label="Balance due" value={cash(order.remaining_balance)}/><div className={s.grand}><span>Order total</span><strong>{cash(order.total)}</strong></div><ReceiptViewer receipt={receipt} context={context} printHref={receiptHref} label={original?'Open original receipt':'View receipt'}/>{hasReturns && <p className={s.muted}>Return records are separate. The original POS receipt retains the initial sale amounts.</p>}</aside></div>
 </section>
 <section className={s.twoColumns}><div className={s.card}><Heading icon={<Clock/>} title="Payment & Timeline" text="Recorded events and payment information"/>
 <div className={s.paymentSummary}><CreditCard size={18}/><span>{paymentStatus} · Received {cash(order.amount_paid)} · Balance {cash(order.remaining_balance)}</span></div>
 {activity.error && <p role="alert" className={s.warning}>Activity history is unavailable. No payment or completion events have been assumed.</p>}
 <ol className={s.timeline}>{events.map((e:{id:string;label:string;date:string})=><li key={e.id}><span className={s.dot}/><div><strong>{e.label}</strong><small>{formatDate(e.date)}</small></div></li>)}</ol>
 </div><div className={s.card}><Heading icon={<ReceiptText/>} title="Receipt" text="Preview and print the recorded receipt"/><div className={s.receiptBox}><div className={s.receiptMini} aria-label="Receipt preview"><PosReceipt receipt={receipt} context={context}/></div><div><h3>{original?'Original receipt':'Order receipt'}</h3><p>{original?'View or print the original POS sale amounts. Later changes remain in order history.':'View the current order record. No original POS snapshot exists for this order.'}</p><ReceiptViewer receipt={receipt} context={context} printHref={receiptHref}/></div></div></div></section>
 </main>;
}
function Badge({value}:{value:string}){return <span className={s.badge} data-status={value}>{titleCase(value)}</span>;}
function Heading({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <div className={s.heading}><span>{icon}</span><div><h2>{title}</h2><p>{text}</p></div></div>;}
function Field({label,value}:{label:string;value:ReactNode}){return <div className={s.field}><span>{label}</span><div>{value}</div></div>;}
function Metric({icon,label,children}:{icon:ReactNode;label:string;children:ReactNode}){return <div className={s.metric}><span className={s.metricIcon}>{icon}</span><div><small>{label}</small><div className={s.metricValue}>{children}</div></div></div>;}
function Total({label,value}:{label:string;value:string}){return <div className={s.totalRow}><span>{label}</span><strong>{value}</strong></div>;}
