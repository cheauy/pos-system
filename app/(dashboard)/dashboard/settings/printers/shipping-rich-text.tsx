"use client";

import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { formatShippingRuns, normalizeShippingRuns, SHIPPING_FIELDS, type ShippingElement, type ShippingTextMarks, type ShippingTextRun } from '@/lib/receipts/shipping-layout';
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

export default function ShippingRichText({item,onChange}:{item:ShippingElement;onChange:(patch:Partial<ShippingElement>)=>void}) {
  const editable=item.field==='text';
  const root=useRef<HTMLDivElement>(null), selection=useRef<TextSelection>({start:0,end:0}), composing=useRef(false);
  const [chosenRange,setChosenRange]=useState<TextSelection>({start:0,end:0}),[error,setError]=useState('');
  const hasSelection=chosenRange.start!==chosenRange.end;
  const runs=item.richText||[{text:item.text,...defaults(item)}];
  const history=useRef<{runs:ShippingTextRun[];selection:TextSelection}[]>([]),redo=useRef<typeof history.current>([]);
  function capture(){
    const node=root.current,chosen=window.getSelection();if(!node||!chosen?.rangeCount)return;
    const range=chosen.getRangeAt(0);if(!node.contains(range.startContainer)||!node.contains(range.endContainer))return;
    const before=range.cloneRange();before.selectNodeContents(node);before.setEnd(range.startContainer,range.startOffset);
    selection.current={start:before.toString().length,end:before.toString().length+range.toString().length};setChosenRange(previous=>previous.start===selection.current.start&&previous.end===selection.current.end?previous:{...selection.current});
  }
  function restore(value=selection.current){
    const node=root.current;if(!node)return;
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);const points:Array<{node:Node;start:number;end:number}>=[];let offset=0;
    while(walker.nextNode()){const text=walker.currentNode;points.push({node:text,start:offset,end:offset+(text.textContent?.length||0)});offset+=text.textContent?.length||0;}
    const locate=(at:number)=>{const clamped=Math.min(offset,Math.max(0,at));return points.find(point=>clamped<=point.end)||points[points.length-1];};
    const start=locate(value.start),end=locate(value.end),range=document.createRange();
    if(start&&end){range.setStart(start.node,Math.min(value.start-start.start,start.end-start.start));range.setEnd(end.node,Math.min(value.end-end.start,end.end-end.start));}else range.selectNodeContents(node);
    node.focus();const chosen=window.getSelection();chosen?.removeAllRanges();chosen?.addRange(range);capture();
  }
  function commit(next:ShippingTextRun[],value=selection.current,record=true){
    const normalized=normalizeShippingRuns(next);
    if(record){history.current.push({runs:normalizeShippingRuns(runs),selection:{...selection.current}});if(history.current.length>50)history.current.shift();redo.current=[];}
    if(root.current)root.current.innerHTML=shippingRichTextMarkup(normalized);
    selection.current=value;onChange({text:normalized.map(run=>run.text).join(''),richText:normalized});setError('');restore(value);
  }
  useEffect(()=>{
    const node=root.current;if(!node||composing.current)return;
    const html=shippingRichTextMarkup(runs);if(node.innerHTML!==html){const focused=node.contains(document.activeElement);node.innerHTML=html;if(focused)restore();}
  });
  useEffect(()=>{document.addEventListener('selectionchange',capture);return()=>document.removeEventListener('selectionchange',capture);},[]);
  function format(patch:ShippingTextMarks){
    if(!editable){onChange(patch);return;}
    if(selection.current.start===selection.current.end){setError('Select text to format it.');return;}
    commit(formatShippingRuns(runs,selection.current.start,selection.current.end,patch));
  }
  const markAtSelection=(()=>{let offset=0;for(const run of runs){offset+=run.text.length;if(offset>chosenRange.start)return {...defaults(item),...run};}return defaults(item);})();
  const button='inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40';
  return <div className="space-y-2">
    <div role="toolbar" aria-label="Rich text formatting" className="flex flex-wrap items-center gap-1 rounded-lg border bg-slate-50 p-2 text-slate-900">
      {([{key:'bold',name:'Bold',Icon:Bold},{key:'italic',name:'Italic',Icon:Italic},{key:'underline',name:'Underline',Icon:Underline}] as const).map(({key,name,Icon})=><button key={key} type="button" aria-label={name} title={name} aria-pressed={!!markAtSelection[key]} disabled={editable&&!hasSelection} onPointerDown={event=>event.preventDefault()} onClick={()=>format({[key]:!markAtSelection[key]})} className={button}><Icon size={17}/></button>)}
      <label className="flex items-center gap-1 text-xs">Font size<select aria-label="Rich text font size" value={markAtSelection.fontSize} disabled={editable&&!hasSelection} onChange={event=>format({fontSize:Number(event.target.value)})} className="h-9 rounded-md border bg-white px-1">{Array.from({length:31},(_,index)=>index+6).map(size=><option key={size} value={size}>{size} px</option>)}</select></label>
      {([{align:'left',Icon:AlignLeft},{align:'center',Icon:AlignCenter},{align:'right',Icon:AlignRight}] as const).map(({align,Icon})=><button type="button" key={align} aria-label={`Align ${align}`} aria-pressed={item.align===align} onPointerDown={event=>event.preventDefault()} onClick={()=>onChange({align})} className={button}><Icon size={17}/></button>)}
    </div>
    {editable?<>
      <p className="text-xs text-slate-500">Select text below to format it. Ctrl/Cmd+B, I or U also work. Alignment applies to this text block.</p>
      <div ref={root} role="textbox" aria-label="Custom rich text" aria-multiline="true" contentEditable suppressContentEditableWarning className="min-h-24 rounded-lg border bg-white p-3 text-slate-900 focus:outline-2 focus:outline-blue-600" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:item.fontSize,fontWeight:item.bold?700:400,fontStyle:item.italic?'italic':'normal',textDecoration:'none',textAlign:item.align}}
        onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;capture();try{commit(shippingRunsFromDom(root.current!,defaults(item)));}catch(e){setError((e as Error).message);root.current!.innerHTML=shippingRichTextMarkup(runs);restore();}}}
        onInput={()=>{if(composing.current)return;capture();try{const next=shippingRunsFromDom(root.current!,defaults(item));onChange({text:next.map(run=>run.text).join(''),richText:next});history.current.push({runs:normalizeShippingRuns(runs),selection:{...selection.current}});if(history.current.length>50)history.current.shift();redo.current=[];setError('');}catch(e){setError((e as Error).message);root.current!.innerHTML=shippingRichTextMarkup(runs);restore();}}}
        onPaste={event=>{event.preventDefault();capture();try{
          const template=document.createElement('template'),html=event.clipboardData.getData('text/html');
          let pasted:ShippingTextRun[];if(html){template.innerHTML=html;pasted=shippingRunsFromDom(template.content,defaults(item));}else pasted=[{text:event.clipboardData.getData('text/plain'),...defaults(item)}];
          const {start,end}=selection.current;let offset=0;const before:ShippingTextRun[]=[],after:ShippingTextRun[]=[];
          for(const run of runs){if(offset<start)before.push({...run,text:run.text.slice(0,Math.max(0,start-offset))});if(offset+run.text.length>end)after.push({...run,text:run.text.slice(Math.max(0,end-offset))});offset+=run.text.length;}
          const caret=start+pasted.reduce((sum,run)=>sum+run.text.length,0);commit([...before,...pasted,...after],{start:caret,end:caret});
        }catch(e){setError((e as Error).message);}}}
        onDrop={event=>{event.preventDefault();setError('Paste text into the editor to keep only supported formatting.');}}
        onKeyDown={event=>{
          if(event.key==='Enter'){event.preventDefault();capture();const {start}=selection.current;const chosen=window.getSelection();if(chosen?.rangeCount){const range=chosen.getRangeAt(0);range.deleteContents();const text=document.createTextNode('\n');range.insertNode(text);selection.current={start:start+1,end:start+1};try{commit(shippingRunsFromDom(root.current!,defaults(item)),selection.current);}catch(e){setError((e as Error).message);}}return;}
          if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const key=event.key.toLowerCase();
          if(['b','i','u'].includes(key)){event.preventDefault();capture();const mark=({b:'bold',i:'italic',u:'underline'} as const)[key as 'b'|'i'|'u'];format({[mark]:!markAtSelection[mark]});}
          if(key==='z'||key==='y'){event.preventDefault();const forward=event.shiftKey||key==='y',from=forward?redo.current:history.current,to=forward?history.current:redo.current;const previous=from.pop();if(previous){to.push({runs:normalizeShippingRuns(runs),selection:{...selection.current}});commit(previous.runs,previous.selection,false);}}
        }}/>
    </>:<p className="text-xs text-slate-500">{SHIPPING_FIELDS[item.field]} is a protected placeholder. Its value fills automatically when printed; the toolbar formats the whole field.</p>}
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
