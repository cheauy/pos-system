 'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MoreHorizontal, ChevronDown } from 'lucide-react';
import { Modal } from '../../pos/pos-workspace-components';
import { changeOrderWorkspaceStatus, deleteOrderWorkspaceOrder, saveOrderWorkspaceDetails } from '../order-workspace-actions';
import s from './order-detail.module.css';
export function CopyOrderNumber({value}:{value:string}){const[done,setDone]=useState(false);const[error,setError]=useState('');return <><button type="button" className={s.copy} aria-label="Copy order number" onClick={async()=>{try{await navigator.clipboard.writeText(value);setDone(true);setTimeout(()=>setDone(false),1500);}catch{setError('Copy unavailable. Select the order number to copy it.');}}}><Copy size={15}/>{done?'Copied':''}</button>{error && <small role="status">{error}</small>}</>;}
export function OrderMoreActions(p:{id:string;number:string;businessId:string;updatedAt:string|null;status:string;source:string;onlineStatus:string|null;canEdit:boolean;canDelete:boolean;note:string}) {
 const router=useRouter();const menu=useRef<HTMLDetailsElement>(null);const[mode,setMode]=useState<null|'edit'|'status'|'delete'>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[note,setNote]=useState(p.note);const[reason,setReason]=useState('');const[confirm,setConfirm]=useState('');const[target,setTarget]=useState('');
 const online=['online','qr'].includes(p.source);const next:Record<string,string>={new:'accepted',accepted:'preparing',preparing:'ready',ready:'completed'};
 const options=['completed','cancelled','refunded'].includes(p.status)?[]:online?[next[p.onlineStatus || 'new']].filter(Boolean):p.status==='new'?['pending','completed']:['completed'];
 function open(which:'edit'|'status'|'delete'){if(menu.current)menu.current.open=false;setError('');setMode(which);setTarget(options[0] || '');}
 async function save(){setBusy(true);setError('');try{
 const result=mode==='edit'?await saveOrderWorkspaceDetails(p.id,p.updatedAt,{note},p.businessId):mode==='status'?await changeOrderWorkspaceStatus(p.id,p.updatedAt,target,'',p.businessId):await deleteOrderWorkspaceOrder(p.id,p.updatedAt,reason,p.businessId);
 if(!result.success){setError(result.message);return;}
 if(mode==='delete'){router.replace('/dashboard/orders');}else{setMode(null);router.refresh();}
 }catch{setError('The result could not be confirmed. Refresh this order before trying again.');}finally{setBusy(false);}}
 return <><details className={s.more} ref={menu}><summary><MoreHorizontal size={17}/>More<ChevronDown size={14}/></summary><div className={s.moreMenu}><button onClick={()=>{router.refresh();if(menu.current)menu.current.open=false;}}>Refresh order</button>{p.canEdit && <button onClick={()=>open('edit')}>Edit order note</button>}{p.canEdit && options.length>0 && <button onClick={()=>open('status')}>Change status</button>}{p.canDelete && <button onClick={()=>open('delete')}>Delete unpaid order</button>}</div></details>
 {mode && <Modal title={mode==='edit'?'Edit order note':mode==='status'?'Change order status':'Delete unpaid order'} locked={busy} onClose={()=>setMode(null)}>
 <div className={s.actionForm}>{error && <p role="alert">{error}</p>}{mode==='edit'?<label>Order note<textarea maxLength={1000} rows={4} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>:mode==='status'?<><label>Next status<select value={target} onChange={e=>setTarget(e.target.value)} disabled={busy}>{options.map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select></label><p>Changing fulfillment status does not collect a payment. Recorded payment status stays separate.</p></>:<><p>Only eligible unpaid orders can be removed from the list. Transaction history is retained.</p><label>Reason<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><label>Type {p.number} to confirm<input value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label></>}
 <button className={s.primary} disabled={busy || (mode==='delete' && (!reason.trim() || confirm!==p.number)) || (mode==='status' && !target)} onClick={()=>void save()}>{busy?'Saving…':mode==='delete'?'Confirm delete':'Save changes'}</button></div>
 </Modal>}</>;
}
