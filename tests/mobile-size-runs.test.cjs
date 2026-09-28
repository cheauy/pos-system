const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('management.tsx',fs.readFileSync('mobile/src/management.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='appendSizeRun');
const js=ts.transpileModule(fn.getText(file).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const run=new Function(js+';return appendSizeRun;')();
const seed={sku:'TEE',barcode:'one',price:'12',cost:'5',lowStock:'3',size:'',color:'Blue'};
test('size runs copy price and colour, clear barcodes and generate individual SKUs',()=>{
 const rows=run([seed],['S','M','L']);
 assert.deepEqual(rows.map(row=>row.sku),['TEE-S','TEE-M','TEE-L']);
 assert.ok(rows.every(row=>row.color==='Blue'&&row.price==='12'&&row.cost==='5'&&row.barcode===''));
 assert.equal(seed.size,'');assert.deepEqual(run(rows,['S','M','L']),rows);
});
test('size runs preserve other colours and reject overflow without truncating input',()=>{
 const rows=[{...seed,size:'S'},{...seed,size:'S',color:'Red'}];
 assert.equal(run(rows,['S','M']).length,3);
 assert.throws(()=>run([seed],Array.from({length:41},(_,i)=>String(i))),/40 variants/);
});
