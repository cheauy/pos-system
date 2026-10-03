"use client";

import { useEffect, useRef, useState } from 'react';
import ShippingDesigner from './shipping-designer';
import { resizeShippingLayout, type ShippingLayout } from '@/lib/receipts/shipping-layout';
import { SHIPPING_LABEL_SIZES, shippingTemplateName, type NamedShippingTemplate } from '@/lib/receipts/shipping-templates';
import type { ShippingValues } from '@/lib/receipts/shipping-custom';

export type ShippingTemplateDraft={id:string;name:string;layout:ShippingLayout;mode:'create'|'update';original?:NamedShippingTemplate};
export default function ShippingTemplateEditor({initial,values,onSave,onClose}:{initial:ShippingTemplateDraft;values:ShippingValues;onSave:(draft:ShippingTemplateDraft)=>Promise<void>;onClose:()=>void}) {
  const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
  const dialog=useRef<HTMLDivElement>(null),name=useRef<HTMLInputElement>(null),saving=useRef(false);
  const updateDraft=(next:ShippingTemplateDraft)=>{if(!saving.current)setDraft(next);};
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
  async function save(){if(saving.current)return;saving.current=true;setBusy(true);setError('');dialog.current?.focus();try{await onSave({...draft,name:shippingTemplateName(draft.name)});}catch(e){setError(e instanceof Error?e.message:'Could not save template.');}finally{saving.current=false;setBusy(false);}}
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-2 sm:p-5" onPointerDown={event=>{if(event.target===event.currentTarget)requestClose();}}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="shipping-template-editor-title" tabIndex={-1} className="flex max-h-[94dvh] w-full max-w-4xl flex-col rounded-2xl bg-white text-slate-900 shadow-xl"
      onBeforeInputCapture={blockWhileSaving} onInputCapture={blockWhileSaving} onPasteCapture={blockWhileSaving} onCutCapture={blockWhileSaving} onDropCapture={blockWhileSaving}
      onPointerDownCapture={blockWhileSaving} onPointerMoveCapture={blockWhileSaving} onClickCapture={blockWhileSaving}
      onKeyDownCapture={event=>{if(event.key!=='Tab')blockWhileSaving(event);}}
      onKeyDown={event=>{
        if(saving.current&&event.key==='Tab'){event.preventDefault();dialog.current?.focus();return;}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(discard)setDiscard(false);else requestClose();}
        if(event.key==='Tab'){
          const controls=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[contenteditable="true"],a[href]')].filter(node=>node.getClientRects().length);
          const first=controls[0],last=controls[controls.length-1];if(!first){event.preventDefault();dialog.current?.focus();}
          else if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
      }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><h2 id="shipping-template-editor-title" className="text-lg font-bold">{draft.mode==='update'?'Edit custom template':'Custom Template'}</h2><button type="button" aria-label="Close template editor" onClick={requestClose} disabled={busy} className="rounded-lg border px-3 py-2">Close</button></div>
      <div className="min-h-0 overflow-auto p-4">
        {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <fieldset disabled={busy} inert={busy} className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Template name<input ref={name} aria-label="Template name" maxLength={60} value={draft.name} onChange={event=>updateDraft({...draft,name:event.target.value})} placeholder="e.g. Khmer courier label" className="mt-1 w-full rounded-lg border p-2"/></label>
            <label className="text-sm font-semibold">Label size<select aria-label="Custom template label size" value={draft.layout.size} onChange={event=>updateDraft({...draft,layout:resizeShippingLayout(draft.layout,event.target.value,Number(values.qrMinimumMm))})} className="mt-1 w-full rounded-lg border p-2">{SHIPPING_LABEL_SIZES.map(paper=><option key={paper.id} value={paper.id}>{paper.label}</option>)}</select></label></div>
          <p className="text-xs text-slate-500">Add a Custom text field, then select it to use the rich-text toolbar. Order fields are protected placeholders and fill automatically when printed.</p>
          <ShippingDesigner layout={draft.layout} size={draft.layout.size} values={values} onChange={layout=>updateDraft({...draft,layout})}/>
        </fieldset>
      </div>
      {discard&&<div role="alert" className="flex flex-wrap items-center gap-2 border-t bg-amber-50 p-3 text-sm"><span className="mr-auto">Discard unsaved edits?</span><button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>setDiscard(false)}>Continue editing</button><button type="button" disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-white" onClick={()=>{if(!saving.current)onClose();}}>Discard changes</button></div>}
      <div className="flex flex-wrap justify-end gap-2 border-t p-3"><button type="button" disabled={busy} onClick={requestClose} className="rounded-lg border px-4 py-2">Cancel</button>
        {draft.mode==='update'&&<button type="button" disabled={busy} onClick={()=>{if(saving.current)return;updateDraft({...draft,id:crypto.randomUUID(),name:`${draft.name.slice(0,55)} copy`,mode:'create'});setError('');name.current?.focus();}} className="rounded-lg border px-4 py-2">Save as new</button>}
        <button type="button" disabled={busy} onClick={()=>void save()} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">{busy?'Saving…':draft.mode==='update'?'Save changes':'Save template'}</button></div>
    </div>
  </div>;
}
