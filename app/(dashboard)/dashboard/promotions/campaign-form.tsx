'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCoupon } from './actions';
export default function CampaignForm({branchId,products}:{branchId:string;products:{id:string;name:string}[]}){
 const router=useRouter();const [kind,setKind]=useState('automatic'),[target,setTarget]=useState('selected'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const input='mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm';
 return <form className="mt-4 space-y-3" onSubmit={async event=>{event.preventDefault();const form=event.currentTarget;setBusy(true);setMessage('');try{await createCoupon(new FormData(form));setMessage('Campaign saved.');form.reset();router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Could not save campaign.');}finally{setBusy(false);}}}>
 <input type="hidden" name="branchId" value={branchId}/>
 <fieldset disabled={busy} className="space-y-3">
 <label className="block text-sm">Type<select name="campaignType" className={input} value={kind} onChange={e=>setKind(e.target.value)}><option value="automatic">Automatic product discount</option><option value="coupon">Coupon code</option></select></label>
 <label className="block text-sm">Name<input name="name" required maxLength={120} className={input} placeholder="Weekend sale"/></label>
 {kind==='coupon'&&<label className="block text-sm">Coupon code<input name="code" required minLength={3} maxLength={30} className={input} placeholder="SAVE10"/></label>}
 <div className="grid grid-cols-2 gap-2"><label className="text-sm">Discount<select name="discountType" className={input}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label className="text-sm">Value<input name="discountValue" required type="number" min="0.01" step="0.01" className={input}/></label></div>
 <fieldset className="space-y-2"><legend className="text-sm font-semibold">Apply to</legend><label className="mr-4 text-sm"><input type="checkbox" name="applyPos" defaultChecked/> POS</label><label className="text-sm"><input type="checkbox" name="applyOnline" defaultChecked/> Online store</label></fieldset>
 <label className="block text-sm">Products<select name="target" className={input} value={target} onChange={e=>setTarget(e.target.value)}><option value="selected">Selected products / variants</option><option value="all">All products</option></select></label>
 {target==='selected'&&<label className="block text-sm">Select products<select name="productIds" multiple required className={`${input} min-h-36`}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Use Ctrl or Command to select multiple products.</small></label>}
 {kind==='coupon'&&<div className="grid grid-cols-2 gap-2">{[['minimumOrder','Minimum order'],['maxDiscount','Maximum discount'],['usageLimit','Usage limit'],['perCustomerLimit','Per customer limit']].map(([name,label])=><label key={name} className="text-sm">{label}<input name={name} type="number" min={name==='minimumOrder'?0:1} step={name.includes('Limit')?1:0.01} className={input}/></label>)}</div>}
 <div className="grid grid-cols-2 gap-2"><label className="text-sm">Starts<input type="datetime-local" name="startsAt" className={input}/></label><label className="text-sm">Ends<input type="datetime-local" name="endsAt" className={input}/></label></div>
 <label className="block text-sm"><input name="isActive" type="checkbox" defaultChecked/> Enable campaign</label>
 <p className="text-xs text-slate-500">The best automatic discount applies to each product. Coupon codes apply after product discounts. Online automatic discounts apply across the shared storefront; POS discounts apply to this branch.</p>
 <button className="w-full rounded-xl bg-blue-600 p-3 text-sm font-semibold text-white" type="submit">{busy?'Saving…':'Save campaign'}</button>
 </fieldset>{message&&<p role="status" className="text-sm">{message}</p>}
 </form>;
}
