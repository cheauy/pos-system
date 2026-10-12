/* eslint-disable @typescript-eslint/no-require-imports -- Static source/codec checks; never starts a SQL engine. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {sql,evidence,adapters,functions,beginPosition}=require('../scripts/build-barcode-tenant-proposal.cjs');
const core=fs.readFileSync('docs/proposed/20261012_barcode_tenant_v3_core.sql','utf8');
test('reviewable successor is deterministic with 31 recorded adapters and 49 ownership routes',()=>{
 assert.equal(sql,fs.readFileSync('docs/proposed/20261012_barcode_preservation_v3.PROPOSED.sql','utf8'));
 assert.deepEqual(evidence,JSON.parse(fs.readFileSync('docs/proposed/20261012_barcode_v3_writer_manifest.json','utf8')));
 assert.equal(evidence.adapters.length,31);assert.equal(evidence.ownership.length,49);assert.deepEqual(evidence.unsupported,[]);
 assert.match(sql,/Reviewed writer body differs/);assert.match(sql,/Unreviewed writer owner/);assert.match(sql,/Unreviewed row ownership/);
});
for(const fn of adapters)test('real source adapter retains original authorization and enters before locks: '+fn.name,()=>{
 const initial=beginPosition(fn.patchedBody),entry=fn.patchedBody.indexOf('perform public.tenh_barcode_enter_business_v3(',initial);
 assert.ok(entry>initial);
 const firstLock=fn.patchedBody.search(/\bfor\s+(?:update|share|no\s+key\s+update|key\s+share)\b|\bpg_advisory_xact_lock\b|\binsert\s+into\b|\bupdate\s+public\.\w+\s+set\b/i);
 if(firstLock>=0)assert.ok(entry<firstLock,'tenant entry must precede original row/request/mutation locks');
 assert.doesNotMatch(fn.patchedBody,/tenh_barcode_writer_lock|lock table|9616/);
 const permissions=fn.body.match(/(?:tenh_assert_effective_permission|tenh_user_permission_allowed|tenh_pos_guard|tenh_assert_plan_branch)\([^;]+/g)||[];
 for(const check of permissions)assert.ok(fn.patchedBody.includes(check),'Original permission/branch/plan assertion was lost');
 assert.ok(sql.includes(fn.expected),'Expected body fingerprint must be checked before patch');
});
test('mobile fingerprint models every SQL replace occurrence, including comparison and update',()=>{
 const fn=adapters.find(x=>x.name==='tenh_mobile_management');
 const expected=fn.body.replaceAll("barcode=coalesce(nullif(item->>'barcode',''),item->>'sku')","barcode=case when item ? 'barcode' and item->>'barcode'<>'' then item->>'barcode' else product.barcode end")
  .replaceAll('perform public.tenh_assert_effective_permission(p_business_id,permission);',"perform public.tenh_assert_effective_permission(p_business_id,permission); if p_operation in ('product-create','product-edit','bundle-create','bundle-edit','bundle-toggle','bundle-delete') then perform public.tenh_barcode_writer_lock(p_business_id); end if;");
 assert.equal(fn.expected,crypto.createHash('md5').update(expected.replaceAll('\r','')).digest('hex'));
 assert.equal((expected.match(/else product\.barcode end/g)||[]).length,2);
});
test('scope proof is private, temporary, transaction-cleaned and cannot widen; genesis is guarded',()=>{
 assert.match(core,/on commit delete rows/g);assert.doesNotMatch(core,/create table .*transaction_scope/);
 assert.match(core,/relowner='postgres'::regrole/);assert.match(core,/has_table_privilege\('authenticated'/);
 assert.match(core,/pg_current_xact_id\(\)/);assert.match(core,/pg_backend_pid\(\)/);assert.match(core,/wanted<@prior/);
 assert.match(core,/Late tenant entry rejected/);assert.match(core,/for no key update/);
 assert.match(core,/new\.owner_id is not distinct from auth\.uid\(\)/);assert.match(core,/a00_tenh_barcode_genesis/);
 assert.match(core,/revoke all on all functions in schema tenh_barcode_v3_private/);
 assert.match(core,/Foreign key crosses business scope/);assert.match(core,/tenh_barcode_deleted_parents/);
});
test('all three global blockers are removed from final installed source; both readiness gates stay false',()=>{
 const upgraded=sql.slice(sql.indexOf('-- BEGIN V3 SUCCESSOR ADAPTER STAGE'));
 for(const name of ['tenh_barcode_catalog_lock','tenh_barcode_writer_lock','tenh_barcode_lock_required'])assert.ok(upgraded.includes('drop function public.'+name));
 const allocator=upgraded.slice(upgraded.indexOf('create or replace function public.tenh_new_order_code()'),upgraded.indexOf('-- True same-code races'));
 assert.doesNotMatch(allocator,/pg_advisory/);assert.match(allocator,/tenh_order_identifiers/);
 assert.match(upgraded,/contract_v2_ready\(\).*\$\$select false\$\$/);assert.match(upgraded,/contract_v3_ready\(\).*\$\$select false\$\$/);
 assert.match(sql,/orders_order_code_key/);assert.match(sql,/An order code cannot be changed|Reviewed immutable order-code/);
 const originalImport=functions.get('tenh_import_business_safe').body;
 assert.match(originalImport,/share row exclusive/);assert.doesNotMatch(adapters.find(x=>x.name==='tenh_import_business_safe').patchedBody,/lock table/);
});
test('outer BEGIN location skips quoted strings and comments',()=>{
 const body="declare x text := 'begin'; -- begin\n/* BEGIN */\nbegin return;end";
 assert.equal(beginPosition(body),body.indexOf('begin return'));
});
