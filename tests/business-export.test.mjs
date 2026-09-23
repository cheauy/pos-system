import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const m={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync('lib/exports/catalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m,m.exports);
const {exportGroups,selectedExportTables,sanitizeExport,exportCsv}=m.exports;
test('export groups include only current choices within the database allowlist',()=>{
 const tables=exportGroups.flatMap(g=>g.tables);assert.equal(tables.length,new Set(tables).size);
 const sql=readFileSync('supabase/migrations/20260923210000_business_export.sql','utf8');const allowed=[...sql.match(/allowed text\[\]:=array\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.ok(tables.every(table=>allowed.includes(table)));
 for(const name of ['order_items','return_items','purchase_items','product_variants'])assert.ok(tables.includes(name));
 assert.deepEqual(exportGroups.find(g=>g.id==='activity').tables,['audit_logs','business_activity_history']);
 assert.ok(!tables.includes('business_member_permissions'));assert.ok(!tables.includes('subscription_orders'));
});
test('dataset selection exports exactly checked items and rejects hidden or unrelated datasets',()=>{
 assert.deepEqual(selectedExportTables(['business'],['business_locations']),['business_locations']);
 assert.deepEqual(selectedExportTables(['activity'],['audit_logs']),['audit_logs']);
 assert.deepEqual(selectedExportTables(['activity']),['audit_logs','business_activity_history']);
 assert.throws(()=>selectedExportTables(['business'],[]));
 assert.throws(()=>selectedExportTables(['business'],['orders']));
 assert.throws(()=>selectedExportTables(['team']));
 assert.throws(()=>selectedExportTables(['activity'],['business_notifications']));
 const all=selectedExportTables(exportGroups.map(g=>g.id));assert.ok(!all.includes('subscription_orders'));assert.ok(!all.includes('profiles'));
});
test('exports preserve business records but recursively remove credentials',()=>{
 assert.deepEqual(sanitizeExport({orders:[{id:'one',total:12,payment_token:'secret',details:{api_key:'secret',name:'Sok'}}],password_hash:'secret'}),{orders:[{id:'one',total:12,details:{name:'Sok'}}]});
});
test('CSV separates datasets, preserves nested data and neutralizes spreadsheet formulas',()=>{
 const csv=exportCsv({products:[{name:'=IMPORTXML("bad")',price:4,details:{size:'M'}}],orders:[{id:'1',total:9}]});
 assert.ok(csv.includes('"dataset"'));assert.ok(csv.includes('"\'=IMPORTXML'));assert.ok(csv.includes('"products"'));assert.ok(csv.includes('"orders"'));assert.ok(csv.includes('{""size"":""M""}'));
});
