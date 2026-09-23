import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,require){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m,m.exports,require);return m.exports;}
const exportsCatalog=load('lib/exports/catalog.ts');
const catalog=load('lib/exports/import-catalog.ts',()=>exportsCatalog);
const files=load('lib/exports/import-files.ts',()=>catalog);
test('CSV parser preserves quotes, Khmer, commas and embedded newlines',()=>{
 assert.deepEqual(files.parseCsv('\uFEFF"name","note"\r\n"ខ្មែរ","line 1\nline 2, ""quoted"""\r\n'),[['name','note'],['ខ្មែរ','line 1\nline 2, "quoted"']]);
 for(const invalid of ['a,b\n"broken', 'a,b\n"closed"text,x', 'a,b\nnot"valid,x'])assert.throws(()=>files.parseCsv(invalid));
});
test('downloaded templates contain headers only and never sample or existing records',()=>{
 for(const kind of Object.keys(catalog.csvImportTemplates)){
  const json=JSON.parse(files.recordsTemplate(kind,'json'));
  assert.deepEqual(json.records,[]);
  assert.deepEqual(files.parseCsv(files.recordsTemplate(kind,'csv')),[json.columns]);
  assert.throws(()=>files.recordsJsonToCsv(JSON.stringify(json),kind),/1 to 1,000/);
 }
 assert.deepEqual(files.parseCsv(files.emptyBackupCsvTemplate({products:['id','name','size'],categories:['id','name']})),[['dataset','__tenh_escaped','__tenh_nulls','id','name','size']]);
 assert.throws(()=>files.recordsJsonToCsv(files.recordsTemplate('suppliers','json'),'customers'),/another feature/);
 assert.throws(()=>files.recordsJsonToCsv(JSON.stringify([{name:'x',selling_price:{bad:true}}]),'products'),/plain values/);
 assert.throws(()=>files.recordsJsonToCsv(JSON.stringify([{name:'x',business_id:'other'}]),'customers'),/field names/);
});
test('backup CSV roundtrip preserves empty strings, nulls, formulas, phones, JSON and numeric text',()=>{
 const data={business_receipt_settings:[{business_id:'b',header_text:'',footer_text:null,phone:'+855123',title:"'=original",formula:'=SUM(1,2)',layout:{enabled:true},width:80}],orders:[]};
 const decoded=files.backupCsvRows(files.backupCsvTemplate(data),'all');
 assert.equal(decoded.business_receipt_settings[0].header_text,'');
 assert.equal(decoded.business_receipt_settings[0].footer_text,null);
 assert.equal(decoded.business_receipt_settings[0].phone,'+855123');
 assert.equal(decoded.business_receipt_settings[0].title,"'=original");
 assert.equal(decoded.business_receipt_settings[0].formula,'=SUM(1,2)');
 assert.equal(decoded.business_receipt_settings[0].layout,'{"enabled":true}');
 assert.equal(decoded.business_receipt_settings[0].width,'80');
 assert.deepEqual(decoded.orders,[]);
 assert.deepEqual(Object.keys(files.backupCsvRows(files.backupCsvTemplate(data),'orders')),['orders']);
 assert.throws(()=>files.backupCsvRows(files.backupCsvTemplate(data),'customers'),/selected feature/);
 assert.throws(()=>files.backupCsvRows('dataset,id\nauth_users,x','all'),/valid feature/);
 assert.throws(()=>files.backupCsvRows('dataset,name\nproducts,"\'=SUM(1)"','all'),/preserve/);
});
test('CSV rejects duplicate or missing headers and malformed row lengths',()=>{
 for(const csv of ['dataset,id,id\nproducts,1,2','dataset,\nproducts,1','dataset,id\nproducts,1,2'])assert.throws(()=>files.backupCsvRows(csv,'all'));
});
