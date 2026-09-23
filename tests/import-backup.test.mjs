import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,require){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m,m.exports,require);return m.exports;}
const catalog=load('lib/exports/catalog.ts');
const {parseImportBackup}=load('lib/exports/import-backup.ts',()=>catalog);
const business='business-1';
const source={version:2,businessId:business,tables:{products:1,customers:0},data:{products:[{id:'p',name:'Shirt'}],customers:[]}};
test('backup selection preserves exact datasets including empty datasets',()=>{
 assert.deepEqual(parseImportBackup(JSON.stringify(source),business),source.data);
 assert.deepEqual(parseImportBackup(JSON.stringify(source),business,['customers']),{customers:[]});
});
test('backup refuses foreign business, incomplete or unknown data and invalid selections',()=>{
 assert.throws(()=>parseImportBackup(JSON.stringify(source),'another-business'),/this business/);
 assert.throws(()=>parseImportBackup(JSON.stringify({...source,tables:{products:2,customers:0}}),business),/incomplete/);
 assert.throws(()=>parseImportBackup(JSON.stringify({...source,data:{profiles:[]}}),business),/unsupported/);
 for(const selected of [[],['products','products'],['orders']])assert.throws(()=>parseImportBackup(JSON.stringify(source),business,selected),/Select valid/);
 assert.throws(()=>parseImportBackup(JSON.stringify({...source,data:{products:[null]}}),business),/Invalid rows/);
});
test('backup enforces file and record limits before saving anything',()=>{
 assert.throws(()=>parseImportBackup(' '.repeat(10_000_001),business),/10 MB/);
 const rows=Array.from({length:20001},()=>({id:'x'}));
 assert.throws(()=>parseImportBackup(JSON.stringify({...source,tables:{products:rows.length},data:{products:rows}}),business),/20,000/);
});
