"use client";

import { useEffect, useRef, useState } from 'react';
import ShippingDesigner from './shipping-designer';
import { resizeShippingLayout, type ShippingLayout } from '@/lib/receipts/shipping-layout';
import { SHIPPING_LABEL_SIZES, shippingTemplateName, type NamedShippingTemplate } from '@/lib/receipts/shipping-templates';
import type { ShippingValues } from '@/lib/receipts/shipping-custom';

export type ShippingTemplateDraft={id:string;name:string;layout:ShippingLayout;mode:'create'|'update';original?:NamedShippingTemplate};
export default function ShippingTemplateEditor({initial,values,onSave,onClose}:{initial:ShippingTemplateDraft;values:ShippingValues;onSave:(draft:ShippingTemplateDraft)=>Promise<void>;onClose:()=>void}) {
  const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false),[history,setHistory]=useState<{undo:ShippingTemplateDraft[];redo:ShippingTemplateDraft[]}>({undo:[],redo:[]});
  const dialog=useRef<HTMLDivElement>(null),name=useRef<HTMLInputElement>(null),saving=useRef(false);
  const current=useRef(initial),past=useRef<ShippingTemplateDraft[]>([]),future=useRef<ShippingTemplateDraft[]>([]),lastGroup=useRef<string|undefined>(undefined);
  const publishHistory=()=>setHistory({undo:[...past.current],redo:[...future.current]});
  const updateDraft=(next:ShippingTemplateDraft,group?:string)=>{
    if(saving.current||JSON.stringify(next)===JSON.stringify(current.current))return;
    if(!group||group!==lastGroup.current){past.current.push(current.current);if(past.current.length>50)past.current.shift();}
    lastGroup.current=group;future.current=[];current.current=next;setDraft(next);publishHistory();
  };
  const undo=(forward=false)=>{
    if(saving.current)return;
    const from=forward?future.current:past.current,to=forward?past.current:future.current,next=from.pop();
    if(next){to.push(current.current);current.current=next;lastGroup.current=undefined;setDraft(next);publishHistory();}
  };
  const blockWhileSaving=(event:React.SyntheticEvent)=>{if(saving.current){event.preventDefault();event.stopPropagation();}};
  const dirty=JSON.stringify(draft)!==JSON.stringify(initial);
  const requestClose=()=>{if(saving.current)return;if(dirty)setDiscard(true);else onClose();};
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    const node=dialog.current;
    // React's beforeinput plugin does not cover every native/IME beforeinput event.
    const preventEdit=(event:Event)=>{if(saving.current){event.preventDefault();event.stopPropagation();}};
    node?.addEventListener('beforeinput',preventEdit,true);
    document.body.style.overflow='hidden';name.current?.focus();
    return()=>{node?.removeEventListener('beforeinput',preventEdit,true);document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  async function save(asNew=false){if(saving.current)return;const source=current.current;saving.current=true;setBusy(true);setError('');dialog.current?.focus();try{await onSave(asNew?{...source,id:crypto.randomUUID(),name:shippingTemplateName(`${source.name.slice(0,55)} copy`),mode:'create',original:undefined}:{...source,name:shippingTemplateName(source.name)});}catch(e){setError(e instanceof Error?e.message:'Could not save template.');}finally{saving.current=false;setBusy(false);}}
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:p-5" onPointerDown={event=>{if(event.target===event.currentTarget)requestClose();}}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="shipping-template-editor-title" tabIndex={-1} className="relative flex h-[92dvh] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl"
      onBeforeInputCapture={blockWhileSaving} onInputCapture={blockWhileSaving} onPasteCapture={blockWhileSaving} onCutCapture={blockWhileSaving} onDropCapture={blockWhileSaving}
      onPointerDownCapture={blockWhileSaving} onPointerMoveCapture={blockWhileSaving} onClickCapture={blockWhileSaving}
      onKeyDownCapture={event=>{if(event.key!=='Tab')blockWhileSaving(event);}}
      onKeyDown={event=>{
        if(saving.current&&event.key==='Tab'){event.preventDefault();dialog.current?.focus();return;}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(discard)setDiscard(false);else requestClose();}
        if(event.key==='Tab'){
          const controls=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[contenteditable="true"],a[href],[tabindex="0"]')].filter(node=>node.getClientRects().length);
          const first=controls[0],last=controls[controls.length-1];if(!first){event.preventDefault();dialog.current?.focus();}
          else if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
      }}>
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-slate-200 px-6 py-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 3h14v13l-5 5H5Z"/><path d="M14 21v-5h5M8 8h8M8 12h7"/></svg></span>
        <div className="min-w-0 flex-1"><h2 id="shipping-template-editor-title" className="text-xl font-bold">{draft.mode==='update'?'Edit custom template':'Create custom template'}</h2><p className="mt-1 text-xs text-slate-500">Design your shipping label with custom fields, then save it as a template.</p></div>
        <span role="status" className="flex items-center gap-2 text-[11px] text-slate-500"><span className={`h-2 w-2 rounded-full ${dirty?'bg-green-500':'bg-slate-300'}`}/>{dirty?'Unsaved changes':'No unsaved changes'}</span>
        <button type="button" aria-label="Version history" aria-expanded={historyOpen} disabled={busy} onClick={()=>setHistoryOpen(!historyOpen)} className="border-x border-slate-200 px-4 py-2 text-xs text-blue-600">↶ &nbsp; Version history</button>
        <label className="flex items-center gap-3 text-[11px] text-slate-600">Label size<select aria-label="Custom template label size" disabled={busy} value={draft.layout.size} onChange={event=>updateDraft({...current.current,layout:resizeShippingLayout(current.current.layout,event.target.value,Number(values.qrMinimumMm))})} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800">{SHIPPING_LABEL_SIZES.map(paper=><option key={paper.id} value={paper.id}>{paper.label} (Custom)</option>)}</select></label>
        <button type="button" aria-label="Close template editor" onClick={requestClose} disabled={busy} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-2xl text-slate-600 hover:bg-slate-50">×</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:overflow-hidden">
        {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <fieldset disabled={busy} inert={busy} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ShippingDesigner layout={draft.layout} size={draft.layout.size} values={values} onChange={(layout,group)=>updateDraft({...current.current,layout},group)} onUndo={()=>undo()} onRedo={()=>undo(true)} canUndo={!!history.undo.length} canRedo={!!history.redo.length}/>
        </fieldset>
      </div>
      {discard&&<div role="alert" className="flex flex-wrap items-center gap-2 border-t bg-amber-50 p-3 text-sm"><span className="mr-auto">Discard unsaved edits?</span><button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>setDiscard(false)}>Continue editing</button><button type="button" disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-white" onClick={()=>{if(!saving.current)onClose();}}>Discard changes</button></div>}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4"><label className="mr-auto flex items-center gap-4 text-xs text-slate-600">Template name<input ref={name} aria-label="Template name" disabled={busy} maxLength={60} value={draft.name} onChange={event=>updateDraft({...current.current,name:event.target.value})} placeholder="e.g. Khmer courier label" className="h-10 w-64 max-w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 xl:w-96"/></label><button type="button" disabled={busy} onClick={requestClose} className="h-10 rounded-md border border-slate-300 px-6 text-xs font-medium hover:bg-slate-50">Cancel</button>
        {draft.mode==='update'&&<button type="button" disabled={busy} onClick={()=>void save(true)} className="h-10 rounded-md border border-slate-800 px-5 text-xs font-medium">Save as new</button>}
        <button type="button" disabled={busy} onClick={()=>void save()} className="flex h-10 items-center gap-3 rounded-md bg-blue-600 px-6 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 3h14l3 3v15H3V3Z"/><path d="M7 3v7h10V3M7 21v-7h10v7M14 4v4"/></svg><span>{busy?'Saving…':draft.mode==='update'?'Save changes':'Save template'}</span></button></div>
      {historyOpen&&<div className="absolute right-6 top-20 z-20 max-h-[65vh] w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl" aria-label="Session version history"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Version history</h3><button type="button" aria-label="Close version history" disabled={busy} onClick={()=>setHistoryOpen(false)}>×</button></div><p className="mt-1 text-[11px] text-slate-500">This editing session · up to 50 changes</p><div className="my-3 flex gap-2"><button type="button" disabled={busy||!history.undo.length} onClick={()=>undo()} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Undo</button><button type="button" disabled={busy||!history.redo.length} onClick={()=>undo(true)} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Redo</button></div>{history.undo.map((snapshot,index)=><button key={index} type="button" aria-label={`Restore session version ${index+1}`} disabled={busy} onClick={()=>{updateDraft(snapshot);setHistoryOpen(false);}} className="my-1 block w-full rounded border border-slate-200 p-2 text-left text-xs hover:bg-blue-50"><span className="font-medium">{index===0?'Session start':`Change ${index}`}</span><span className="mt-1 block text-slate-500"><span data-i18n-ignore="true">{snapshot.name}</span> · {snapshot.layout.elements.length} fields · {snapshot.layout.size.replace('x',' × ')} mm</span></button>)}{!history.undo.length&&<p className="text-xs text-slate-500">Edits will appear here.</p>}</div>}
    </div>
  </div>;
}
