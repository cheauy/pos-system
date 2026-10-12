/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic offline regression tests. */
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const {BitArray,Code128Reader}=require('@zxing/library');
const code=loadTs('lib/barcode/code128.ts');
test('enabled new-code policy is numeric; legacy label rendering preserves exact alphanumeric text',()=>{
 for(const value of ['ABC123','abc123','SKU_1','A B','12','1'.repeat(21)])assert.ok(code.validateNewProductBarcode(value));
 for(const value of ['000123','000000123456789','1'.repeat(20)])assert.equal(code.validateNewProductBarcode(value),null);
 const legacy=loadTs('lib/barcode/code39.ts'),labels=loadTs('lib/barcode/product-label.ts',{'./code39':legacy,'./code128':code});
 assert.equal(labels.productLabelGeometry('ABC123','50x30').format,'CODE_39');
 assert.equal(labels.productLabelGeometry('ABC123','50x30',false,false,true).text,'ABC123');
 assert.equal(labels.productLabelGeometry('ABC123','50x30',false,false,true).format,'CODE_128');
 assert.throws(()=>labels.productLabelGeometry('abc_123','50x30'),/uppercase|unsupported/);
 assert.equal(labels.productLabelGeometry('abc_123','50x30',false,false,true).text,'abc_123');
});
test('numeric Code39 receipt output fits 58mm paper and decodes through the native-compatible symbology',async()=>{
 const z=require('@zxing/library'),sharp=require('sharp'),{code39PrintGeometry}=loadTs('lib/barcode/code39.ts');
 for(const dpi of [203,300]){
  const symbol=code39PrintGeometry('123456789012',52);assert.ok(symbol.widthMm<=52);assert.equal(symbol.bars[0].x,20);const last=symbol.bars.at(-1);assert.equal(symbol.width-last.x-last.width,20);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${symbol.widthMm}mm" height="8mm" viewBox="0 0 ${symbol.width} 44" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${symbol.width}" height="44" fill="white"/>${symbol.bars.map(bar=>`<rect x="${bar.x}" width="${bar.width}" height="44" fill="black"/>`).join('')}</svg>`;
  const {data,info}=await sharp(Buffer.from(svg),{density:dpi}).flatten({background:'white'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const decoded=new z.Code39Reader().decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height))));assert.equal(decoded.getText(),'123456789012');
 }
});
test('default-off 50mm Code39 labels decode generated numeric strings with leading zeros at 203/300dpi',async()=>{
 const z=require('@zxing/library'),sharp=require('sharp'),legacy=loadTs('lib/barcode/code39.ts');
 const labels=loadTs('lib/barcode/product-label.ts',{'./code39':legacy,'./code128':code});
 const value='000000123456789',symbol=labels.productLabelGeometry(value,'50x30');
 assert.equal(symbol.format,'CODE_39');assert.equal(symbol.text,value);assert.equal(symbol.bars[0].x,20);
 for(const dpi of [203,300]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${symbol.widthMm}mm" height="${symbol.heightMm}mm" viewBox="0 0 ${symbol.width} 44" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${symbol.width}" height="44" fill="white"/>${symbol.bars.map(bar=>`<rect x="${bar.x}" width="${bar.width}" height="44" fill="black"/>`).join('')}</svg>`;
  const {data,info}=await sharp(Buffer.from(svg),{density:dpi}).greyscale().raw().toBuffer({resolveWithObject:true});
  const result=new z.Code39Reader().decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height))));assert.equal(result.getText(),value);
 }
});
test('enabled imports distinguish exact legacy values from new or replaced values',async()=>{
 const {importedBarcodeIssue}=loadTs('lib/barcode/import-policy.ts',{'./code128':code});
 const db={from(){const query={};for(const method of ['select','eq','in','or'])query[method]=()=>query;query.then=(ok,fail)=>Promise.resolve({data:[{id:'saved',sku:'SKU_1',barcode:'LEGACY_00'}],error:null}).then(ok,fail);return query;}};
 assert.equal(await importedBarcodeIssue(db,'business',[{sku:'SKU_1',barcode:'LEGACY_00'}]),null);
 assert.match(await importedBarcodeIssue(db,'business',[{sku:'SKU_1',barcode:'REPLACED'}]),/numeric strings/);
 assert.match(await importedBarcodeIssue(db,'business',[{sku:'NEW',barcode:'LEGACY_00'}]),/numeric strings/);
 assert.equal(await importedBarcodeIssue(db,'business',[{sku:'NEW',barcode:'000000123456789'}]),null);
});
test('fixed mm SVGs decode after rasterization at 203 and 300 dpi without shrinking quiet zones',async()=>{
 const sharp=require('sharp'),z=require('@zxing/library');
 for(const dpi of [203,300])for(const value of ['000012345678901','123456789012','SKU_1','abc123']){
  const symbol=code.barcodeGeometry(value,74),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${symbol.widthMm}mm" height="8mm" viewBox="0 0 ${symbol.width} 44" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${symbol.width}" height="44" fill="white"/>${symbol.bars.map(bar=>`<rect x="${bar.x}" y="0" width="${bar.width}" height="44" fill="black"/>`).join('')}</svg>`;
  const {data,info}=await sharp(Buffer.from(svg),{density:dpi}).flatten({background:'white'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const source=new z.RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height),reader=new z.Code128Reader();
  assert.equal(reader.decode(new z.BinaryBitmap(new z.HybridBinarizer(source))).getText(),value,`${dpi}dpi ${value}`);
 }
});
test('Code 128 round-trips exact text and leading zeros using independent ZXing decoding',()=>{
 for(const value of ['0','00','000012345678901','123456789012','abc123','SKU_1','A*B','A B','01ABC_09','1'.repeat(80)]){
  const symbol=code.code128Bars(value),row=new BitArray(symbol.width*2);
  for(const bar of symbol.bars)for(let x=bar.x*2;x<(bar.x+bar.width)*2;x++)row.set(x);
  assert.equal(new Code128Reader().decodeRow(0,row,null).getText(),value);
  assert.equal(symbol.text,value);assert.equal(symbol.bars[0].x,10);
  const last=symbol.bars.at(-1);assert.equal(symbol.width-last.x-last.width,10);
 }
});
test('physical geometry uses two dots per module at 203 dpi and refuses undersized labels',()=>{
 for(const size of ['40x20','50x30','80x50']){const symbol=code.productBarcodeGeometry('123456789012',size);assert.ok(Math.abs(symbol.widthMm-symbol.width*2*25.4/203)<1e-10);assert.equal(symbol.heightMm,8);}
 assert.throws(()=>code.productBarcodeGeometry('000012345678901','40x20'),/wider label/);
 assert.doesNotThrow(()=>code.productBarcodeGeometry('000012345678901','50x30'));
 assert.throws(()=>code.productBarcodeGeometry('A'.repeat(40),'80x50'),/will not be shortened/);
});
test('invalid new text is rejected without converting, trimming or replacing it',()=>{
 for(const value of [123,'',' 0001','0001 ','\t0001','123\n4','é','1'.repeat(81)]){assert.ok(code.validateBarcode(value));assert.throws(()=>code.code128Bars(value));}
 for(const value of ['abc','SKU_1','00001','A B'])assert.equal(code.validateBarcode(value),null);
});
test('capability is default-off and schema absence disables the complete new flow',async()=>{
 const ts=require('typescript'),fs=require('node:fs');
 const compiled=ts.transpileModule(fs.readFileSync('lib/barcode/require-contract.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const loadGate=env=>{const exports={};new Function('process','exports',compiled)({env},exports);return exports.barcodePreservationEnabled;};
 for(const env of [{},{TENH_BARCODE_PRESERVATION:'0'},{TENH_BARCODE_PRESERVATION:'true'}])assert.equal(await loadGate(env)({rpc(){throw Error('Default-off must not query the contract');}}),false);
 const enabled=loadGate({TENH_BARCODE_PRESERVATION:'1'});
 for(const response of [{data:null,error:{code:'PGRST202'}},{data:false,error:null},{data:true,error:{message:'failure'}}])await assert.rejects(enabled({rpc:async()=>response}),/verification is unavailable/);
 await assert.rejects(enabled({rpc:async()=>{throw Error('Unavailable');}}),/verification is unavailable/);
 assert.equal(await enabled({rpc:async()=>({data:true,error:null})}),true);
});
test('missing numeric order identifiers block print and previous receipt page sizing is cleared for labels',async()=>{
 const {preparePrint}=loadTs('lib/printing/prepare-print.ts',{'@/lib/receipts/shipping-layout':loadTs('lib/receipts/shipping-layout.ts')});
 await assert.rejects(preparePrint({querySelector:()=>({querySelectorAll:()=>[{}]})},'.receipt'),/sale is already saved/);
 let removed=false;const label={};
 const content={querySelectorAll:()=>[],querySelector:selector=>selector==='.barcode-label'?label:null};
 await preparePrint({querySelector:()=>content,fonts:{ready:Promise.resolve()},getElementById:()=>({remove(){removed=true;}})},'#barcode-print-area');assert.equal(removed,true);
});
test('imports require text identifiers and preserve raw zeros without normalizing them',()=>{
 const catalog=loadTs('lib/exports/import-catalog.ts',{'./catalog':loadTs('lib/exports/catalog.ts')});
 const {recordsJsonToCsv,parseCsv}=loadTs('lib/exports/import-files.ts',{'./import-catalog':catalog});
 assert.throws(()=>recordsJsonToCsv(JSON.stringify([{name:'Fixture',sku:'S',barcode:123}]),'products'),/strings/);
 const csv=recordsJsonToCsv(JSON.stringify([{name:'Fixture',sku:'S',barcode:'000123'}]),'products'),rows=parseCsv(csv);assert.equal(rows[1][rows[0].indexOf('barcode')],'000123');
});
test('receipt barcode uses only its immutable numeric order code and refuses a display-number fallback',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),model=loadTs('lib/receipts/receipt-model.ts');
 const {PosReceipt}=loadTs('components/receipts/pos-receipt.tsx',{react:React,'react/jsx-runtime':require('react/jsx-runtime'),'@/lib/barcode/code39':loadTs('lib/barcode/code39.ts'),'@/lib/receipts/receipt-model':model,'@/app/(dashboard)/dashboard/pos/pos-workspace-helpers':{money:value=>String(value)},'./pos-receipt.module.css':{default:{}},'@/components/providers/language-provider':{useLanguage:()=>({t:value=>value})}});
 const sample={...model.receiptSample('Fixture'),orderNumber:'POS-ABC123',orderCode:'123456789012'};
 const rendered=renderToStaticMarkup(React.createElement(PosReceipt,{receipt:sample}));assert.match(rendered,/Order barcode 123456789012/);assert.match(rendered,/fill="white"/);assert.match(rendered,/height:8mm/);
 for(const orderCode of [undefined,'POS-ABC123','012345678901']){const html=renderToStaticMarkup(React.createElement(PosReceipt,{receipt:{...sample,orderCode}}));assert.match(html,/data-print-barcode-error/);assert.ok(!html.includes('<svg'));}
});
