import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const { loadTs } = require('./helpers/load-ts.cjs');
const { uiLoader } = require('./helpers/ui-loader.cjs');
const profile = loadTs('lib/storefront/profile.ts');
const model = loadTs('lib/business/business-info.ts', { '@/lib/storefront/profile': profile });
const h = React.createElement;
const icons = new Proxy({}, { get: () => props => h('svg', { 'aria-hidden': true, width: props.size, height: props.size }) });
const services = { 'lucide-react': icons, 'next/link': { default: props => h('a', props) } };
const form = values => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const old = {
  phone: '010123456', address: 'Street 10, Phnom Penh', updated_at: '2026-09-29T00:00:00Z',
  social_links: { facebook: 'https://example.com/shop', custom: { retained: true }, profile: {
    defaultLanguage: 'km', contactEmail: 'old@example.com', locationUrl: 'https://example.com/location',
    openingHours: profile.defaultOpeningHours(), featuredProductIds: ['one'], preorderProductIds: ['two'],
    seoTitle: 'Keep this title', newArrivals: { enabled: true, days: 14 },
  } },
};
function businessAction(options = {}) {
  const current = structuredClone(old), queries = [], updates = [], invalidated = [], requested = [];
  const admin = { from(table) {
    const calls = []; queries.push({ table, calls });
    let updating = false;
    const q = {
      select(...args) { calls.push(['select', ...args]); return q; },
      eq(...args) { calls.push(['eq', ...args]); return q; },
      is(...args) { calls.push(['is', ...args]); return q; },
      update(payload) { updating = true; updates.push(payload); calls.push(['update', payload]); return q; },
      async maybeSingle() {
        if (updating) return { data: options.conflict ? null : { business_id: 'shop' }, error: options.writeError ? Error('Database unavailable') : null };
        return { data: options.missing ? null : current, error: options.readError ? Error('Read unavailable') : null };
      },
    }; return q;
  } };
  const action = loadTs('app/(dashboard)/dashboard/settings/business/info-actions.ts', {
    'next/cache': { revalidatePath: (...args) => { if (options.cacheError) throw Error('Cache failed'); invalidated.push(args); } },
    '@/lib/auth/require-permission': { requirePermission: async key => { requested.push(key); if (options.denied) throw Error('Denied'); return { id: 'shop', slug: 'shop' }; } },
    '@/lib/supabase/admin': { supabaseAdmin: admin },
    '@/lib/audit/create-audit-log': { createAuditLog: async () => {} },
    '@/lib/business/business-info': model,
  }).saveBusinessInfo;
  const data = form({ businessId: 'shop', expectedInfo: model.businessInfoSnapshot(model.businessInfoValues({ ...current, profile: current.social_links.profile })), phone: '012345678', address: 'New address', contactEmail: 'new@example.com', hoursEnabled: 'on', hoursTimezone: 'Asia/Singapore', 'hours-monday-open': '10:00', 'hours-monday-close': '20:00', 'hours-sunday-closed': 'on' });
  return { current, action, data, queries, updates, invalidated, requested };
}
test('business info defaults and snapshot have stable Monday–Sunday order', () => {
  const info = model.businessInfoValues({});
  assert.equal(info.phone, ''); assert.equal(info.openingHours.enabled, false);
  assert.deepEqual(Object.keys(info.openingHours.days), profile.weekDays);
  assert.equal(model.businessInfoSnapshot(info), model.businessInfoSnapshot(structuredClone(info)));
});
test('contact parser supports empty optional fields, enabled hours and overnight opening times', () => {
  const info = model.parseBusinessInfo(form({ phone: '010123456', hoursEnabled: 'on', 'hours-monday-open': '20:00', 'hours-monday-close': '02:00' }));
  assert.equal(info.phone, '010123456'); assert.equal(info.openingHours.days.monday.close, '02:00');
  assert.equal(model.parseBusinessInfo(new FormData()).phone, '');
});
for (const [name, data] of [
  ['phone', { phone: '<script>' }], ['long phone', { phone: '1'.repeat(41) }], ['address', { address: 'a'.repeat(501) }],
  ['email', { contactEmail: 'bad@' }], ['URL', { locationUrl: 'javascript:alert(1)' }], ['URL credentials', { locationUrl: 'https://a:b@example.com/' }],
  ['time zone', { hoursTimezone: 'Invalid/Zone' }], ['opening time', { 'hours-monday-open': '25:00' }],
  ['equal times on open day', { hoursEnabled: 'on', 'hours-monday-open': '09:00', 'hours-monday-close': '09:00' }],
]) test(`business info validates ${name}`, () => assert.throws(() => model.parseBusinessInfo(form(data))));
test('disabled hours retain timezone and every saved time', () => {
  const value = model.parseBusinessInfo(form({ hoursEnabled: 'off', hoursTimezone: 'Asia/Singapore', 'hours-monday-open': '11:30', 'hours-monday-close': '21:00', 'hours-sunday-closed': 'on' }));
  assert.equal(value.openingHours.enabled, false); assert.equal(value.openingHours.days.monday.open, '11:30'); assert.equal(value.openingHours.days.sunday.closed, true);
});
test('online branding merge cannot change business-owned profile fields', () => {
  const merged = model.mergeOnlineStoreProfile(old.social_links.profile, { contactEmail: '', locationUrl: '', openingHours: profile.defaultOpeningHours(), defaultLanguage: 'en', seoTitle: 'New title' });
  assert.equal(merged.contactEmail, old.social_links.profile.contactEmail); assert.equal(merged.locationUrl, old.social_links.profile.locationUrl);
  assert.deepEqual(merged.openingHours, old.social_links.profile.openingHours); assert.equal(merged.defaultLanguage, 'en'); assert.equal(merged.seoTitle, 'New title');
  assert.deepEqual(merged.featuredProductIds, ['one']); assert.deepEqual(merged.preorderProductIds, ['two']);
});
test('business save changes only contact/hours and keeps branding and public state intact', async () => {
  const c = businessAction(); const result = await c.action(c.data); assert.equal(result.success, true);
  assert.deepEqual(c.requested, ['business.update']); assert.equal(c.updates.length, 1);
  const data = c.updates[0]; assert.deepEqual(Object.keys(data).sort(), ['address', 'phone', 'social_links', 'updated_at']);
  assert.equal(data.phone, '012345678'); assert.equal(data.social_links.profile.contactEmail, 'new@example.com');
  for (const key of ['defaultLanguage', 'featuredProductIds', 'preorderProductIds', 'seoTitle', 'newArrivals']) assert.deepEqual(data.social_links.profile[key], old.social_links.profile[key]);
  assert.deepEqual(data.social_links.custom, old.social_links.custom); assert.equal(data.social_links.facebook, old.social_links.facebook);
  assert.ok(c.queries.every(query => query.table === 'business_storefronts'));
  assert.ok(c.queries[1].calls.some(([fn, key, value]) => fn === 'eq' && key === 'updated_at' && value === old.updated_at));
  for (const path of ['/dashboard/settings/business','/dashboard/settings/online-store','/dashboard/settings/printers','/_sites/shop']) assert.ok(c.invalidated.some(([value]) => value === path));
});
test('another business or stale contact draft cannot be saved', async () => {
  for (const [key, value] of [['businessId', 'other'], ['expectedInfo', 'stale']]) { const c = businessAction(); c.data.set(key, value); assert.equal((await c.action(c.data)).success, false); assert.equal(c.updates.length, 0); }
});
test('branding-only changes do not falsely conflict with the business contact snapshot', async () => {
  const c = businessAction(); c.current.social_links.profile.seoTitle = 'Saved elsewhere';
  assert.equal((await c.action(c.data)).success, true); assert.equal(c.updates[0].social_links.profile.seoTitle, 'Saved elsewhere');
});
test('crafted branding and payment keys are ignored by the contact action', async () => {
  const c = businessAction(); c.data.set('defaultLanguage','evil'); c.data.set('acceptKhqr','on'); c.data.set('businessType','restaurant');
  assert.equal((await c.action(c.data)).success, true); assert.equal(c.updates[0].social_links.profile.defaultLanguage, 'km'); assert.equal(Object.hasOwn(c.updates[0], 'accept_khqr'), false);
});
for (const option of ['readError', 'missing', 'writeError', 'conflict']) test(`business save does not report success for ${option}`, async () => {
  const c = businessAction({ [option]: true }); assert.equal((await c.action(c.data)).success, false); assert.equal(c.invalidated.length, 0);
});
test('permission denial prevents all business reads and writes', async () => {
  const c = businessAction({ denied: true }); await assert.rejects(c.action(c.data), /Denied/); assert.equal(c.queries.length, 0);
});
test('blank phone/address explicitly clear shared defaults only', async () => {
  const c = businessAction(); c.data.set('phone',''); c.data.set('address',''); assert.equal((await c.action(c.data)).success, true);
  assert.equal(c.updates[0].phone, null); assert.equal(c.updates[0].address, null);
});
test('a refresh failure after commit reports saved rather than prompting a duplicate save', async () => {
  const c = businessAction({ cacheError: true }); const original = console.error; console.error = () => {};
  try { const result = await c.action(c.data); assert.equal(result.success, true); assert.match(result.message, /saved/i); } finally { console.error = original; }
});
test('General Settings contains business/online cards, not branch/user management metrics', async () => {
  const Page = uiLoader({ ...services, '@/lib/business/get-current-business': { getCurrentBusiness: async () => ({ id:'shop', role:'owner' }) }, '@/lib/auth/effective-permissions': { businessHasPermission: async () => true } })('app/(dashboard)/dashboard/settings/page.tsx').default;
  const html = renderToStaticMarkup(await Page());
  for (const name of ['Business Settings','Online Store Settings','Appearance &amp; Language','Security']) assert.ok(html.includes(name));
  assert.doesNotMatch(html, /User &amp; Manage User|href="\/dashboard\/locations"/);
});
test('settings navigation is hidden when its matching view permission is missing', async () => {
  const Page = uiLoader({ ...services, '@/lib/business/get-current-business': { getCurrentBusiness: async () => ({ id:'shop', role:'staff' }) }, '@/lib/auth/effective-permissions': { businessHasPermission: async () => false } })('app/(dashboard)/dashboard/settings/page.tsx').default;
  const html = renderToStaticMarkup(await Page()); assert.doesNotMatch(html, /href="\/dashboard\/settings\/(business|online-store)"/);
});
test('Business Settings renders contact and all seven days in a read-only-safe form', () => {
  const Form = uiLoader({ ...services, './info-actions': { saveBusinessInfo: async () => ({ success:true }) } })('app/(dashboard)/dashboard/settings/business/business-info-form.tsx').default;
  const html = renderToStaticMarkup(h(Form,{businessId:'shop',phone:old.phone,address:old.address,profile:old.social_links.profile,canEdit:false}));
  assert.match(html, /id="business-info"/); assert.match(html,/This information appears on your storefront and business printouts/); assert.match(html,/fieldset disabled/);
  for (const day of profile.weekDays) assert.ok(html.includes(`hours-${day}-open`));
  assert.doesNotMatch(html, />Save business info</);
});
test('Printer header includes the Business Settings information link', () => {
  const noop=()=>null;
  const Page = uiLoader({ ...services, '../receipts/receipt-settings-editor': { ReceiptSettingsEditor:noop }, './label-settings': {default:noop}, './printer-connection':{default:noop} })('app/(dashboard)/dashboard/settings/printers/printer-settings.tsx').default;
  const html=renderToStaticMarkup(h(Page,{businessId:'shop',context:{store:{},appearance:{}},settings:{}}));
  assert.match(html,/href="\/dashboard\/settings\/business#business-info"/); assert.match(html,/Edit your business info/);
});
test('old Online Store bookmarks redirect to the canonical route, preserving repeated query values', async () => {
  const Page=loadTs('app/(dashboard)/dashboard/online-store/page.tsx',{'next/navigation':{redirect:url=>{throw Error(url);}}}).default;
  await assert.rejects(Page({searchParams:Promise.resolve({tab:'branding',q:['one','two']})}), /\/dashboard\/settings\/online-store\?tab=branding&q=one&q=two/);
});
test('sidebar keeps General/User/Branches but removes Business and Online Store from the Settings submenu', () => {
  const source=readFileSync('app/(dashboard)/dashboard/sidebar-client.tsx','utf8');
  const sales=source.slice(source.indexOf('title: "Sales"'),source.indexOf('title: "Inventory"'));
  const subscription=source.slice(source.indexOf('title: "Subscription"'),source.indexOf('title: "Settings"'));
  const settings=source.slice(source.indexOf('title: "Settings"'),source.indexOf('const searchScopes'));
  assert.doesNotMatch(sales,/Online Store/); assert.doesNotMatch(subscription,/Business Details|Business Settings/);
  assert.doesNotMatch(settings,/Business Settings|Online Store Settings/);
  for(const label of ['General','User & Manage User','Branches']) assert.ok(settings.includes(label));
});
test('Online Store removes Store Profile/Status cards and keeps profile fields in Branding', () => {
  const source=readFileSync('app/(dashboard)/dashboard/online-store/storefront-settings-form.tsx','utf8');
  assert.doesNotMatch(source,/title="Store Status"|title="Store Profile"/);
  assert.match(source,/title="Branding"/);
  assert.match(source,/label="Store description"/);
  assert.match(source,/label="Default storefront currency"/);
  assert.doesNotMatch(source,/label="Display name"/);
  assert.doesNotMatch(source,/Ordering &amp; Fulfillment|Choose how customers receive orders and manage fulfillment rules/);
  assert.match(source,/title="Pickup"/); assert.match(source,/title="Delivery"/);
  assert.doesNotMatch(source,/title="Online Payment"/);
  assert.match(source,/storefront-publish-slot|Publish storefront/);
  assert.match(source,/storefront-orders-slot|Online order availability/);
});

test('Business Settings includes reference-style hero, access summary, credits and header save slot', () => {
  const page=readFileSync('app/(dashboard)/dashboard/settings/business/page.tsx','utf8');
  const credits=readFileSync('app/(dashboard)/dashboard/settings/business/credit-badges.tsx','utf8');
  for (const text of ['Change settings','Owner / Admin','Users','Branches','business-info-save-slot','OnlinePaymentForm']) assert.ok(page.includes(text));
  assert.match(page,/Last updated/);
  assert.match(credits,/Mode credits available/);
  assert.match(credits,/Store URL credits/);
  assert.match(credits,/Need more credits\?/);
});
test('shipping preview uses Dara and the requested phone without hardcoding live labels', () => {
  const preview=readFileSync('app/(dashboard)/dashboard/settings/printers/label-settings.tsx','utf8');
  assert.match(preview,/guest_name: "Dara", guest_phone: "010123456"/); assert.doesNotMatch(preview,/Uy Chea|010 312 400/);
  const live=readFileSync('lib/receipts/shipping-label-markup.ts','utf8'); assert.doesNotMatch(live,/Dara|010123456/);
  assert.match(live,/order.guest_name \|\| customer\?\.name/);
});
