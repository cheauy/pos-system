import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../app/(dashboard)/dashboard/online-store/catalog-actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const id = '11111111-1111-4111-8111-111111111111';
function setup(found = true) {
  const writes = [], scopes = [];
  const admin = { from(table) {
    let update;
    const query = { select() { return query; }, eq(key, value) { scopes.push([table,key,value]); return query; }, update(value) { update = value; writes.push([table,value]); return query; }, in() { return Promise.resolve({ data: found ? [{ id }] : [], error: null }); }, single() { return Promise.resolve({ data: { social_links: { facebook: 'https://facebook.com/shop', profile: { contactEmail: 'shop@example.com', featuredProductIds: [] } } }, error: null }); }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
    return query;
  } };
  const deps = { 'next/cache': { revalidatePath() {} }, '@/lib/auth/require-permission': { requirePermission: async permission => { assert.equal(permission,'storefront.update'); return { id: 'tenant', slug: 'shop' }; } }, '@/lib/audit/create-audit-log': { createAuditLog: async () => {} }, '@/lib/supabase/admin': { supabaseAdmin: admin } };
  const module = { exports: {} };
  new Function('require','module','exports', source)(key => deps[key], module, module.exports);
  return { update: module.exports.updateCatalogProducts, writes, scopes };
}
test('featured products preserve contact settings and scope changes to the tenant', async () => {
  const ctx = setup(); assert.equal((await ctx.update([id], 'featured', true)).success, true);
  const links = ctx.writes[0][1].social_links;
  assert.equal(links.profile.contactEmail, 'shop@example.com');
  assert.equal(links.facebook, 'https://facebook.com/shop');
  assert.deepEqual(links.profile.featuredProductIds, [id]);
  assert.ok(ctx.scopes.some(([table,key,value]) => table === 'business_storefronts' && key === 'business_id' && value === 'tenant'));
});
test('bulk operations reject unavailable products before writing', async () => {
  const ctx = setup(false); assert.equal((await ctx.update([id], 'visibility', true)).success, false); assert.equal(ctx.writes.length,0);
});
test('bulk operations reject invalid ids and oversized selections', async () => {
  const ctx = setup();
  assert.equal((await ctx.update(['bad'], 'visibility', true)).success,false);
  assert.equal((await ctx.update(Array(101).fill(id), 'featured', true)).success,false);
  assert.equal(ctx.writes.length,0);
});
