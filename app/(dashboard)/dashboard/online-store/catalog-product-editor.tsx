'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { saveOnlineCatalogProduct } from './catalog-actions';

export default function CatalogProductEditor({ product, disabled, icon = false }: { product: { id: string; name: string; selling_price: number }; disabled: boolean; icon?: boolean }) {
 const dialog=useRef<HTMLDialogElement>(null);const [pending,start]=useTransition();const router=useRouter();
 const [name,setName]=useState(product.name);const [price,setPrice]=useState(String(product.selling_price));
 return <><button type="button" disabled={disabled || pending} aria-label={`Edit online ${product.name}`} className="text-left font-semibold disabled:opacity-50" onClick={()=>{setName(product.name);setPrice(String(product.selling_price));dialog.current?.showModal();}}>{icon?<Pencil size={14}/>:product.name}</button>
 <dialog ref={dialog} className="m-auto w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/40" aria-labelledby={`online-edit-${product.id}`} onCancel={e=>{if(pending)e.preventDefault();}}>
 <form onSubmit={e=>{e.preventDefault();start(async()=>{try{const result=await saveOnlineCatalogProduct(product.id,name,price,{name:product.name,price:product.selling_price});if(!result.success){toast.error(result.message);return;}toast.success(result.message);dialog.current?.close();router.refresh();}catch{toast.error('Unable to save online product. Please retry.');}});}} className="space-y-4">
 <h3 id={`online-edit-${product.id}`} className="text-lg font-bold">Online product</h3><p className="text-sm text-slate-500">Shared online name and price. Branch POS prices are managed in Products.</p>
 <label className="block text-sm">Name<input required maxLength={160} value={name} disabled={pending} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
 <label className="block text-sm">Online price<input required type="number" min="0" max="99999999.99" step="0.01" value={price} disabled={pending} onChange={e=>setPrice(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
 <div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={()=>dialog.current?.close()}>Cancel</button><button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-white">{pending?'Saving…':'Save'}</button></div>
 </form></dialog></>;
}
