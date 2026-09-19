'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Package, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { createPosCustomer, fetchPosCustomers } from './pos-customer-actions';
import { customerInputIssue, mergeCustomerPage } from './pos-customer-helpers';
import type { CustomerFieldFlags, CustomerInput, PickerCustomer } from './pos-customer-helpers';
import type { ShippingMethod } from './pos-workspace-types';
import s from './pos-workspace.module.css';

function newCustomerId(): string {
  if (typeof crypto.randomUUID==='function') return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

type Props = {
  businessId:string; userId:string; customerId:string; shippingMethod:ShippingMethod;
  canCreate:boolean; onWalkIn:()=>void; onPickup:()=>void;
  onSelect:(customer:PickerCustomer)=>void; onCreated:(customer:PickerCustomer)=>void;
  onBusyChange:(busy:boolean)=>void;
};

export function PosCustomerPicker(p:Props) {
  const [search,setSearch]=useState('');
  const [rows,setRows]=useState<PickerCustomer[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [hasMore,setHasMore]=useState(false);
  const [offset,setOffset]=useState(0);
  const [refresh,setRefresh]=useState(0);
  const [canCreate,setCanCreate]=useState(p.canCreate);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({name:'',phone:'',address:'',email:'',birthday:''});
  const [fields,setFields]=useState<CustomerFieldFlags|null>(null);
  const [formError,setFormError]=useState('');
  const [saving,setSaving]=useState(false);
  const [pending,setPending]=useState<CustomerInput|null>(null);
  const [success,setSuccess]=useState('');
  const [newId,setNewId]=useState('');
  const serial=useRef(0);
  const fetching=useRef(false);
  const savingRef=useRef(false);
  const searchRef=useRef<HTMLInputElement>(null);
  const key=`tenh-pos:customer-create:${p.businessId}:${p.userId}`;

  // Keep an unresolved save across reopening/reloading. Its UUID makes retry safe.
  useEffect(()=>{
    try {
      const saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(saved && !customerInputIssue(saved)) {setPending(saved);setForm({name:saved.name,phone:saved.phone,address:saved.address,email:saved.email || '',birthday:saved.birthday || ''});setShowForm(true);setFormError('A previous customer save needs confirmation. Retry the same request.');}
    } catch { /* Unavailable storage is handled before any create call. */ }
  },[key]);

  useEffect(()=>{
    const request=++serial.current;
    setLoading(true);setError('');fetching.current=true;
    const timer=setTimeout(()=>{
      void fetchPosCustomers(p.businessId,search,0).then(result=>{
        if(request!==serial.current)return;
        if(!result.success){setError(result.message);setRows([]);setHasMore(false);return;}
        setRows(mergeCustomerPage([],result.data.items));setHasMore(result.data.hasMore);
        setOffset(result.data.nextOffset);setCanCreate(result.data.canCreate);setFields(result.data.fieldSettings || null);
      }).catch(()=>{if(request===serial.current){setError('Could not load customers. Retry to fetch the latest list.');setRows([]);setHasMore(false);}})
        .finally(()=>{if(request===serial.current){setLoading(false);fetching.current=false;}});
    },search?200:0);
    return ()=>{clearTimeout(timer);serial.current++;};
  },[p.businessId,search,refresh,showForm]);

  async function more() {
    if(fetching.current || !hasMore)return;
    const request=serial.current;fetching.current=true;setLoading(true);setError('');
    try {
      const result=await fetchPosCustomers(p.businessId,search,offset);
      if(request!==serial.current)return;
      if(!result.success){setError(result.message);return;}
      setRows(old=>mergeCustomerPage(old,result.data.items));setHasMore(result.data.hasMore);setOffset(result.data.nextOffset);
    } catch {if(request===serial.current)setError('Could not load more customers. Try again.');}
    finally {if(request===serial.current){fetching.current=false;setLoading(false);}}
  }
  function back() {setShowForm(false);setFormError('');requestAnimationFrame(()=>searchRef.current?.focus());}
  async function save() {
    if(savingRef.current)return;
    if(!fields){setFormError('Customer settings are still loading. Please retry.');return;}
    const input=pending || {id:newCustomerId(),name:form.name.trim(),phone:form.phone.trim(),address:form.address.trim(),email:fields.emailEnabled?form.email.trim():'',birthday:fields.birthdayEnabled?form.birthday:''};
    const invalid=customerInputIssue(input,fields);
    if(invalid){setFormError(invalid);return;}
    // Persist before sending so a network failure never creates a second request ID.
    try{sessionStorage.setItem(key,JSON.stringify(input));}catch{setFormError('Enable browser session storage before saving, so a retry cannot create a duplicate.');return;}
    savingRef.current=true;setSaving(true);p.onBusyChange(true);setPending(input);setFormError('');
    try {
      const result=await createPosCustomer(p.businessId,input);
      if(!result.success){
        setFormError(result.message);
        if(!result.uncertain){setPending(null);try{sessionStorage.removeItem(key);}catch{ /* No write committed. */ }}
        return;
      }
      try{sessionStorage.removeItem(key);}catch{ /* Same UUID remains safe on retry. */ }
      setPending(null);setForm({name:'',phone:'',address:'',email:'',birthday:''});setShowForm(false);
      setNewId(result.data.id);setSuccess(`${result.data.name} saved. Select the new customer below to use it for this order.`);
      setRows(old=>mergeCustomerPage(old,[result.data]));setSearch('');setRefresh(n=>n+1);
      p.onCreated(result.data);
      requestAnimationFrame(()=>searchRef.current?.focus());
    } catch {setFormError('The customer save could not be confirmed. Retry the same request, or return to the list to check.');}
    finally {savingRef.current=false;setSaving(false);p.onBusyChange(false);}
  }

  if(showForm)return <div className={s.customerCreateForm}>
    <div className={s.between}><h3>Add customer</h3><button type="button" className={s.textButton} disabled={saving} onClick={back}><ChevronLeft size={15}/>Back to customers</button></div>
    <p className={s.muted}>Saves a customer to this business now. It does not create a sale, record a payment, or change the current cart.</p>
    {pending && <p className={s.paymentInfo}>Retry uses the same saved details to avoid a duplicate customer.</p>}
    {formError && <p role="alert" className={`${s.notice} ${s.error}`}>{formError}</p>}
    <fieldset className={s.customerFormFields} disabled={saving || Boolean(pending)}>
      <label className={s.field}>Customer name *<input autoFocus aria-label="New customer name" autoComplete="off" maxLength={120} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label>
      <label className={s.field}>Phone *<input type="tel" aria-label="New customer phone" autoComplete="off" maxLength={40} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></label>
      <label className={s.field}>Address (optional)<textarea aria-label="New customer address" autoComplete="off" maxLength={500} rows={3} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></label>
      {fields?.emailEnabled && <label className={s.field}>Email (optional)<input type="email" aria-label="New customer email" maxLength={254} autoComplete="off" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></label>}
      {fields?.birthdayEnabled && <label className={s.field}>Birthday (optional)<input type="date" aria-label="New customer birthday" max={new Date().toISOString().slice(0,10)} value={form.birthday} onChange={e=>setForm(f=>({...f,birthday:e.target.value}))}/></label>}
    </fieldset>
    {!fields && <p role="status" className={s.muted}>Loading Customer Settings…</p>}
    {error && <p role="alert" className={s.orangeText}>{error}</p>}
    <div className={s.customerPickerFooter}><span className={s.muted}>Name and phone are required.</span><button type="button" className={s.primary} disabled={saving || !canCreate || !fields || loading} onClick={()=>void save()}>{saving?<RefreshCw size={16} className={s.spin}/>:<Plus size={16}/>} {saving?'Saving…':pending?'Retry same customer':'Save customer'}</button></div>
  </div>;

  return <div className={s.customerPicker}>
    <div className={s.searchInput}><Search size={18}/><input ref={searchRef} autoFocus value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} aria-label="Search customers" placeholder="Search customer name or phone…"/></div>
    {success && <p className={`${s.notice} ${s.success}`} role="status">{success}</p>}
    <div className={s.guestCustomerChoices} aria-label="Guest order options">
      <button type="button" className={`${s.customerResult} ${!p.customerId && p.shippingMethod==='in_store'?s.selectedCustomer:''}`} aria-pressed={!p.customerId && p.shippingMethod==='in_store'} onClick={p.onWalkIn}>
        <UserRound size={20}/><span><strong>Walk-in customer</strong><small>In-store sale · No customer account needed</small></span>{!p.customerId && p.shippingMethod==='in_store' && <Check size={16}/>}
      </button>
      <button type="button" className={`${s.customerResult} ${!p.customerId && p.shippingMethod==='pickup'?s.selectedCustomer:''}`} aria-pressed={!p.customerId && p.shippingMethod==='pickup'} onClick={p.onPickup}>
        <Package size={20}/><span><strong>Pickup</strong><small>Guest pickup · Add recipient details after Continue</small></span>{!p.customerId && p.shippingMethod==='pickup' && <Check size={16}/>}
      </button>
    </div>
    <div className={s.customerListDivider} role="separator" aria-label="Saved customers"/>
    <div className={s.customerListHeading}><span>Saved customers</span><span>Newest first</span></div>
    {error && <div role="alert" className={`${s.notice} ${s.error}`}><span>{error}</span><button type="button" className={s.textButton} onClick={()=>setRefresh(n=>n+1)}>Retry</button></div>}
    <div className={s.customerResults} aria-busy={loading}>
      {loading && offset===0 && !rows.length && <p className={s.customerLoading} role="status"><RefreshCw size={16} className={s.spin}/>Loading customers…</p>}
      {rows.map(c=><button type="button" key={c.id} disabled={loading} className={`${s.customerResult} ${p.customerId===c.id?s.selectedCustomer:''}`} onClick={()=>p.onSelect(c)}>
        <UserRound size={20}/><span><strong>{c.name}{c.id===newId && <em className={s.newCustomerTag}>New</em>}</strong><small>{c.phone || 'No phone number'}{c.address?` · ${c.address}`:''}</small></span>
        <small>{c.loyalty_points || 0} points</small>{p.customerId===c.id && <Check size={16}/>}
      </button>)}
      {!loading && !error && !rows.length && <p className={s.customerEmpty}>{search?'No matching customers. Try a name or phone number.':'No saved customers yet. Add your first customer below.'}</p>}
    </div>
    {hasMore && <button type="button" className={s.button} disabled={loading} onClick={()=>void more()}>{loading?'Loading…':'Load more customers'}</button>}
    <footer className={s.customerPickerFooter}>
      <span className={s.muted}>Only customers from this business are shown.</span>
      <button type="button" className={s.customerAddButton} disabled={!canCreate} title={!canCreate?'Customer creation permission required':undefined} onClick={()=>{setShowForm(true);setFormError('');}}><Plus size={16}/>Add customer</button>
    </footer>
  </div>;
}
