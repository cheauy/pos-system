 'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MoreHorizontal, ChevronDown, CircleCheck, Timer, CheckCheck, Ban } from 'lucide-react';
import { Modal } from '../../pos/pos-workspace-components';
import { cancelOrderWorkspaceItem, changeOrderWorkspaceStatus, deleteOrderWorkspaceOrder, saveOrderWorkspaceDetails } from '../order-workspace-actions';
import s from './order-detail.module.css';
export function CopyOrderNumber({value}:{value:string}){const[done,setDone]=useState(false);const[error,setError]=useState('');return <><button type="button" className={s.copy} aria-label="Copy order number" onClick={async()=>{try{await navigator.clipboard.writeText(value);setDone(true);setTimeout(()=>setDone(false),1500);}catch{setError('Copy unavailable. Select the order number to copy it.');}}}><Copy size={15}/>{done?'Copied':''}</button>{error && <small role="status">{error}</small>}</>;}
export function OrderMoreActions(p:{id:string;number:string;businessId:string;updatedAt:string|null;status:string;source:string;onlineStatus:string|null;canEdit:boolean;canDelete:boolean;note:string}) {
 const router=useRouter();const menu=useRef<HTMLDetailsElement>(null);const[mode,setMode]=useState<null|'edit'|'delete'>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[note,setNote]=useState(p.note);const[reason,setReason]=useState('');const[confirm,setConfirm]=useState('');
 function open(which:'edit'|'delete'){if(menu.current)menu.current.open=false;setError('');setMode(which);}
 async function save(){setBusy(true);setError('');try{
 const result=mode==='edit'?await saveOrderWorkspaceDetails(p.id,p.updatedAt,{note},p.businessId):await deleteOrderWorkspaceOrder(p.id,p.updatedAt,reason,p.businessId);
 if(!result.success){setError(result.message);return;}
 if(mode==='delete'){router.replace('/dashboard/orders');}else{setMode(null);router.refresh();}
 }catch{setError('The result could not be confirmed. Refresh this order before trying again.');}finally{setBusy(false);}}
 return <><details className={s.more} ref={menu}><summary><MoreHorizontal size={17}/>More<ChevronDown size={14}/></summary><div className={s.moreMenu}><button onClick={()=>{router.refresh();if(menu.current)menu.current.open=false;}}>Refresh order</button>{p.canEdit && <button onClick={()=>open('edit')}>Edit order note</button>}{p.canDelete && <button onClick={()=>open('delete')}>Delete unpaid order</button>}</div></details>
 {mode && <Modal title={mode==='edit'?'Edit order note':'Delete unpaid order'} locked={busy} onClose={()=>setMode(null)}>
 <div className={s.actionForm}>{error && <p role="alert">{error}</p>}{mode==='edit'?<label>Order note<textarea maxLength={1000} rows={4} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>:<><p>Only eligible unpaid orders can be removed from the list. Transaction history is retained.</p><label>Reason<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><label>Type {p.number} to confirm<input value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label></>}
 <button className={s.primary} disabled={busy || (mode==='delete' && (!reason.trim() || confirm!==p.number))} onClick={()=>void save()}>{busy?'Saving…':mode==='delete'?'Confirm delete':'Save changes'}</button></div>
 </Modal>}</>;
}

export function OrderAdvanceStatus(p:{id:string;updatedAt:string|null;businessId:string;status:string;source:string;onlineStatus:string|null}) {
 const router=useRouter();const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 const online=['online','qr'].includes(p.source);
 const next=online?({new:['accepted','Confirmed'],accepted:['preparing','In Progress'],preparing:['completed','Complete'],ready:['completed','Complete']} as Record<string,string[]>)[p.onlineStatus||'new']
   :({new:['pending','Confirmed'],pending:['in_progress','In Progress'],in_progress:['completed','Complete']} as Record<string,string[]>)[p.status];
 if(!next||['completed','cancelled','refunded'].includes(p.status))return null;
 const Icon=next[0]==='completed'?CheckCheck:next[0]==='in_progress'||next[0]==='preparing'?Timer:CircleCheck;
 return <div className={s.progressWrap}><button className={s.progressButton} type="button" disabled={busy||!p.updatedAt} onClick={async()=>{setBusy(true);setError('');try{const result=await changeOrderWorkspaceStatus(p.id,p.updatedAt,next[0],'',p.businessId);if(!result.success)setError(result.message);else router.refresh();}catch{setError('Check the current order before trying again.');}finally{setBusy(false);}}}><Icon size={19}/>{busy?'Updating…':next[1]}</button>{error&&<p role="alert">{error}</p>}</div>;
}

export function CancelOrderItem(p:{orderId:string;itemId:string;name:string;updatedAt:string|null;businessId:string;onCancelled?:()=>void}) {
 const router=useRouter();const[open,setOpen]=useState(false);const[reason,setReason]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 return <><button type="button" className={s.cancelItem} onClick={()=>{setError('');setOpen(true);}}><Ban size={13}/>Cancel Item</button>{open&&<Modal title={`Cancel ${p.name}`} locked={busy} onClose={()=>setOpen(false)}><div className={s.actionForm}><p>Stock will be restored. Paid or discounted items use the return/refund action.</p>{error&&<p role="alert">{error}</p>}<label>Reason<textarea required maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><button className={s.primary} type="button" disabled={busy||!reason.trim()||!p.updatedAt} onClick={async()=>{setBusy(true);setError('');try{const result=await cancelOrderWorkspaceItem(p.orderId,p.itemId,p.updatedAt,reason,p.businessId);if(!result.success)setError(result.message);else{setOpen(false);p.onCancelled?.();router.refresh();}}catch{setError('The result could not be confirmed. Refresh this order before retrying.');}finally{setBusy(false);}}}>{busy?'Cancelling…':'Cancel Item'}</button></div></Modal>}</>;
}
