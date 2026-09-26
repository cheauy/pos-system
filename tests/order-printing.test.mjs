import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {loadTs}=require('./helpers/load-ts.cjs');
const printPreparation=loadTs('lib/printing/prepare-print.ts');
const source=readFileSync(new URL('../components/print-button.tsx',import.meta.url),'utf8');
function button(content,fonts=Promise.resolve()) {
 const errors=[]; let prints=0;
 const deps={react:{useRef:()=>({current:false}),useState:initial=>[initial,value=>{if(typeof value==='string'&&value)errors.push(value);}]},'lucide-react':{Printer:()=>null},'@/lib/printing/prepare-print':printPreparation};
 const module={exports:{}};
 const {outputText}=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
 new Function('require','module','exports',outputText)(id=>deps[id]??require(id),module,module.exports);
 globalThis.document={querySelector:()=>content,fonts:{ready:fonts}};
 globalThis.window={document:globalThis.document,focus:()=>{},print:()=>prints++};
 const tree=module.exports.default({});
 return {click:tree.props.children[0].props.onClick,errors,prints:()=>prints};
}
test('print waits for fonts and images, suppresses duplicate clicks',async()=>{
 let ready;const fonts=new Promise(resolve=>ready=resolve);let decoded=false;
 const b=button({querySelectorAll:selector=>selector==='img'?[{decode:async()=>{decoded=true;},naturalWidth:600}]:[]},fonts);
 const first=b.click();await b.click();assert.equal(b.prints(),0);ready();await first;assert.equal(decoded,true);assert.equal(b.prints(),1);
});
test('missing preview never opens printer dialog',async()=>{const b=button(null);await b.click();assert.equal(b.prints(),0);assert.match(b.errors[0],/unavailable/);});
test('broken uploaded logo blocks printing',async()=>{const b=button({querySelectorAll:()=>[{decode:async()=>{throw Error('broken');}}]});await b.click();assert.equal(b.prints(),0);assert.match(b.errors[0],/could not load/);});
test('oversize shipping label blocks printing instead of clipping address',async()=>{const b=button({querySelectorAll:selector=>selector==='.shipping-label'?[{dataset:{widthMm:'80',heightMm:'50'},getBoundingClientRect:()=>({width:320,height:300})}]:[]});await b.click();assert.equal(b.prints(),0);assert.match(b.errors[0],/too long/);});
