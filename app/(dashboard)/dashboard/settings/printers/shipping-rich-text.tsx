"use client";
import { useLanguage } from "@/components/providers/language-provider";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2 } from 'lucide-react';
import { formatShippingRuns, normalizeShippingRuns, SHIPPING_FIELDS, SHIPPING_FONTS, SHIPPING_TEXT_TAGS, type ShippingElement, type ShippingTextMarks, type ShippingTextRun } from '@/lib/receipts/shipping-layout';
import { shippingRichTextMarkup } from '@/lib/receipts/shipping-custom';

type TextSelection = {start:number;end:number};
const defaults=(item:ShippingElement):ShippingTextMarks=>({bold:item.bold,italic:item.italic||false,underline:item.underline||false,fontSize:item.fontSize});
/** Import only text and supported inline formatting; no pasted HTML is stored or inserted. */
export function shippingRunsFromDom(root:Node, base:ShippingTextMarks):ShippingTextRun[] {
  const runs:ShippingTextRun[]=[];
  function walk(node:Node, inherited:ShippingTextMarks) {
    if(node.nodeType===Node.TEXT_NODE){if(node.textContent)runs.push({...inherited,text:node.textContent});return;}
    if(node.nodeType!==Node.ELEMENT_NODE && node!==root)return;
    const element=node as HTMLElement,tag=element.tagName;
    if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','IMG','SVG','MATH','VIDEO','AUDIO','INPUT','BUTTON'].includes(tag))return;
    if(tag==='BR'){runs.push({...inherited,text:'\n'});return;}
    const marks={...inherited};
    if(tag==='STRONG'||tag==='B')marks.bold=true;
    if(tag==='EM'||tag==='I')marks.italic=true;
    if(tag==='U')marks.underline=true;
    const style=element.style;
    if(style){
      if(style.fontWeight)marks.bold=style.fontWeight==='bold'||Number(style.fontWeight)>=600;
      if(style.fontStyle)marks.italic=style.fontStyle==='italic';
      if(style.textDecorationLine)marks.underline=style.textDecorationLine.includes('underline');
      const font=style.fontSize.match(/^(\d+(?:\.\d+)?)(px|pt)$/);
      if(font){const size=Number(font[1])*(font[2]==='pt'?4/3:1);if(size>=6&&size<=36)marks.fontSize=size;}
    }
    const block=['P','DIV','LI','H1','H2','H3','H4','H5','H6'].includes(tag)&&node!==root;
    if(block&&runs.length&&!runs[runs.length-1].text.endsWith('\n'))runs.push({...marks,text:'\n'});
    for(const child of node.childNodes)walk(child,marks);
  }
  walk(root,base);return normalizeShippingRuns(runs);
}

export default function ShippingRichText({item,onChange,inlineTarget,onFinish,toolsOnly=false,onInsertTag,additionalTools,compact=false,canvasTools=false}:{item:ShippingElement;onChange:(patch:Partial<ShippingElement>)=>void;inlineTarget?:HTMLDivElement|null;onFinish?:()=>void;toolsOnly?:boolean;onInsertTag?:(tag:string)=>void;additionalTools?:ReactNode;compact?:boolean;canvasTools?:boolean}) {
  const { t: translateLabel } = useLanguage();

  const editable=item.field==='text';
  const root=useRef<HTMLDivElement>(null), selection=useRef<TextSelection>({start:0,end:0}), composing=useRef(false);
  const [chosenRange,setChosenRange]=useState<TextSelection>({start:0,end:0}),[error,setError]=useState('');
  const [historyCounts,setHistoryCounts]=useState({undo:0,redo:0});
  const runs=item.richText||[{text:item.text,...defaults(item)}];
  const history=useRef<{runs:ShippingTextRun[];selection:TextSelection;marks:ShippingTextMarks}[]>([]),redo=useRef<typeof history.current>([]);
  const capture=useCallback(()=>{
    const node=root.current;if(!node)return;const chosen=window.getSelection();if(!chosen?.rangeCount)return;
    const range=chosen.getRangeAt(0);if(!node.contains(range.startContainer)||!node.contains(range.endContainer))return;
    const before=range.cloneRange();before.selectNodeContents(node);before.setEnd(range.startContainer,range.startOffset);
    selection.current={start:before.toString().length,end:before.toString().length+range.toString().length};setChosenRange(previous=>previous.start===selection.current.start&&previous.end===selection.current.end?previous:{...selection.current});
  },[]);
  const restore=useCallback((value=selection.current)=>{
    const node=root.current;if(!node)return;
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);const points:Array<{node:Node;start:number;end:number}>=[];let offset=0;
    while(walker.nextNode()){const text=walker.currentNode;points.push({node:text,start:offset,end:offset+(text.textContent?.length||0)});offset+=text.textContent?.length||0;}
    const locate=(at:number)=>{const clamped=Math.min(offset,Math.max(0,at));return points.find(point=>clamped<=point.end)||points[points.length-1];};
    const start=locate(value.start),end=locate(value.end),range=document.createRange();
    if(start&&end){range.setStart(start.node,Math.min(value.start-start.start,start.end-start.start));range.setEnd(end.node,Math.min(value.end-end.start,end.end-end.start));}else range.selectNodeContents(node);
    node.focus();const chosen=window.getSelection();chosen?.removeAllRanges();chosen?.addRange(range);capture();
  },[capture]);
  function commit(next:ShippingTextRun[],value=selection.current,record=true,fieldPatch:ShippingTextMarks={}){
    const normalized=normalizeShippingRuns(next);
    if(record){history.current.push({runs:normalizeShippingRuns(runs),selection:{...selection.current},marks:defaults(item)});if(history.current.length>50)history.current.shift();redo.current=[];}
    setHistoryCounts({undo:history.current.length,redo:redo.current.length});
    if(root.current)root.current.innerHTML=shippingRichTextMarkup(normalized,fieldPatch.underline??item.underline);
    selection.current=value;onChange({...fieldPatch,text:normalized.map(run=>run.text).join(''),richText:normalized});setError('');restore(value);
  }
  useEffect(()=>{
    const node=root.current;if(!node||composing.current)return;
    const html=shippingRichTextMarkup(runs,item.underline);if(node.innerHTML!==html){const focused=node.contains(document.activeElement);node.innerHTML=html;if(focused)restore();}
  });
  useEffect(()=>{document.addEventListener('selectionchange',capture);return()=>document.removeEventListener('selectionchange',capture);},[capture]);
  useEffect(()=>{
    if(!inlineTarget||!root.current)return;
    selection.current={start:0,end:root.current.textContent?.length??0};restore();
  },[inlineTarget,restore]);
  function format(patch:ShippingTextMarks){
    if(!editable){onChange(patch);return;}
    if(selection.current.start===selection.current.end){commit(runs.map(run=>({...run,...patch})),selection.current,true,patch);return;}
    commit(formatShippingRuns(runs,selection.current.start,selection.current.end,patch));
  }
  const markAtSelection=(()=>{let offset=0;for(const run of runs){offset+=run.text.length;if(offset>chosenRange.start)return {...defaults(item),...run};}return defaults(item);})();
  function undo(forward=false){
    const from=forward?redo.current:history.current,to=forward?history.current:redo.current,previous=from.pop();
    if(previous){to.push({runs:normalizeShippingRuns(runs),selection:{...selection.current},marks:defaults(item)});commit(previous.runs,previous.selection,false,previous.marks);}
  }
  function insertRuns(pasted:ShippingTextRun[]){
    const {start,end}=selection.current;let offset=0;const before:ShippingTextRun[]=[],after:ShippingTextRun[]=[];
    for(const run of runs){if(offset<start)before.push({...run,text:run.text.slice(0,Math.max(0,start-offset))});if(offset+run.text.length>end)after.push({...run,text:run.text.slice(Math.max(0,end-offset))});offset+=run.text.length;}
    const caret=start+pasted.reduce((sum,run)=>sum+run.text.length,0);commit([...before,...pasted,...after],{start:caret,end:caret});
  }
  function insertTag(tag:string){
    if(!SHIPPING_TEXT_TAGS.some(option=>option.tag===tag))return;
    if(!editable||toolsOnly){onInsertTag?.(tag);return;}
    capture();try{insertRuns([{...markAtSelection,text:tag}]);}catch(error){setError((error as Error).message);}
  }
  const button=`inline-flex ${compact?'h-8 min-w-8':'h-12 min-w-12'} items-center justify-center rounded-md border border-slate-200 px-2 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40`;
  const textbox=<div ref={root} role="textbox" aria-label="Custom rich text" aria-multiline="true" contentEditable suppressContentEditableWarning className={inlineTarget?'h-full w-full outline-none':compact?'min-h-9 max-h-32 overflow-auto rounded-md border border-slate-200 bg-white p-2 focus:outline-2 focus:outline-blue-600':'min-h-20 rounded-lg border border-slate-300 bg-white p-3 text-black focus:outline-2 focus:outline-blue-600'} style={{color:item.color??'black',backgroundColor:'white',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:item.fontSize,fontFamily:SHIPPING_FONTS[item.fontFamily??'auto'].family,fontWeight:item.bold?700:400,fontStyle:item.italic?'italic':'normal',textDecoration:'none',textAlign:item.justify?'justify':item.align,lineHeight:item.lineHeight??1.2,letterSpacing:`${item.letterSpacing??0}px`}}
        onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;capture();try{commit(shippingRunsFromDom(root.current!,defaults(item)));}catch(e){setError((e as Error).message);root.current!.innerHTML=shippingRichTextMarkup(runs,item.underline);restore();}}}
        onInput={()=>{if(composing.current)return;capture();try{const next=shippingRunsFromDom(root.current!,defaults(item));onChange({text:next.map(run=>run.text).join(''),richText:next});history.current.push({runs:normalizeShippingRuns(runs),selection:{...selection.current},marks:defaults(item)});if(history.current.length>50)history.current.shift();redo.current=[];setHistoryCounts({undo:history.current.length,redo:0});setError('');}catch(e){setError((e as Error).message);root.current!.innerHTML=shippingRichTextMarkup(runs,item.underline);restore();}}}
        onPaste={event=>{event.preventDefault();capture();try{
          const template=document.createElement('template'),html=event.clipboardData.getData('text/html');
          let pasted:ShippingTextRun[];if(html){template.innerHTML=html;pasted=shippingRunsFromDom(template.content,defaults(item));}else pasted=[{text:event.clipboardData.getData('text/plain'),...defaults(item)}];
          insertRuns(pasted);
        }catch(e){setError((e as Error).message);}}}
        onDrop={event=>{event.preventDefault();setError('Paste text into the editor to keep only supported formatting.');}}
        onKeyDown={event=>{
          if(composing.current||event.nativeEvent.isComposing){event.stopPropagation();return;}
          if(inlineTarget&&(event.key==='Escape'||((event.ctrlKey||event.metaKey)&&event.key==='Enter'))){event.preventDefault();event.stopPropagation();onFinish?.();return;}
          if(event.key==='Enter'){event.preventDefault();capture();const {start}=selection.current;const chosen=window.getSelection();if(chosen?.rangeCount){const range=chosen.getRangeAt(0);range.deleteContents();const text=document.createTextNode('\n');range.insertNode(text);selection.current={start:start+1,end:start+1};try{commit(shippingRunsFromDom(root.current!,defaults(item)),selection.current);}catch(e){setError((e as Error).message);}}return;}
          if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const key=event.key.toLowerCase();
          if(['b','i','u'].includes(key)){event.preventDefault();capture();const mark=({b:'bold',i:'italic',u:'underline'} as const)[key as 'b'|'i'|'u'];format({[mark]:!markAtSelection[mark]});}
          if(key==='z'||key==='y'){event.preventDefault();undo(event.shiftKey||key==='y');}
        }}/>
  const fontSizeTool=<label className="mx-1 text-[11px] text-slate-500">Font size<select aria-label="Rich text font size" value={markAtSelection.fontSize} onChange={event=>format({fontSize:Number(event.target.value)})} className={`mt-1 block ${compact?'h-9':'h-12'} rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900`}>{Array.from({length:31},(_,index)=>index+6).map(size=><option key={size} value={size} data-i18n-ignore="true">{size}{translateLabel(" px")}</option>)}</select></label>;
  return <div className={canvasTools?'flex flex-wrap items-end gap-3':'space-y-2'}>
    {compact&&(!canvasTools||inlineTarget)&&!toolsOnly&&editable&&(inlineTarget?<><div className="flex items-center justify-between gap-2 text-[10px] text-blue-600"><span>Editing on label · Esc to finish</span><button type="button" onClick={onFinish} className="rounded border border-blue-200 px-2 py-1">Done</button></div>{createPortal(textbox,inlineTarget)}</>:textbox)}
    {compact&&!canvasTools&&toolsOnly&&editable&&item.text&&<div className="rounded border border-slate-200 p-2 text-xs text-slate-600">{item.text}</div>}
    {compact&&<>{!canvasTools&&<p className="text-[10px] text-slate-500">Use {'{{ }}'} or {'{Customer name}'} for dynamic placeholders.</p>}{onInsertTag&&<select aria-label="Insert dynamic tag" value="" onChange={event=>insertTag(event.target.value)} className={`h-8 ${canvasTools?'w-44':'w-full'} rounded-md border border-slate-200 bg-white px-2 text-[11px]`}><option value="" disabled>Insert dynamic field…</option>{SHIPPING_TEXT_TAGS.map(({field,tag})=><option key={`${field}:${tag}`} value={tag}>{tag}</option>)}</select>}{!canvasTools&&<h4 className="border-t border-slate-200 pt-3 text-xs font-semibold">Text style</h4>}</>}
    {compact&&<div className={canvasTools?'flex items-end gap-3':'grid grid-cols-[minmax(0,1fr)_90px] items-end gap-3'}>{additionalTools}{fontSizeTool}</div>}
    <div role="toolbar" aria-label="Rich text formatting" className={compact?"flex flex-wrap items-center gap-2 text-slate-900":"flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-900"}>

      {([{key:'bold',name:'Bold',Icon:Bold},{key:'italic',name:'Italic',Icon:Italic},{key:'underline',name:'Underline',Icon:Underline}] as const).map(({key,name,Icon})=><button key={key} type="button" aria-label={name} title={name} aria-pressed={!!markAtSelection[key]} onPointerDown={event=>event.preventDefault()} onClick={()=>format({[key]:!markAtSelection[key]})} className={`${button} ${markAtSelection[key]?'border-blue-200 bg-blue-50 text-blue-600':''}`}><Icon size={21}/></button>)}
      {!compact&&fontSizeTool}
      {compact&&!canvasTools&&<span className="basis-full text-[10px] text-slate-500">Alignment</span>}
      {([{align:'left',Icon:AlignLeft},{align:'center',Icon:AlignCenter},{align:'right',Icon:AlignRight}] as const).map(({align,Icon})=><button type="button" key={align} aria-label={`Align ${align}`} aria-pressed={!item.justify&&item.align===align} onPointerDown={event=>event.preventDefault()} onClick={()=>onChange({align,justify:false})} className={`${button} ${!item.justify&&item.align===align?'border-blue-200 bg-blue-50 text-blue-600':''}`}><Icon size={21}/></button>)}
      <button type="button" aria-label="Align justify" aria-pressed={!!item.justify} onPointerDown={event=>event.preventDefault()} onClick={()=>onChange({justify:true})} className={`${button} ${item.justify?'border-blue-200 bg-blue-50 text-blue-600':''}`}><AlignJustify size={21}/></button>
      {editable&&<><button type="button" aria-label="Undo text edit" disabled={!historyCounts.undo} onPointerDown={event=>event.preventDefault()} onClick={()=>undo()} className={button}><Undo2 size={16}/></button><button type="button" aria-label="Redo text edit" disabled={!historyCounts.redo} onPointerDown={event=>event.preventDefault()} onClick={()=>undo(true)} className={button}><Redo2 size={16}/></button></>}
    </div>
    {!compact&&!toolsOnly&&(editable?<>
      <p className="text-xs leading-relaxed text-slate-500">Select text to format it, or format the whole field with no selection. Ctrl/Cmd+B, I or U also work.</p>
      {inlineTarget?<><div className="flex items-center justify-between gap-2 text-xs text-blue-600"><span>Editing on label · Esc to finish</span><button type="button" onClick={onFinish} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium">Done</button></div>{createPortal(textbox,inlineTarget)}</>:textbox}
    </>:<p className="text-xs leading-relaxed text-slate-500">{SHIPPING_FIELDS[item.field]} is a protected placeholder. The toolbar formats the whole field.</p>)}
    {!compact&&(onInsertTag||additionalTools)&&<details className="rounded-lg border border-slate-200 text-xs"><summary className="cursor-pointer px-3 py-2 font-medium text-slate-600">Fonts, dynamic tags & advanced</summary><div className="space-y-3 p-3">{additionalTools}{onInsertTag&&<label className="flex flex-wrap items-center gap-2 text-slate-500">Dynamic field<select aria-label="Insert dynamic tag" value="" onChange={event=>insertTag(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-slate-700"><option value="" disabled>Insert tag…</option>{SHIPPING_TEXT_TAGS.map(({field,tag})=><option key={`${field}:${tag}`} value={tag}>{tag}</option>)}</select></label>}</div></details>}
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
