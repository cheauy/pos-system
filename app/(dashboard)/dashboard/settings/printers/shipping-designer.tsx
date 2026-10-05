"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Plus, RotateCcw, Trash2, Copy, Eye, EyeOff, LockKeyhole, UnlockKeyhole, Grid3X3, Pencil, Type, Search, GripVertical, UserRound, Phone, MapPin, ClipboardList, Target, Truck, Barcode, QrCode, ImageIcon, CalendarDays, Undo2, Redo2 } from 'lucide-react';
import { defaultShippingLayout, fitShippingElement, resizeShippingLayout, validateShippingLayout, SHIPPING_FIELDS, SHIPPING_FONTS, SHIPPING_TEXT_TAGS, type ShippingElement, type ShippingField, type ShippingFont, type ShippingLayout } from '@/lib/receipts/shipping-layout';
import { ShippingElementContent, shippingElementStyle, type ShippingValues } from '@/components/receipts/shipping-canvas';
import ShippingRichText from './shipping-rich-text';

export default function ShippingDesigner({layout,size,values,onChange,templateDetails,onUndo,onRedo,canUndo=false,canRedo=false}:{layout:ShippingLayout;size:string;values:ShippingValues;onChange:(layout:ShippingLayout,group?:string)=>void;templateDetails?:ReactNode;onUndo?:()=>void;onRedo?:()=>void;canUndo?:boolean;canRedo?:boolean}) {
  const [selectedIds,setSelectedIds]=useState<string[]>(()=>{const id=layout.elements.find(element=>element.field==='text'&&element.text.trim())?.id??layout.elements.find(element=>!['text','qr','barcode','line','logo'].includes(element.field))?.id;return id?[id]:[];});
  const [field,setField]=useState<ShippingField>('text'),[editing,setEditing]=useState<string|null>(null);
  const [inlineTarget,setInlineTarget]=useState<HTMLDivElement|null>(null),[zoom,setZoom]=useState(1);
  const [textDefaults,setTextDefaults]=useState<ShippingElement>({id:'new-text',field:'text',x:5,y:5,width:70,height:10,fontSize:12,bold:false,align:'left',text:''});
  const [clipboardError,setClipboardError]=useState(''),[search,setSearch]=useState(''),[tab,setTab]=useState<'fields'|'layers'>('fields');
  const [preview,setPreview]=useState(false),[grid,setGrid]=useState(true),layerDrag=useRef<string|null>(null);
  const canvas=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:string;group:string;x:number;y:number;element:ShippingElement;elements:ShippingElement[];resize:boolean;moved:boolean;bounds:DOMRect}|null>(null);
  const [selectionBox,setSelectionBox]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const selectionDrag=useRef<{x:number;y:number;bounds:DOMRect;initial:string[]}|null>(null),suppressClick=useRef(false);
  const selectedElements=selectedIds.flatMap(id=>layout.elements.filter(element=>element.id===id));
  const item=selectedElements.at(-1),isText=!!item&&!['qr','barcode','line','logo'].includes(item.field);
  const [width,height]=size.split('x').map(Number),qrMinimumMm=Number(values.qrMinimumMm);
  const styles=isText?item!:textDefaults,blocked=preview||!!item?.locked;
  useEffect(()=>{const node=viewport.current;if(!node)return;const bounds=node.getBoundingClientRect();setZoom(Math.max(.25,Math.min(3,Math.floor(Math.min((bounds.width-72)/(width*96/25.4),(bounds.height-72)/(height*96/25.4))*100)/100)));},[width,height]);
  function select(id:string|null,toggle=false,preserve=false){setSelectedIds(previous=>!id?[]:toggle?previous.includes(id)?previous.filter(value=>value!==id):[...previous,id]:preserve&&previous.includes(id)?previous:[id]);if(id!==editing)setEditing(null);}
  function fitPreview(){
    if(!viewport.current)return;
    const bounds=viewport.current.getBoundingClientRect();
    setZoom(Math.max(.25,Math.min(3,Math.floor(Math.min((bounds.width-56)/(width*96/25.4),(bounds.height-56)/(height*96/25.4))*100)/100)));
  }
  function removeField(){
    if(!item||preview)return;
    const ids=new Set(selectedElements.filter(element=>!element.locked).map(element=>element.id));
    if(!ids.size)return;
    onChange({...layout,elements:layout.elements.filter(element=>!ids.has(element.id))});setSelectedIds(previous=>previous.filter(id=>!ids.has(id)));setEditing(null);drag.current=null;viewport.current?.focus();
  }
  function update(id:string,patch:Partial<ShippingElement>){
    if(preview)return;
    const existing=layout.elements.find(element=>element.id===id);
    if(!existing||existing.locked&&!(patch.locked===false&&Object.keys(patch).length===1))return;
    onChange({...layout,elements:layout.elements.map(element=>{
      if(element.id!==id)return element;
      if(element.locked)return patch.locked===false&&Object.keys(patch).length===1?{...element,locked:false}:element;
      const next={...element,...patch};
      if(element.field==='qr'&&patch.height!==undefined&&patch.width===undefined)next.width=patch.height*height/width;
      return fitShippingElement(next,size,qrMinimumMm);
    })},drag.current?.group);
  }
  function updateSelection(patch:Partial<ShippingElement>){
    if(preview)return;
    const unlock=patch.locked===false&&Object.keys(patch).length===1;
    onChange({...layout,elements:layout.elements.map(element=>!selectedIds.includes(element.id)||element.locked&&!unlock?element:fitShippingElement({...element,...patch},size,qrMinimumMm))});
  }
  function moveFields(elements:ShippingElement[],dx:number,dy:number,group?:string){
    if(preview)return;
    const movable=elements.filter(element=>!element.locked);if(!movable.length)return;
    dx=Math.max(-Math.min(...movable.map(element=>element.x)),Math.min(dx,100-Math.max(...movable.map(element=>element.x+element.width))));
    dy=Math.max(-Math.min(...movable.map(element=>element.y)),Math.min(dy,100-Math.max(...movable.map(element=>element.y+element.height))));
    const moved=new Map(movable.map(element=>[element.id,fitShippingElement({...element,x:element.x+dx,y:element.y+dy},size,qrMinimumMm)]));
    onChange({...layout,elements:layout.elements.map(element=>element.locked?element:moved.get(element.id)??element)},group);
  }
  function beginSelection(event:React.PointerEvent){
    if(preview||event.button!==0||!canvas.current||isTextInput(event.target)||(event.target as HTMLElement).closest?.('[data-shipping-element]'))return;
    event.preventDefault();event.stopPropagation();setEditing(null);suppressClick.current=true;
    selectionDrag.current={x:event.clientX,y:event.clientY,bounds:canvas.current.getBoundingClientRect(),initial:event.ctrlKey||event.metaKey?[...selectedIds]:[]};
    if(!event.ctrlKey&&!event.metaKey)setSelectedIds([]);
    event.currentTarget.setPointerCapture(event.pointerId);(event.currentTarget as HTMLElement).focus();
  }
  function moveSelection(event:React.PointerEvent){
    const current=selectionDrag.current;if(!current)return;
    const x1=Math.max(0,Math.min(100,(current.x-current.bounds.left)/current.bounds.width*100)),y1=Math.max(0,Math.min(100,(current.y-current.bounds.top)/current.bounds.height*100));
    const x2=Math.max(0,Math.min(100,(event.clientX-current.bounds.left)/current.bounds.width*100)),y2=Math.max(0,Math.min(100,(event.clientY-current.bounds.top)/current.bounds.height*100));
    const box={x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)};setSelectionBox(box);
    const hits=box.width&&box.height?layout.elements.filter(element=>!element.hidden&&element.x<box.x+box.width&&element.x+element.width>box.x&&element.y<box.y+box.height&&element.y+element.height>box.y).map(element=>element.id):[];
    setSelectedIds([...new Set([...current.initial,...hits])]);
  }
  function finishSelection(){selectionDrag.current=null;setSelectionBox(null);}
  function start(event:React.PointerEvent,element:ShippingElement,resize=false){
    if(preview)return;
    if(editing===element.id&&!resize){event.stopPropagation();return;}
    if(!resize&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopPropagation();suppressClick.current=true;select(element.id,true);return;}
    if(element.locked)return;
    if(!canvas.current||event.button!==0)return;
    event.preventDefault();event.stopPropagation();suppressClick.current=false;select(element.id,false,true);(event.currentTarget as HTMLElement).focus();
    const elements=selectedIds.includes(element.id)?selectedElements:[element];
    drag.current={id:element.id,group:crypto.randomUUID(),x:event.clientX,y:event.clientY,element:{...element},elements:elements.map(value=>({...value})),resize,moved:false,bounds:canvas.current.getBoundingClientRect()};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:React.PointerEvent){
    const current=drag.current;if(!current)return;
    if(!current.moved&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<3)return;
    current.moved=true;suppressClick.current=true;
    const dx=(event.clientX-current.x)/current.bounds.width*100,dy=(event.clientY-current.y)/current.bounds.height*100;
    if(current.resize)update(current.id,{width:Math.min(100-current.element.x,Math.max(2,current.element.width+dx)),height:Math.min(100-current.element.y,Math.max(1,current.element.height+dy))});
    else moveFields(current.elements,dx,dy,current.group);
  }
  function addField(tag?:string,nextField:ShippingField=tag?'text':field){
    if(preview||layout.elements.length>=40)return;
    const id=crypto.randomUUID(),element:ShippingElement={...textDefaults,id,field:nextField,x:5,y:5,width:['qr','logo'].includes(nextField)?27:70,height:['qr','logo'].includes(nextField)?27:nextField==='barcode'?15:10,text:nextField==='text'?tag??'Your text':''};
    delete element.richText;
    onChange({...layout,elements:[...layout.elements,fitShippingElement(element,size,qrMinimumMm)]});select(id);if(nextField==='text')setEditing(id);
  }
  function applyTextTools(patch:Partial<ShippingElement>){
    if(blocked)return;
    if(item&&isText)update(item.id,patch);
    else setTextDefaults(previous=>({...previous,...patch,text:'',richText:undefined}));
  }
  function isTextInput(target:EventTarget){
    const node=target as HTMLElement;
    return node.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(node.tagName);
  }
  function copyField(event:React.ClipboardEvent){
    if(preview||event.defaultPrevented||isTextInput(event.target)||!item)return;
    if(event.type==='cut'&&selectedElements.some(element=>element.locked)){event.preventDefault();return;}
    event.preventDefault();
    const elements=layout.elements.filter(element=>selectedIds.includes(element.id));
    event.clipboardData.setData('application/x-tenh-shipping-field',JSON.stringify({...layout,elements}));
    event.clipboardData.setData('text/plain',elements.map(element=>element.field==='text'?element.text:SHIPPING_TEXT_TAGS.find(option=>option.field===element.field&&option.tag.startsWith('{{'))?.tag??values[element.field]??SHIPPING_FIELDS[element.field]).join('\n'));
    setClipboardError('');
    if(event.type==='cut')removeField();
  }
  function pasteField(event:React.ClipboardEvent){
    if(event.defaultPrevented||isTextInput(event.target))return;
    if(preview){event.preventDefault();return;}
    const copied=event.clipboardData.getData('application/x-tenh-shipping-field'),text=event.clipboardData.getData('text/plain');
    if(!copied&&!text)return;
    event.preventDefault();
    try{
      if(layout.elements.length>=40)throw new Error('A design supports up to 40 elements.');
      let elements:ShippingElement[];
      if(copied){
        if(copied.length>65536)throw new Error('The copied field is too large.');
        const source=validateShippingLayout(JSON.parse(copied));
        if(!source.elements.length)throw new Error('Copy at least one field.');
        elements=copyElements(source.elements);
      }else elements=[{...textDefaults,id:crypto.randomUUID(),text:text.replace(/\r\n?/g,'\n'),richText:undefined}];
      if(layout.elements.length+elements.length>40)throw new Error('A design supports up to 40 elements.');
      const fitted=elements.map(element=>fitShippingElement(element,size,qrMinimumMm));
      validateShippingLayout({...layout,elements:fitted},qrMinimumMm);
      onChange({...layout,elements:[...layout.elements,...fitted]});setSelectedIds(fitted.map(element=>element.id));setEditing(null);setClipboardError('');
    }catch(error){setClipboardError(error instanceof Error?error.message:'Could not paste the field.');}
  }
  function copyElements(elements:ShippingElement[]){
    const dx=Math.min(2,100-Math.max(...elements.map(element=>element.x+element.width))),dy=Math.min(2,100-Math.max(...elements.map(element=>element.y+element.height)));
    return elements.map(element=>fitShippingElement({...element,id:crypto.randomUUID(),x:element.x+dx,y:element.y+dy,locked:false},size,qrMinimumMm));
  }
  function duplicate(){
    if(!item||preview||layout.elements.length+selectedElements.length>40)return;
    const copies=copyElements(layout.elements.filter(element=>selectedIds.includes(element.id)));
    onChange({...layout,elements:[...layout.elements,...copies]});setSelectedIds(copies.map(element=>element.id));setEditing(null);
  }
  function reorder(id:string,to:number){
    const from=layout.elements.findIndex(element=>element.id===id);
    if(preview||from<0||layout.elements[from].locked||to<0||to>=layout.elements.length||from===to)return;
    const elements=[...layout.elements],[element]=elements.splice(from,1);elements.splice(to,0,element);onChange({...layout,elements});
  }
  const input='h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none';
  const tool='inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-transparent px-2 text-slate-600 hover:bg-blue-50 disabled:opacity-35';
  const fields=[
    {field:'customerName',label:'Recipient name',Icon:UserRound},{field:'customerPhone',label:'Phone number',Icon:Phone},
    {field:'customerAddress',label:'Address (multi-line)',Icon:MapPin},{field:'orderNumber',label:'Order number',Icon:ClipboardList},
    {field:'tracking',label:'Tracking number',Icon:Target},{field:'barcode',label:'Barcode (1D)',Icon:Barcode},
    {field:'shippingType',label:'Shipping type',Icon:Truck},
    {field:'qr',label:'QR code',Icon:QrCode},{field:'logo',label:'Logo / Image',Icon:ImageIcon},
    {field:'date',label:'Date',Icon:CalendarDays},{field:'text',label:'Custom text',Icon:Type},
  ] as const;
  const layers=<div aria-label="Template layers" className="space-y-1">{layout.elements.map((element,index)=>{
    const Icon=fields.find(option=>option.field===element.field)?.Icon??Type;
    return <div key={element.id} draggable={!element.locked&&!preview} onDragStart={event=>{layerDrag.current=element.id;event.dataTransfer.setData('application/x-tenh-shipping-layer',element.id);event.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{layerDrag.current=null;}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(layerDrag.current)reorder(layerDrag.current,index);layerDrag.current=null;}} className={`flex items-center gap-1 rounded-md border-l-2 ${selectedIds.includes(element.id)?'border-blue-600 bg-blue-50 text-blue-600':'border-transparent text-slate-700'}`}>
      <button type="button" aria-label={`Select layer ${element.id}`} aria-pressed={selectedIds.includes(element.id)} onClick={event=>select(element.id,event.ctrlKey||event.metaKey)} onKeyDown={event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();reorder(element.id,index+(event.key==='ArrowUp'?-1:1));}}} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left text-xs"><Icon size={16} className="shrink-0"/><span className={`truncate ${element.hidden?'opacity-50':''}`}>{element.field==='text'?element.text||'Custom text':SHIPPING_FIELDS[element.field]}</span>{element.locked&&<LockKeyhole size={12} className="shrink-0"/>}</button>
      <button type="button" aria-label={`${element.hidden?'Show':'Hide'} layer ${element.id}`} disabled={preview||element.locked} onClick={()=>update(element.id,{hidden:!element.hidden})} className={`${tool} min-w-7 px-1`}>{element.hidden?<EyeOff size={15}/>:<Eye size={15}/>}</button>
      <span title="Drag to reorder · Alt + ↑ / ↓ on layer name" className="pr-2 text-slate-400"><GripVertical size={15}/></span>
    </div>;
  })}{!layout.elements.length&&<p className="p-3 text-xs text-slate-400">Add a field to begin.</p>}<p className="pt-2 text-[10px] text-slate-400">Drag to reorder · Alt + ↑ / ↓ on a layer</p></div>;
  return <section aria-label="Template tools" className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]"
    onKeyDown={event=>{
      if(event.defaultPrevented||isTextInput(event.target)||event.nativeEvent.isComposing)return;
      if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase();if(key==='a'){event.preventDefault();if(!preview){setSelectedIds(layout.elements.filter(element=>!element.hidden).map(element=>element.id));setEditing(null);}return;}if(key==='z'||key==='y'){event.preventDefault();if(!preview){setEditing(null);(event.shiftKey||key==='y'?onRedo:onUndo)?.();}return;}if(key==='d'){event.preventDefault();duplicate();return;}}
      if((event.key==='Backspace'||event.key==='Delete')&&item&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopPropagation();removeField();}
    }} onCopy={copyField} onCut={copyField} onPaste={pasteField}>
    <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white px-5 pb-5">
      {templateDetails}
      <div role="tablist" aria-label="Field navigation" className="sticky top-0 z-10 mb-4 flex border-b border-slate-200 bg-white">{(['fields','layers'] as const).map(value=><button type="button" key={value} role="tab" aria-selected={tab===value} aria-controls={`shipping-${value}-panel`} id={`shipping-${value}-tab`} onClick={()=>setTab(value)} className={`relative flex-1 py-4 text-sm font-medium capitalize ${tab===value?'text-blue-600 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-blue-600':'text-slate-500'}`}>{value}</button>)}</div>
      <div role="tabpanel" id={`shipping-${tab}-panel`} aria-labelledby={`shipping-${tab}-tab`}>
      {tab==='fields'?<>
        <label className="relative mb-5 block"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input aria-label="Search fields" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search fields..." className={`${input} h-10 pl-9`}/></label>
        <h3 className="mb-3 text-xs font-semibold">Dynamic fields <span title="Order fields fill automatically when printed." className="ml-1 text-slate-400">ⓘ</span></h3>
        <div className="grid grid-cols-2 gap-2">{[...fields,...Object.entries(SHIPPING_FIELDS).filter(([key])=>search.trim()&&!fields.some(option=>option.field===key)).map(([field,label])=>({field:field as ShippingField,label,Icon:Type}))].filter(option=>`${option.label} ${SHIPPING_FIELDS[option.field]}`.toLowerCase().includes(search.toLowerCase())).map(({field,label,Icon})=><button key={field} type="button" disabled={preview||layout.elements.length>=40} aria-label={`Add ${label}`} onClick={()=>addField(undefined,field)} className="flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-blue-100 bg-white pr-1 text-left text-[10px] text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40"><span className="flex w-8 shrink-0 self-stretch items-center justify-center rounded-l-md bg-blue-50 text-blue-600"><Icon size={16}/></span><span>{label}</span></button>)}</div>
        <div className="mt-4 flex gap-2"><select aria-label="Field to add" value={field} onChange={event=>setField(event.target.value as ShippingField)} className={input}>{Object.entries(SHIPPING_FIELDS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" aria-label="Add field" disabled={preview||layout.elements.length>=40} onClick={()=>addField()} className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40"><Plus size={14}/>Add</button></div>
        <h3 className="mb-3 border-t border-slate-200 pt-4 text-xs font-semibold">Template structure</h3>{layers}
      </>:<><h3 className="mb-3 text-xs font-semibold">Template structure</h3>{layers}</>}
      </div>
      <button type="button" disabled={preview} onClick={()=>{onChange(resizeShippingLayout(defaultShippingLayout(size),size,qrMinimumMm));select(null);}} className="mt-5 flex items-center gap-2 text-[11px] text-slate-500 hover:text-blue-600"><RotateCcw size={13}/>Reset layout</button>
    </aside>
    <main className="flex min-h-[450px] min-w-0 flex-col bg-slate-50/80 p-2 lg:min-h-0">
      <div role="toolbar" aria-label="Canvas tools" className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg bg-white p-2">
        <div className="mr-2 inline-flex gap-0.5 rounded-md border border-slate-200 p-0.5"><button type="button" aria-label="Edit label" aria-pressed={!preview} onClick={()=>setPreview(false)} className={`${tool} gap-2 px-3 ${!preview?'bg-blue-600 text-white hover:bg-blue-700':''}`}><Pencil size={14}/>Edit</button><button type="button" aria-label="Preview label" aria-pressed={preview} onClick={()=>{setPreview(true);setEditing(null);drag.current=null;finishSelection();suppressClick.current=false;}} className={`${tool} gap-2 px-3 ${preview?'bg-blue-600 text-white hover:bg-blue-700':''}`}><Eye size={14}/>Preview</button></div>
        <button type="button" aria-label="Duplicate field" title="Duplicate · Ctrl/Cmd+D" disabled={!item||preview||layout.elements.length+selectedElements.length>40} onClick={duplicate} className={tool}><Copy size={16}/></button>
        <button type="button" aria-label={item?.locked?'Unlock field':'Lock field'} title={item?.locked?'Unlock':'Lock'} disabled={!item||preview} onClick={()=>{if(item){updateSelection({locked:!item.locked});setEditing(null);drag.current=null;}}} className={tool}>{item?.locked?<UnlockKeyhole size={16}/>:<LockKeyhole size={16}/>}</button>
        <button type="button" aria-label={item?.hidden?'Show field':'Hide field'} title={item?.hidden?'Show':'Hide'} disabled={!item||blocked} onClick={()=>{if(item){updateSelection({hidden:!item.hidden});setEditing(null);}}} className={tool}>{item?.hidden?<Eye size={16}/>:<EyeOff size={16}/>}</button>
        <button type="button" aria-label="Remove field" title="Delete · Backspace" disabled={!item||preview||selectedElements.every(element=>element.locked)} onClick={removeField} className={`${tool} text-red-500`}><Trash2 size={16}/></button>
        <span className="mx-1 h-5 border-l border-slate-200"/>
        <button type="button" aria-label="Undo layout edit" disabled={!canUndo||preview} onClick={()=>{setEditing(null);onUndo?.();}} className={tool}><Undo2 size={15}/></button><button type="button" aria-label="Redo layout edit" disabled={!canRedo||preview} onClick={()=>{setEditing(null);onRedo?.();}} className={tool}><Redo2 size={15}/></button>
        <div className="ml-auto flex items-center gap-1"><span className="mr-1 text-[11px] text-slate-500">Zoom</span><button type="button" aria-label="Zoom out" disabled={zoom<=.25} onClick={()=>setZoom(Math.max(.25,zoom-.25))} className={`${tool} min-w-6 px-1`}>−</button><select aria-label="Preview zoom" value={zoom} onChange={event=>setZoom(Number(event.target.value))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs">{[...new Set([.25,.5,.75,1,1.25,1.5,2,2.5,3,zoom])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}</select><button type="button" aria-label="Zoom in" disabled={zoom>=3} onClick={()=>setZoom(Math.min(3,zoom+.25))} className={`${tool} min-w-6 px-1`}><Plus size={14}/></button></div>
        <button type="button" aria-label="Fit preview" title="Fit to workspace" onClick={fitPreview} className={`${tool} border-slate-200`}><Maximize size={15}/></button><button type="button" aria-label="Toggle grid" title="Show rulers and grid" aria-pressed={grid} onClick={()=>setGrid(!grid)} className={`${tool} ${grid?'bg-blue-600 text-white hover:bg-blue-700':'border-slate-200'}`}><Grid3X3 size={16}/></button>
      </div>

      <fieldset disabled={blocked} className="mt-2 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-60" aria-label="Text tools">
        <ShippingRichText compact canvasTools key={isText?item!.id:'new-text-tools'} item={styles} toolsOnly={!isText||blocked} onChange={applyTextTools} inlineTarget={item&&editing===item.id&&!blocked?inlineTarget:null} onFinish={()=>setEditing(null)} onInsertTag={tag=>addField(tag)} additionalTools={<><label className="block max-w-60 text-[11px] text-slate-500">Font family<select aria-label="Field font family" value={styles.fontFamily??'auto'} onChange={event=>applyTextTools({fontFamily:event.target.value as ShippingFont})} className={`${input} mt-1`}>{Object.entries(SHIPPING_FONTS).map(([id,font])=><option key={id} value={id}>{font.label}</option>)}</select></label><label className="text-[11px] text-slate-500">Color<input aria-label="Text color" type="color" value={styles.color??'#000000'} onChange={event=>applyTextTools({color:event.target.value})} className="mt-1 block h-9 w-10 rounded-md border border-slate-200 bg-white p-1"/></label></>}/>
      </fieldset>
      <p className="px-2 py-1 text-[10px] text-slate-500">Drag empty space to select · Ctrl/Cmd + click to toggle selection · Ctrl/Cmd + A selects all · Double-click custom text to edit<span role="status" className="ml-3 font-medium text-blue-600">{selectedElements.length} selected</span></p>
      {clipboardError&&<p role="alert" className="p-2 text-xs text-red-700">{clipboardError}</p>}
      <div ref={viewport} tabIndex={0} aria-label="Label workspace" className="mt-2 min-h-0 flex-1 overflow-auto rounded-md bg-[#e6edf4] p-8 outline-none focus-visible:ring-2 focus-visible:ring-blue-300" onPointerDown={beginSelection} onPointerMove={moveSelection} onPointerUp={finishSelection} onPointerCancel={()=>{finishSelection();suppressClick.current=false;}} onLostPointerCapture={()=>{if(selectionDrag.current){finishSelection();suppressClick.current=false;}}} onClick={event=>{if(suppressClick.current){suppressClick.current=false;return;}select(null);event.currentTarget.focus();}}>
        <div className="flex min-h-full w-max min-w-full items-center justify-center"><div className="relative shrink-0" style={{width:`${width*zoom}mm`,height:`${height*zoom}mm`}}>
          {grid&&!preview&&<><div aria-hidden="true" className="pointer-events-none absolute -top-7 left-0 right-0 h-5 border-b border-slate-300">{Array.from({length:width+1},(_,i)=><span key={i} className="absolute bottom-0 border-l border-slate-300" style={{left:`${i/width*100}%`,height:i%10===0?12:5}}>{i%10===0&&<span className="absolute -top-3 text-[9px] text-slate-500">{i}</span>}</span>)}</div><div aria-hidden="true" className="pointer-events-none absolute -left-7 bottom-0 top-0 w-5 border-r border-slate-300">{Array.from({length:height+1},(_,i)=><span key={i} className="absolute right-0 border-t border-slate-300" style={{top:`${i/height*100}%`,width:i%10===0?12:5}}>{i%10===0&&<span className="absolute -left-3 -top-1.5 text-[9px] text-slate-500">{i}</span>}</span>)}</div></>}
          <div ref={canvas} aria-label="Shipping label design canvas" style={{position:'relative',width:`${width}mm`,height:`${height}mm`,transform:`scale(${zoom})`,transformOrigin:'top left',background:'white',color:'black',borderRadius:4,boxShadow:'0 8px 28px #0f172a12',overflow:'hidden',...(grid&&!preview?{backgroundImage:'linear-gradient(#eff6ff55 1px, transparent 1px),linear-gradient(90deg,#eff6ff55 1px,transparent 1px)',backgroundSize:'5mm 5mm'}:{})}}>
            {!preview&&<div aria-hidden="true" className="pointer-events-none absolute z-10 border border-dashed border-rose-300" style={{inset:'2.5mm'}}/>}
            {selectionBox&&!preview&&<div aria-label="Selection marquee" style={{position:'absolute',left:`${selectionBox.x}%`,top:`${selectionBox.y}%`,width:`${selectionBox.width}%`,height:`${selectionBox.height}%`,border:'1px solid #2563eb',background:'#2563eb22',pointerEvents:'none',zIndex:20}}/>}
            {layout.elements.filter(element=>!element.hidden).map(element=><div key={element.id} data-shipping-element={element.id} role={preview||editing===element.id?'group':'button'} tabIndex={preview?-1:0} aria-label={`Move ${SHIPPING_FIELDS[element.field]}`} aria-pressed={preview||editing===element.id?undefined:selectedIds.includes(element.id)}
              onFocus={()=>{if(!preview)select(element.id,false,true);}} onClick={event=>{event.stopPropagation();if(editing===element.id)return;if(suppressClick.current){suppressClick.current=false;return;}if(!preview)select(element.id,event.ctrlKey||event.metaKey);}}
              onDoubleClick={event=>{event.stopPropagation();if(!preview){select(element.id);if(element.field==='text'&&!element.locked)setEditing(element.id);}}}
              onPointerDown={event=>start(event,element)} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;suppressClick.current=false;}} onLostPointerCapture={()=>{if(drag.current){drag.current=null;suppressClick.current=false;}}}
              onKeyDown={event=>{
                if(preview||element.locked||(event.target as HTMLElement).isContentEditable||event.nativeEvent.isComposing)return;
                if(event.key==='Enter'&&element.field==='text'){event.preventDefault();select(element.id);setEditing(element.id);return;}
                const step=event.shiftKey?5:1,direction={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];if(direction){event.preventDefault();moveFields(selectedIds.includes(element.id)?selectedElements:[element],direction[0],direction[1]);}
              }} style={{...shippingElementStyle(element),touchAction:editing===element.id?'auto':'none',cursor:preview?'default':element.locked?'pointer':editing===element.id?'text':'move',outline:preview?'none':selectedIds.includes(element.id)?'1.5px dashed #2563eb':'none',outlineOffset:-1,userSelect:preview||editing===element.id?'text':'none'}}>
              {editing===element.id&&!element.locked?<div ref={setInlineTarget} className="h-full w-full"/>:<ShippingElementContent element={element} values={values} showPlaceholders={!preview}/>}
              {!preview&&!element.locked&&selectedIds.includes(element.id)&&editing!==element.id&&<>{['top-left','top-right','bottom-left'].map(corner=><span key={corner} aria-hidden="true" style={{position:'absolute',width:5,height:5,border:'1px solid #2563eb',background:'white',...(corner.startsWith('top')?{top:0}:{bottom:0}),...(corner.endsWith('left')?{left:0}:{right:0})}}/>)}<span role="button" tabIndex={0} aria-label={`Resize ${SHIPPING_FIELDS[element.field]}`} onPointerDown={event=>start(event,element,true)} onKeyDown={event=>{const delta={ArrowRight:{width:element.width+1},ArrowLeft:{width:element.width-1},ArrowDown:{height:element.height+1},ArrowUp:{height:element.height-1}}[event.key];if(delta){event.preventDefault();event.stopPropagation();update(element.id,delta);}}} style={{position:'absolute',right:0,bottom:0,width:8,height:8,border:'1px solid #2563eb',background:'white',cursor:'nwse-resize',touchAction:'none'}}/></>}
            </div>)}
          </div>
        </div></div>
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-[10px] text-slate-500"><span className="h-5 w-5 rounded border border-dashed border-rose-300 bg-rose-50"/>Safe print area (keep important content inset)<span className="ml-auto">Actual size: {width} × {height} mm</span></div>
    </main>
  </section>;
}
