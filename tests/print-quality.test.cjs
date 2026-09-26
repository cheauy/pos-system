const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {loadTs}=require('./helpers/load-ts.cjs');
const {preparePrint,imagePrintDpi,sizeReceiptPage}=loadTs('lib/printing/prepare-print.ts');
test('receipt page length grows with full content and preserves preview styles',()=>{
 const receipt={dataset:{paper:'80mm'},scrollHeight:1200,offsetHeight:1200,getAttribute:()=> '--receipt-font-scale:1.2',setAttribute:(key,value)=>restored=value,style:{setProperty:(key,value)=>changes[key]=value}};
 let restored,added;const changes={};const doc={getElementById:()=>added,createElement:()=>({}),head:{appendChild:node=>added=node}};
 sizeReceiptPage(doc,receipt);assert.equal(changes.width,'74mm');assert.equal(restored,'--receipt-font-scale:1.2');assert.match(added.textContent,/size:80mm 326mm/);
 receipt.scrollHeight=1800;sizeReceiptPage(doc,receipt);assert.match(added.textContent,/size:80mm 485mm/);
});
test('printing waits for original image decoding and fonts, including hidden label images',async()=>{
 let decode,fonts,ready=false;
 const content={querySelectorAll:s=>s==='img'?[{naturalWidth:600,decode:()=>new Promise(done=>decode=done)}]:[]};
 const doc={querySelector:()=>content,fonts:{ready:new Promise(done=>fonts=done)}};
 const pending=preparePrint(doc,'#barcode-print-area').then(()=>ready=true);
 await Promise.resolve();assert.equal(ready,false);decode();await Promise.resolve();assert.equal(ready,false);fonts();await pending;assert.equal(ready,true);
});
test('failed logo or QR image blocks printing rather than silently omitting it',async()=>{
 const doc={querySelector:()=>({querySelectorAll:s=>s==='[data-print-image-error]'?[{}]:[]}),fonts:{ready:Promise.resolve()}};
 await assert.rejects(preparePrint(doc,'.receipt'),/image could not load/);
 doc.querySelector=()=>({querySelectorAll:s=>s==='img'?[{naturalWidth:0,decode:async()=>{throw Error('missing');}}]:[]});
 await assert.rejects(preparePrint(doc,'.receipt'),/image or font could not load/);
});
test('resolution estimate uses physical size, not browser zoom or fictitious upscaling',()=>{
 assert.equal(imagePrintDpi(600,300,40,20),381);assert.equal(imagePrintDpi(600,600,26,26),586);assert.ok(imagePrintDpi(100,100,26,26)<300);assert.equal(imagePrintDpi(0,0,26,26),0);
});
test('QR uses crisp edges, barcode vectors remain vectors, and printable text is solid black',()=>{
 const css=fs.readFileSync('components/receipts/pos-receipt.module.css','utf8');assert.match(css,/\.qrImage\{image-rendering:crisp-edges\}/);
 assert.match(css,/\.qrImage\{[^}]*width:80mm;max-width:100%;height:auto;aspect-ratio:1/);
 assert.match(fs.readFileSync('app/(dashboard)/dashboard/settings/receipts/receipt-settings-editor.tsx','utf8'),/target size: 80 × 80 mm/i);
 for(const path of ['components/receipts/pos-receipt.tsx','components/receipts/shipping-canvas.tsx','app/(dashboard)/dashboard/barcodes/barcode-labels-client.tsx','app/(dashboard)/dashboard/shipping-labels/shipping-labels-client.tsx'])assert.match(fs.readFileSync(path,'utf8'),/<svg shapeRendering="crispEdges"/);
 assert.match(fs.readFileSync('app/globals.css','utf8'),/print-color-adjust: exact/);
});
