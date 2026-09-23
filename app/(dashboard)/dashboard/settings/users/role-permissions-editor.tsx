'use client';
import { useEffect, useState } from 'react';
import { RotateCcw, LockKeyhole, ShieldCheck, Search, Info, Settings, ShoppingCart, Users, Box, ReceiptText, UserRound, Truck, ChartNoAxesColumnIncreasing, ChevronRight, X } from 'lucide-react';
import { editablePermissionRoles,permissionGroups,permissionLabels,permissionDescriptions,rolePermissions,normalizePermissionSelection,removePermissionWithDependents,type EditablePermissionRole,type Permission } from '@/lib/auth/permissions';
import type { BusinessRole } from '@/lib/business/types';
import { TEAM_ROLE_LABELS,type TeamRow } from '@/lib/users/team-model';
import { resetRolePermissions,saveRolePermissions } from './users-workspace-actions';
import { loadMemberPermissions,saveMemberPermissions } from './member-permission-actions';

type Snapshot=Awaited<ReturnType<typeof loadMemberPermissions>>;
const groupIcons = [Settings, ShoppingCart, Users, Box, ReceiptText, UserRound, Truck, ChartNoAxesColumnIncreasing];
type Props={businessId:string;actorRole:BusinessRole;matrix:Record<BusinessRole,Permission[]>;users:TeamRow[];onChange:(role:EditablePermissionRole,permissions:Permission[])=>void;onMemberChange:(memberId:string,revision:number)=>void};
export default function RolePermissionsEditor({businessId,actorRole,matrix,users,onChange,onMemberChange}:Props){
 const first=users.find(u=>u.role!=='owner')??users[0];
 const [mode,setMode]=useState<'user'|'role'>(actorRole==='owner'&&first?'user':'role');
 const [memberId,setMemberId]=useState(first?.id??'');
 const [role,setRole]=useState<EditablePermissionRole>('manager');
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [selected,setSelected]=useState<Permission[]>(matrix.manager??rolePermissions.manager);
 const [busy,setBusy]=useState(actorRole==='owner'&&Boolean(first));
 const [message,setMessage]=useState('');const [error,setError]=useState(false);const [search,setSearch]=useState('');
 const [expanded,setExpanded]=useState<Permission|null>(null);
 const member=users.find(u=>u.id===memberId);
 const editable=actorRole==='owner'&&(mode==='role'||snapshot?.role!=='owner'&&Boolean(snapshot));
 const saved=mode==='role'?matrix[role]??rolePermissions[role]:snapshot?.selected??[];
 const dirty=selected.length!==saved.length||selected.some(p=>!saved.includes(p));

 useEffect(()=>{
  if(mode!=='user'||!memberId)return;
  let current=true;
  void loadMemberPermissions(businessId,memberId).then(next=>{if(current){setSnapshot(next);setSelected(next.selected);setBusy(false);}}).catch(e=>{if(current){setSnapshot(null);setError(true);setMessage(e instanceof Error?e.message:'Unable to load permissions.');setBusy(false);}});
  return()=>{current=false;};
 },[businessId,memberId,mode]);
 function canSwitch(){return !dirty||window.confirm('Discard unsaved permission changes?');}
 function switchMode(next:'user'|'role'){
  if(next===mode||!canSwitch())return;
  setMode(next);setMessage('');setSnapshot(null);setBusy(next==='user');
  setSelected(next==='role'?matrix[role]??rolePermissions[role]:[]);
 }
 function toggle(p:Permission){if(!editable||busy)return;setSelected(current=>current.includes(p)?removePermissionWithDependents(current,p):normalizePermissionSelection([...current,p]));setMessage('');}
 async function persist(reset=false){
  if(!editable||busy)return;
  if(reset&&!window.confirm(mode==='user'?'Restore this user’s role defaults?':'Reset this role to TENH defaults?'))return;
  setBusy(true);setMessage('');setError(false);
  try{
   if(mode==='user'){
    if(!snapshot)throw new Error('Reload this user’s permissions.');
    const next=await saveMemberPermissions(businessId,memberId,snapshot.revision,reset?null:selected);
    setSnapshot(next);setSelected(next.selected);onMemberChange(memberId,next.revision);
   }else{
    const result=reset?await resetRolePermissions(businessId,role):await saveRolePermissions(businessId,role,selected);
    if(!result.success)throw new Error(result.message);
    setSelected(result.data.permissions);onChange(role,result.data.permissions);
   }
   setMessage(reset?'Defaults restored.':'Permissions saved. New requests use the updated access.');
  }catch(e){setError(true);setMessage(e instanceof Error?e.message:'Unable to save permissions.');}finally{setBusy(false);}
 }
 return <div className="space-y-4">
  <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200"><Info size={25} className="shrink-0 text-blue-600"/><div><p className="text-sm font-semibold">Some permissions are protected by the system.</p><p className="mt-1 text-xs leading-5">Owner-only actions and branch limits stay protected. <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">Default</span> marks access included in the role. Required access is added automatically.</p></div></div>
  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Permission scope">{actorRole==='owner'&&users.length>0&&<button type="button" role="tab" aria-selected={mode==='user'} disabled={busy} onClick={()=>switchMode('user')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode==='user'?'bg-blue-600 text-white':'bg-slate-100 text-slate-600'}`}>Per user</button>}<button type="button" role="tab" aria-selected={mode==='role'} disabled={busy} onClick={()=>switchMode('role')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode==='role'?'bg-blue-600 text-white':'bg-slate-100 text-slate-600'}`}>Role defaults</button></div>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="text-xs font-semibold text-slate-500">User / Role{mode==='user'?<select aria-label="User permissions" value={memberId} disabled={busy} onChange={e=>{if(!canSwitch())return;setMemberId(e.target.value);setBusy(true);setSnapshot(null);setSelected([]);setMessage('');}} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 dark:text-slate-100 dark:border-slate-700">{users.map(u=><option key={u.id} value={u.id}>{u.name} · {TEAM_ROLE_LABELS[u.role]}</option>)}</select>:<select aria-label="Role defaults" value={role} disabled={busy} onChange={e=>{if(!canSwitch())return;const next=e.target.value as EditablePermissionRole;setRole(next);setSelected(matrix[next]??rolePermissions[next]);setMessage('');}} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 dark:text-slate-100 dark:border-slate-700">{editablePermissionRoles.map(r=><option key={r} value={r}>{TEAM_ROLE_LABELS[r]}</option>)}</select>}</label>
   <label className="text-xs font-semibold text-slate-500">Search permissions<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3.5 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search permissions…" className="w-full rounded-xl border border-slate-200 py-3 pl-9 pr-3 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"/></div></label>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="text-slate-500">{mode==='user'?`${member?.name??'User'} · ${snapshot?TEAM_ROLE_LABELS[snapshot.role]:''} · ${snapshot?.custom?'Custom access':'Role default'}`:'Applies to users inheriting this role.'}</p><span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{busy?'Loading…':`${selected.length} enabled${dirty?' · Unsaved':''}`}</span></div>
  {mode==='user'&&snapshot?.role==='owner'&&<p className="text-sm text-slate-500">Owner always has full access.</p>}
  <div className="grid gap-3 md:grid-cols-2">{permissionGroups.map((group,index)=>{
   const Icon=groupIcons[index]??ShieldCheck;
   const visible=group.permissions.filter(p=>`${group.label} ${permissionLabels[p]}`.toLowerCase().includes(search.toLowerCase()));
   if(!visible.length)return null;
   return <section key={group.label} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"><h3 className="flex items-center gap-3 bg-slate-50 px-4 py-3 text-sm font-semibold dark:bg-slate-800"><Icon size={22} className="shrink-0 text-blue-600"/>{group.label}<span className="ml-auto text-xs font-normal text-slate-500">{group.permissions.filter(p=>selected.includes(p)).length}/{group.permissions.length}</span></h3><div className="px-4 pb-2">{visible.map(p=><div key={p} className="border-b border-slate-100 last:border-0 dark:border-slate-800"><div className="flex min-h-9 items-center gap-2"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 text-xs"><input type="checkbox" checked={selected.includes(p)} disabled={!editable||busy} onChange={()=>toggle(p)} className="h-4 w-4 shrink-0 accent-blue-600"/><span>{permissionLabels[p]}</span></label>{(mode==='user'?snapshot?.baseline:rolePermissions[role])?.includes(p)&&<span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">Default</span>}<button type="button" aria-label={`About ${permissionLabels[p]}`} aria-expanded={expanded===p} aria-controls={`permission-${p}`} onClick={()=>setExpanded(expanded===p?null:p)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><ChevronRight size={15} className={expanded===p?'rotate-90':''}/></button></div>{expanded===p&&<p id={`permission-${p}`} className="pb-2 pl-7 text-xs text-slate-500">{permissionDescriptions[p]}</p>}</div>)}</div></section>;
  })}</div>
  {message&&<div role={error?'alert':'status'} className={`fixed right-4 top-4 z-[10001] flex w-[min(420px,calc(100vw-2rem))] items-start gap-3 rounded-xl border p-4 text-sm shadow-xl ${error?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><span className="flex-1">{message}</span><button type="button" aria-label="Dismiss status" onClick={()=>setMessage('')}><X size={16}/></button></div>}
  <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white py-4 dark:border-slate-700"><p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={16}/>Required access is included automatically.</p><div className="flex gap-2"><button type="button" disabled={!editable||busy} onClick={()=>void persist(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold disabled:opacity-40"><RotateCcw size={15}/>{mode==='user'?'Use role default':'Reset role'}</button><button type="button" disabled={!editable||busy||!dirty} onClick={()=>void persist()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><LockKeyhole size={16}/>{busy?'Saving…':'Save changes'}</button></div></footer>
 </div>;
}
