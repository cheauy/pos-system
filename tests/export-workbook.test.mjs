import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const require=createRequire(import.meta.url);
const module={exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync('lib/exports/workbook.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(require,module,module.exports);
const {exportWorkbook}=module.exports;
test('Business Settings exports seven separate readable sheets in one workbook',async()=>{
 const tables=['businesses','business_locations','business_storefronts','business_receipt_settings','business_customer_settings','business_delivery_zones','business_tables'];
 const data=Object.fromEntries(tables.map((name,index)=>[name,index===6?[]:[{id:`id-${index}`,name:'សួស្តី',amount:12.5,active:true,details:{size:'M'},note:'=HYPERLINK("bad")'}]]));
 const result=await exportWorkbook(data);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(result,'base64'));
 assert.equal(wb.worksheets.length,7);assert.deepEqual(wb.worksheets.map(s=>s.name),tables);
 const sheet=wb.worksheets[0];assert.equal(sheet.getCell('B2').value,'សួស្តី');assert.equal(sheet.getCell('C2').value,12.5);assert.equal(sheet.getCell('D2').value,true);assert.equal(sheet.getCell('E2').value,'{"size":"M"}');assert.equal(sheet.getCell('F2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('F2').value,'=HYPERLINK("bad")');
 assert.equal(wb.worksheets[6].getCell('A1').value,'No records in this dataset');
});
test('sheet names remain unique and Excel limits produce clear errors rather than truncated values',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await exportWorkbook({['a'.repeat(35)]:[],['a'.repeat(34)+'b']:[]}), 'base64'));
 assert.equal(new Set(wb.worksheets.map(s=>s.name)).size,2);assert.ok(wb.worksheets.every(s=>s.name.length<=31));
 await assert.rejects(exportWorkbook({orders:[{note:'x'.repeat(32768)}]}),/Choose JSON/);
});
