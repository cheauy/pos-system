/* eslint-disable @typescript-eslint/no-require-imports -- Source scheduling model; not a live concurrency test. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('docs/proposed/20261012_barcode_preservation_v2.PROPOSED.sql','utf8');
test('source-derived import/batch schedules queue before rows in either arrival order',()=>{
 assert.ok(sql.includes("perform public.tenh_assert_effective_permission(p_business,''products.update''); perform public.tenh_barcode_writer_lock(p_business);"));
 assert.ok(sql.includes('perform public.tenh_barcode_writer_lock(p_business_id); perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));'));
 // Model only the verified acquisition order: common -> group/import mutex -> rows.
 // Existing import TABLE locks remain inside the common coordinator, before writes.
 for(const [first,second] of [['batch','import'],['import','batch']]){
  const held=new Map(),waits=new Map(),rows=new Set();
  const acquire=(who,key)=>{const owner=held.get(key);if(owner&&owner!==who){waits.set(who,owner);return false;}held.set(key,who);return true;};
  assert.equal(acquire(first,'common'),true);assert.equal(acquire(first,first+'-mutex'),true);rows.add(first);assert.equal(acquire(second,'common'),false);
  assert.ok(!rows.has(second));assert.ok(!waits.has(first)); // no second writer's rows can block the first
  for(const[key,owner]of held)if(owner===first)held.delete(key);
  waits.delete(second);assert.equal(acquire(second,'common'),true);assert.equal(acquire(second,second+'-mutex'),true);
 }
});
test('direct identifier statements enter before tuples and raw branch updates cannot lock late',()=>{
 for(const table of ['public.products','public.branch_products','public.orders','public.product_location_stock'])assert.match(sql,new RegExp('create trigger tenh_barcode_coordinator before[^;]+on '+table.replaceAll('.','\\.')+'\\s+for each statement'));
 assert.ok(sql.includes("raise exception 'Use a reviewed identifier writer: acquire the catalog coordinator before rows.'"));
 assert.ok(sql.includes('new.sku is not distinct from old.sku and new.barcode is not distinct from old.barcode then return new'));
});
