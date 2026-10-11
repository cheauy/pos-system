 'use client';
import { useLanguage } from "@/components/providers/language-provider";
import { formatUiText } from "@/lib/i18n/translations";
import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MoreHorizontal, ChevronDown, CircleCheck, Timer, CheckCheck, Ban } from 'lucide-react';
import { Modal } from '../../pos/pos-workspace-components';
import { cancelOrderWorkspaceItem, changeOrderWorkspaceStatus, saveOrderWorkspaceDetails } from '../order-workspace-actions';
import s from './order-detail.module.css';
export function CopyOrderNumber({value}:{value:string}){const[done,setDone]=useState(false);const[error,setError]=useState('');return <><button type="button" className={s.copy} aria-label="Copy order number" onClick={async()=>{try{await navigator.clipboard.writeText(value);setDone(true);setTimeout(()=>setDone(false),1500);}catch{setError('Copy unavailable. Select the order number to copy it.');}}}><Copy size={15}/>{done?'Copied':''}</button>{error && <small role="status">{error}</small>}</>;}
export function OrderMoreActions(p:{id:string;businessId:string;updatedAt:string|null;canEdit:boolean;note:string}) {
 const router=useRouter();const menu=useRef<HTMLDetailsElement>(null);const[editing,setEditing]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[note,setNote]=useState(p.note);
 async function save(){setBusy(true);setError('');try{
 const result=await saveOrderWorkspaceDetails(p.id,p.updatedAt,{note},p.businessId);
 if(!result.success){setError(result.message);return;}
 setEditing(false);router.refresh();
 }catch{setError('The result could not be confirmed. Refresh this order before trying again.');}finally{setBusy(false);}}
 if(!p.canEdit)return null;
 return <><details className={s.more} ref={menu}><summary><MoreHorizontal size={17}/>More<ChevronDown size={14}/></summary><div className={s.moreMenu}><button onClick={()=>{if(menu.current)menu.current.open=false;setError('');setEditing(true);}}>Edit order note</button></div></details>
 {editing && <Modal title="Edit order note" locked={busy} onClose={()=>setEditing(false)}>
 <div className={s.actionForm}>{error && <p role="alert">{error}</p>}<label>Order note<textarea maxLength={1000} rows={4} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
 <button className={s.primary} disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save changes'}</button></div>
 </Modal>}</>;
}

const STATUS_COPY: Record<string, [string, string]> = {
  new: ['New order', 'Waiting to be confirmed.'],
  pending: ['Confirmed', 'Confirmed and ready to start.'],
  in_progress: ['In Progress', 'This order is being prepared.'],
  completed: ['Completed', 'This order is complete.'],
  cancelled: ['Cancelled', 'This order was cancelled. Stock was restored.'],
  refunded: ['Returned', 'Items from this order were returned and refunded.'],
};

/** Current status with the next step, shown as the banner on the order page. */
export function OrderProgressBanner(p:{id:string;updatedAt:string|null;businessId:string;status:string;source:string;onlineStatus:string|null;fulfillment:string;canAdvance:boolean}) {
 const router=useRouter();const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 const online=['online','qr'].includes(p.source);
 const next=online?({new:['accepted','Confirm order'],accepted:['preparing','Start preparing'],preparing:['completed','Mark as complete'],ready:['completed','Mark as complete']} as Record<string,string[]>)[p.onlineStatus||'new']
   :({new:['pending','Confirm order'],pending:['in_progress','Start preparing'],in_progress:['completed','Mark as complete']} as Record<string,string[]>)[p.status];
 const [title,base]=STATUS_COPY[p.status] ?? [p.status,''];
 const delivery=p.fulfillment==='Delivery'?'for delivery':p.fulfillment==='Pickup'?'for pickup':'';
 const text=p.status==='in_progress'&&delivery?`This order is being prepared ${delivery}.`:base;
 const done=['completed','cancelled','refunded'].includes(p.status);
 const Icon=p.status==='completed'?CheckCheck:p.status==='cancelled'?Ban:p.status==='in_progress'?Timer:CircleCheck;
 return <section className={s.banner} data-status={p.status}>
  <span className={s.bannerIcon}><Icon size={24}/></span>
  <div><strong>{title}</strong><p>{text}</p>{error&&<p role="alert" className={s.bannerError}>{error}</p>}</div>
  {p.canAdvance && next && !done && <button type="button" className={s.bannerButton} disabled={busy||!p.updatedAt} onClick={async()=>{setBusy(true);setError('');try{const result=await changeOrderWorkspaceStatus(p.id,p.updatedAt,next[0],'',p.businessId);if(!result.success)setError(result.message);else router.refresh();}catch{setError('Check the current order before trying again.');}finally{setBusy(false);}}}>{busy?'Updating…':next[1]}</button>}
 </section>;
}

export function CancelOrderItem(p:{orderId:string;itemId:string;name:string;updatedAt:string|null;businessId:string;onCancelled?:()=>void;onDiscardRequest?:(discard:()=>void)=>void;modal?:ComponentType<{title:string;locked:boolean;onClose:()=>void;children:ReactNode}>}) {
  const { t: translateLabel } = useLanguage();

 const Dialog=p.modal??Modal;
 const router=useRouter();const[open,setOpen]=useState(false);const[reason,setReason]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 return <><button type="button" className={s.cancelItem} onClick={()=>{setError('');setOpen(true);}}><Ban size={13}/>Cancel Item</button>{open&&<Dialog title={formatUiText(translateLabel("Cancel {0}"), [p.name])} locked={busy} onClose={()=>{if(busy)return;if(p.onDiscardRequest&&reason)p.onDiscardRequest(()=>setOpen(false));else setOpen(false);}} data-i18n-ignore-attributes="title"><div className={s.actionForm}><p>Stock will be restored. Paid or discounted items use the return/refund action.</p>{error&&<p role="alert">{error}</p>}<label>Reason<textarea required maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><button className={s.primary} type="button" disabled={busy||!reason.trim()||!p.updatedAt} onClick={async()=>{setBusy(true);setError('');try{const result=await cancelOrderWorkspaceItem(p.orderId,p.itemId,p.updatedAt,reason,p.businessId);if(!result.success)setError(result.message);else{setOpen(false);p.onCancelled?.();router.refresh();}}catch{setError('The result could not be confirmed. Refresh this order before retrying.');}finally{setBusy(false);}}}>{busy?'Cancelling…':'Cancel Item'}</button></div></Dialog>}</>;
}
