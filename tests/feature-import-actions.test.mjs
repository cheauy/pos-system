import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const realRequire = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', 'require', output)(loaded, loaded.exports, id => dependencies[id] ?? realRequire(id));
  return loaded.exports;
}
const exportCatalog = load('lib/exports/catalog.ts');
const catalog = load('lib/exports/import-catalog.ts', { './catalog': exportCatalog });
const files = load('lib/exports/import-files.ts', { './import-catalog': catalog });
const backupParser = load('lib/exports/import-backup.ts', { './catalog': exportCatalog });

function setup(productMode = 'variant') {
  const business = { id: 'business-1', role: 'owner', productMode, product_mode: productMode };
  const backup = { version: 2, businessId: business.id, tables: { products: 1 }, data: { products: [{ id: 'product-1', business_id: business.id, name: 'Shirt', sku: 'SHIRT-M-BLUE', size: 'M', color: 'Blue', product_type: 'variant', variant_group_id: 'group-1' }] } };
  const calls = { preview: [], commit: [], restore: [], template: [], rpc: [] };
  const state = { preview: { ok: true, fingerprint: 'preview-fingerprint', errors: [], inserted: 1, updated: 0, skipped: 0 }, commit: { ok: true, inserted: 1, updated: 0, skipped: 0 }, authError: null, restoreError: null };
  const actions = load('app/(dashboard)/dashboard/exports/feature-import-actions.ts', {
    '@/lib/auth/require-permission': { requirePermission: async () => { if (state.authError) throw state.authError; return business; } },
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async (...args) => { calls.rpc.push(args); return { data: args[1].p_payload, error: null }; } }) },
    '@/lib/exports/import-catalog': catalog,
    '@/lib/exports/import-files': files,
    '@/lib/exports/import-backup': backupParser,
    './actions': {
      previewCsvImport: async (...args) => { calls.preview.push(args); return state.preview; },
      commitCsvImport: async (...args) => { calls.commit.push(args); return state.commit; },
    },
    './import-actions': {
      downloadImportTemplate: async (...args) => { calls.template.push(args); return { content: JSON.stringify({...backup,tables:{products:0},data:{products:[]},columns:{products:Object.keys(backup.data.products[0])}}) }; },
      importBackup: async (...args) => { calls.restore.push(args); if (state.restoreError) throw state.restoreError; return { inserted: 0, updated: 1, skipped: 0, rowCount: 1, fingerprint: 'backup-fingerprint' }; },
    },
  });
  return { actions, calls, state, backup };
}

test('reported standard CSV in variant/configurable mode returns guidance, never throws or writes', async () => {
  for (const mode of ['variant', 'configurable']) {
    const { actions, calls } = setup(mode);
    for (const format of ['csv', 'json']) {
      const text = files.recordsTemplate('products', format);
      const inspection = await actions.inspectFeatureImport('products', text, format);
      assert.equal(inspection.ok, false); assert.match(inspection.message, /Download a new Products template/);
      const result = await actions.runFeatureImport('products', text, format, 'insert');
      assert.equal(result.ok, false); assert.match(result.message, /Add new products in Products/);
    }
    assert.deepEqual(calls.preview, []); assert.deepEqual(calls.commit, []); assert.deepEqual(calls.rpc, []);
  }
});

test('non-standard stores download blank templates with variant columns, not saved products', async () => {
  for (const mode of ['variant', 'configurable']) {
    const { actions, calls, backup } = setup(mode);
    for (const format of ['json', 'csv']) {
      const result = await actions.getFeatureTemplate('products', format);
      assert.equal(result.ok, true);
      assert.ok(!result.data.content.includes('SHIRT-M-BLUE'));
      if (format === 'json') { const template=JSON.parse(result.data.content); assert.deepEqual(template.data.products,[]); assert.ok(template.columns.products.includes('variant_group_id')); }
      else {
        const matrix = files.parseCsv(result.data.content); assert.equal(matrix.length,1); assert.ok(matrix[0].includes('variant_group_id'));
      }
      const review = await actions.runFeatureImport('products', format === 'json' ? JSON.stringify(backup) : files.backupCsvTemplate(backup.data), format, 'update');
      assert.equal(review.ok, true); assert.equal(review.data.updated, 1);
    }
    assert.equal(calls.template.length, 2); assert.equal(calls.restore.length, 2); assert.equal(calls.preview.length, 0);
  }
});

test('standard product imports and other features keep their existing add-record flow', async () => {
  const { actions, calls } = setup('standard');
  for (const kind of ['products', 'customers', 'suppliers', 'inventory']) {
    const feature = catalog.csvImportTemplates[kind].table;
    const template = await actions.getFeatureTemplate(feature, 'json');
    assert.equal(template.ok, true); assert.equal(JSON.parse(template.data.content).entity, kind);
    const [headers,values]=files.parseCsv(catalog.csvImportTemplates[kind].csv);
    const filled=JSON.parse(template.data.content); filled.records=[Object.fromEntries(headers.map((key,index)=>[key,values[index]]))];
    const result = await actions.runFeatureImport(feature, JSON.stringify(filled), 'json', 'insert');
    assert.equal(result.ok, true); assert.equal(result.data.inserted, 1);
  }
  assert.equal(calls.preview.length, 4); assert.equal(calls.template.length, 0);
  const nonStandard = setup('variant');
  assert.equal((await nonStandard.actions.getFeatureTemplate('customers', 'csv')).ok, true);
  assert.equal(nonStandard.calls.template.length, 0);
});

test('preview, commit, malformed-file and restore errors are structured results', async () => {
  const { actions, state } = setup('standard');
  const csv = catalog.csvImportTemplates.products.csv;
  state.preview = { ok: false, errors: ['Duplicate SKU.'], message: 'Invalid row.' };
  assert.deepEqual(await actions.runFeatureImport('products', csv, 'csv', 'insert'), { ok: false, message: 'Duplicate SKU.' });
  state.commit = { ok: false, message: 'Data changed since validation.' };
  assert.deepEqual(await actions.runFeatureImport('products', csv, 'csv', 'insert', { fingerprint: 'old', requestId: 'request', filename: 'products.csv' }), { ok: false, message: 'Data changed since validation.' });
  assert.equal((await actions.inspectFeatureImport('products', '{broken', 'json')).ok, false);
  const restoring = setup(); restoring.state.restoreError = new Error('Protected stock changed.');
  const result = await restoring.actions.runFeatureImport('products', JSON.stringify(restoring.backup), 'json', 'update');
  assert.deepEqual(result, { ok: false, message: 'Protected stock changed.' });
});

test('framework redirects still propagate instead of becoming form messages', async () => {
  const { actions, state } = setup();
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
  state.authError = redirect;
  await assert.rejects(actions.getFeatureTemplate('products', 'csv'), error => error === redirect);
  await assert.rejects(actions.inspectFeatureImport('products', 'a,b\n1,2', 'csv'), error => error === redirect);
});

test('blank files stop at review without invoking import writers', async () => {
  const standard=setup('standard');
  for(const format of ['csv','json']) {
    const result=await standard.actions.runFeatureImport('products',files.recordsTemplate('products',format),format,'insert');
    assert.equal(result.ok,false);
  }
  assert.equal(standard.calls.preview.length,0);
  const variant=setup('variant');
  const template=await variant.actions.getFeatureTemplate('products','json');
  assert.equal((await variant.actions.runFeatureImport('products',template.data.content,'json','update')).ok,false);
  assert.equal(variant.calls.restore.length,0);
});

test('actual template generator reads schema only, never exports business records', async () => {
  let role='owner';
  const templates=load('app/(dashboard)/dashboard/exports/import-actions.ts',{
    '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business-1',role})},
    '@/lib/supabase/server':{createClient:()=>{throw new Error('Templates must not query records.');}},
    '@/lib/exports/import-backup':backupParser,
    '@/lib/exports/catalog':exportCatalog,
    '@/lib/exports/import-columns':load('lib/exports/import-columns.ts'),
    'next/cache':{revalidatePath:()=>{}},
  });
  const result=JSON.parse((await templates.downloadImportTemplate(catalog.allImportTables)).content);
  assert.equal(Object.keys(result.data).length,catalog.allImportTables.length);
  for(const table of catalog.allImportTables){assert.deepEqual(result.data[table],[]);assert.equal(result.tables[table],0);assert.ok(result.columns[table].length);}
  assert.ok(result.columns.products.includes('size'));
  assert.ok(result.columns.bundle_items.includes('selected_options'));
  assert.ok(!Object.values(result.columns).flat().some(name=>/password|secret|token|credential/i.test(name)));
  role='staff';await assert.rejects(templates.downloadImportTemplate(['products']),/Only the business owner/);
});
