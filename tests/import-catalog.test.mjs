import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,require){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m,m.exports,require);return m.exports;}
const exportsCatalog=load('lib/exports/catalog.ts');
const catalog=load('lib/exports/import-catalog.ts',()=>exportsCatalog);
test('Import uses exactly the same groups and datasets as Export',()=>{
 assert.deepEqual(catalog.allImportTables,exportsCatalog.exportGroups.flatMap(group=>group.tables));
 for(const table of catalog.allImportTables)assert.ok(catalog.importDatasetLabel(table));
});
test('Each add-record template has matching columns, examples and match guidance',()=>{
 for(const [kind,template] of Object.entries(catalog.csvImportTemplates)){
  const [header,example]=template.csv.trim().split('\n');
  assert.equal(header.split(',').length,example.split(',').length);
  assert.ok(template.help);assert.ok(template.match);
  assert.equal(catalog.csvKindForTable(template.table),kind);
  assert.ok(catalog.allImportTables.includes(template.table));
 }
 assert.equal(catalog.csvKindForTable('orders'),undefined);
 assert.equal(catalog.csvKindForTable('audit_logs'),undefined);
});
