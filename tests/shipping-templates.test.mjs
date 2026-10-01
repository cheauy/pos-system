import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { loadTs } = require('./helpers/load-ts.cjs');
const templates = loadTs('lib/receipts/shipping-templates.ts');
const model = loadTs('lib/receipts/receipt-model.ts');
// QR encoding is unchanged and belongs to order-qr tests. This fixture tests label layout/data boundaries.
const qr = { isOrderCode: v => typeof v === 'string' && /^[1-9][0-9]{11}$/.test(v), orderQrSvg: id => `<svg data-qr="${id}" viewBox="0 0 41 41"><rect width="41" height="41" fill="white"/></svg>` };
const render = loadTs('lib/receipts/shipping-label-markup.ts', {
  '@/lib/barcode/code39': loadTs('lib/barcode/code39.ts'),
  '@/lib/orders/order-qr': qr,
  '@/lib/receipts/receipt-model': model,
  './shipping-templates': templates,
});
const order = { id: '550e8400-e29b-41d4-a716-446655440000', order_number: 'POS-DE60443D61', order_code: '482193057716', created_at: '2026-09-28T08:56:00Z', guest_name: 'Uy Chea', guest_phone: '010 312 400', guest_address: 'Phnom Penh, Cambodia', customers: null, total: 18, payment_method: 'COD', order_items: [{ quantity: 1 }] };
const store = { name: 'Test Store', phone: '016 898 117', address: 'Sender street' };
const saved = { shipping_label_size: '80x50', ...Object.fromEntries(templates.SHIPPING_VISIBILITY_FLAGS.map(key => [`shipping_show_${key}`, true])) };
const markup = (settings = {}, changes = {}, business = store) => render.shippingLabelMarkup({ order: { ...order, ...changes }, store: business, settings });

test('template groups contain unique English/Khmer templates and exactly the three supported sizes', () => {
  assert.deepEqual(templates.SHIPPING_TEMPLATE_GROUPS.map(group => group.label), ['English Templates', 'Khmer Templates']);
  assert.equal(new Set(templates.SHIPPING_TEMPLATES.map(template => template.id)).size, 4);
  for (const language of ['en', 'km']) assert.equal(templates.SHIPPING_TEMPLATES.filter(template => template.language === language).length, 2);
  assert.deepEqual(templates.SHIPPING_LABEL_SIZES.map(({ id, width, height }) => [id, width, height]), [['80x50', 80, 50], ['100x100', 100, 100], ['100x150', 100, 150]]);
});
test('old saved shipping settings default to English Classic without losing visibility flags', () => {
  const result = templates.validateShippingSettings({ ...saved, shipping_show_phone: false });
  assert.equal(result.shipping_template, 'en-classic');
  assert.equal(result.shipping_show_phone, false);
  assert.equal(result.shipping_label_size, '80x50');
  assert.equal(result.shipping_show_linear_barcode, true);
});
for (const template of templates.SHIPPING_TEMPLATES) for (const size of templates.SHIPPING_LABEL_SIZES) {
  test(`${template.id} at ${size.id}: saved settings round-trip and markup has matching language and dimensions`, () => {
    const result = templates.validateShippingSettings(JSON.parse(JSON.stringify({ ...saved, shipping_template: template.id, shipping_label_size: size.id, shipping_show_footer: false })));
    assert.equal(result.shipping_template, template.id); assert.equal(result.shipping_label_size, size.id); assert.equal(result.shipping_show_footer, false);
    const output = markup({ ...result, shipping_show_footer: true });
    assert.equal(output.paper.width, size.width); assert.equal(output.paper.height, size.height); assert.equal(output.template.language, template.language);
    assert.ok(output.style.includes(`--ship-width:${size.width}mm`)); assert.ok(output.style.includes(`--ship-height:${size.height}mm`));
    assert.match(output.inner, /Uy Chea/); assert.match(output.inner, /010 312 400/); assert.match(output.inner, /\$18\.00/);
    assert.ok(output.inner.includes(render.SHIPPING_LABEL_COPY[template.language].recipient));
    assert.ok(!output.inner.includes('Shipping Label') && !output.inner.includes('ស្លាកដឹកជញ្ជូន'));
    assert.ok(output.inner.includes(`data-qr="${order.order_code}"`));
    assert.ok(output.inner.includes(`data-linear-code="${order.order_code}"`));
    assert.ok(!output.inner.includes(order.order_number));
  });
}
test('invalid template IDs, sizes and visibility values cannot be persisted', () => {
  for (const patch of [{ shipping_template: 'km-unknown' }, { shipping_template: '<script>' }, { shipping_label_size: '999x1' }, { shipping_show_date: 'on' }, { shipping_show_phone: 1 }]) {
    assert.throws(() => templates.validateShippingSettings({ ...saved, ...patch }));
  }
  for (const value of [null, [], {}, 42]) assert.throws(() => templates.validateShippingSettings(value));
});
test('unknown presentation input has safe deterministic fallbacks', () => {
  assert.equal(templates.shippingTemplate(undefined).id, 'en-classic');
  assert.equal(templates.shippingLabelSize('broken').id, '100x150');
  assert.equal(templates.isShippingTemplate('km-courier'), true);
});
test('Khmer reference template includes date, sender phone, amount, QR caption and bilingual footer', () => {
  const { inner } = markup({ shipping_template: 'km-courier' });
  for (const text of ['កាលបរិច្ឆេទ', 'ឈ្មោះអ្នកទទួល', 'លេខអ្នកផ្ញើរ', 'ចំនួនទឹកប្រាក់', 'Scan for details', 'Thank you for your order!']) assert.ok(inner.includes(text));
  assert.ok(!inner.includes('FASHION FOR A BETTER YOU'));
  assert.ok(!inner.includes('Melody'));
});
test('recipient name/address remain present while optional fields can be hidden independently', () => {
  const flags = Object.fromEntries([...templates.SHIPPING_VISIBILITY_FLAGS, ...templates.SHIPPING_EXTRA_FLAGS].map(key => [`shipping_show_${key}`, false]));
  const { inner } = markup(flags);
  assert.match(inner, /Uy Chea/); assert.match(inner, /Phnom Penh/);
  for (const text of ['010 312 400', '016 898 117', 'Test Store', 'Sender street', 'data-qr', 'data-linear-code', '$18.00', 'Thank you']) assert.ok(!inner.includes(text));
});
test('order QR and linear barcode toggles are independent; hidden order number also hides its barcode', () => {
  assert.ok(markup({ shipping_show_barcode: false }).inner.includes('data-linear-code'));
  assert.ok(!markup({ shipping_show_barcode: false }).inner.includes('data-qr'));
  assert.ok(markup({ shipping_show_linear_barcode: false }).inner.includes('data-qr'));
  assert.ok(!markup({ shipping_show_linear_barcode: false }).inner.includes('data-linear-code'));
  assert.ok(!markup({ shipping_show_order_number: false }).inner.includes('data-linear-code'));
});
test('all customer/shop text is escaped and unsupported logo protocols are rejected', () => {
  const { inner } = markup({}, { guest_name: '<script>alert(1)</script>', guest_address: 'Street & <img src=x onerror=alert(1)>', order_number: '"><script>x</script>' }, { ...store, name: 'A & B', logoUrl: 'javascript:alert(1)' });
  assert.match(inner, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(inner, /Street &amp; &lt;img/);
  assert.match(inner, /A &amp; B/);
  assert.ok(!inner.includes('<script>')); assert.ok(!inner.includes('javascript:')); assert.ok(!inner.includes('<img'));
});
test('receipt logo is reused only when enabled, with the actual shop name as alternative text', () => {
  const shop = { ...store, logoUrl: 'https://example.com/shop.png' };
  assert.match(markup({}, {}, shop).inner, /src="https:\/\/example.com\/shop.png" alt="Test Store"/);
  assert.ok(!markup({ shipping_show_logo: false }, {}, shop).inner.includes('shop.png'));
  assert.match(markup({ shipping_show_logo: false }, {}, shop).inner, /Test Store/);
});
test('dates use an explicit timezone, including midnight rollover; invalid dates do not crash printing', () => {
  assert.equal(render.shippingOrderDate(order.created_at), '28 Sept 26 03:56 pm');
  assert.match(render.shippingOrderDate('2026-09-28T20:00:00Z'), /29 Sept 26/);
  assert.equal(render.shippingOrderDate('bad'), '—');
  assert.equal(render.shippingOrderDate(order.created_at, 'invalid'), render.shippingOrderDate(order.created_at));
});
test('payment display never changes the amount or calculates a balance from COD/deposit status', () => {
  assert.match(markup({ shipping_label_size: '80x50' }).inner, />COD</);
  assert.match(markup({ shipping_label_size: '100x150' }).inner, /COD \(Cash on Delivery\)/);
  assert.ok(!markup({}, { remaining_balance: 10, payment_method: 'deposit' }).inner.includes('$10.00'));
  assert.match(markup({}, { payment_method: 'bank_transfer' }).inner, /Bank transfer/);
  assert.match(markup({}, { remaining_balance: 10, payment_method: 'deposit' }).inner, /\$18\.00/);
  assert.ok(!markup().inner.includes('Balance due'));
});
test('customer relation fallback works for object and array shapes and item quantities are summed', () => {
  const customer = { name: 'Saved Customer', phone: '12345', address: 'Saved address' };
  for (const customers of [customer, [customer]]) {
    const { inner } = markup({}, { guest_name: null, guest_phone: null, guest_address: null, customers, order_items: [{ quantity: 2 }, { quantity: 3 }] });
    for (const text of ['Saved Customer', '12345', 'Saved address', '5 items']) assert.ok(inner.includes(text));
  }
});
test('unsupported or overlong barcode identifiers are not silently replaced with another identifier', () => {
  // Orders saved before numeric codes existed fall back to the order number (no QR link).
  for (const order_number of ['Order_你好', 'A'.repeat(41)]) {
    const output = markup({}, { order_number, order_code: null });
    assert.ok(!output.inner.includes('data-linear-code'));
    assert.ok(!output.inner.includes('data-qr'));
    assert.ok(output.inner.includes(order_number));
  }
});
test('new geometry uses fixed width AND height, square QR and scoped print-safe styling', () => {
  assert.match(render.SHIPPING_LABEL_CSS, /width:var\(--ship-width\)!important;height:var\(--ship-height\)!important/);
  assert.match(render.SHIPPING_LABEL_CSS, /width:var\(--ship-qr\);height:var\(--ship-qr\)/);
  assert.ok(!render.SHIPPING_LABEL_CSS.includes('transform:scale'));
});
test('existing branch authorization is retained for settings save/load and all print entry points share the renderer', () => {
  const action = readFileSync('app/(dashboard)/dashboard/settings/receipts/actions.ts', 'utf8');
  assert.match(action, /requirePermission\('business.update'\)/); assert.match(action, /await printerBranch\(business.id/);
  assert.match(action, /persistShippingSettings\(business.id/);
  const storage = readFileSync('lib/receipts/shipping-design-store.ts', 'utf8');
  assert.match(storage, /authorizedOrderBranch/); assert.match(storage, /validateShippingSettings/);
  assert.match(storage, /branchPath\(businessId,'shipping-settings.json'\)/);
  const wrapper = readFileSync('app/(dashboard)/dashboard/shipping-labels/shipping-labels-client.tsx', 'utf8');
  assert.match(wrapper, /<ShippingLabelCard/); assert.match(wrapper, /<ShippingTemplateSelect/);
});

function shippingActions({ branch = 'branch-a', denied = false, failSave = false, current = null } = {}) {
  const writes = [], invalidated = [], reads = [];
  const api = loadTs('app/(dashboard)/dashboard/settings/receipts/actions.ts', {
    '@/lib/public-photo-cache': { PUBLIC_PHOTO_CACHE_SECONDS: '86400' },
    'next/cache': { revalidatePath: (...args) => invalidated.push(args) },
    '@/lib/auth/require-permission': { requirePermission: async permission => { assert.equal(permission, 'business.update'); if (denied) throw Error('Permission denied'); return { id: 'business-a' }; } },
    '@/lib/supabase/branch-server': { createClient: async () => { throw Error('Shipping does not mutate receipt SQL rows'); } },
    '@/lib/supabase/admin': { supabaseAdmin: {} },
    '@/lib/audit/create-audit-log': { createAuditLog: async () => {} },
    '@/lib/receipts/receipt-model': model,
    '@/lib/branches/context': { getBranchContext: async () => ({ business: { id: 'business-a' }, branchId: branch }) },
    '@/lib/receipts/shipping-templates': templates,
    '@/lib/receipts/shipping-design-store': {
      loadShippingSettings: async id => { reads.push(id); return current; },
      persistShippingSettings: async (id, value) => { if (failSave) throw Error('Storage write failed'); writes.push({ id, value: templates.validateShippingSettings(value) }); },
    },
  });
  const form = new FormData(); form.set('branchId', 'branch-a'); form.set('shippingLabelSize', '80x50'); form.set('shippingTemplate', 'km-courier');
  form.set('shippingShowStoreName', 'on'); form.set('shippingShowPhone', 'on'); form.set('shippingShowBarcode', 'on'); form.set('shippingShowDate', 'on');
  return { api, form, writes, invalidated, reads };
}
test('shipping save persists template, dimensions and explicit flags in the authorized business only', async () => {
  const h = shippingActions(); await h.api.saveShippingLabelSettings(h.form);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].id, 'business-a');
  assert.equal(h.writes[0].value.shipping_template, 'km-courier'); assert.equal(h.writes[0].value.shipping_label_size, '80x50');
  assert.equal(h.writes[0].value.shipping_show_phone, true); assert.equal(h.writes[0].value.shipping_show_footer, false);
  assert.deepEqual(h.reads, []); assert.ok(h.invalidated.some(([path]) => path === '/dashboard/orders'));
});
test('old forms preserve saved Khmer template and optional flags instead of resetting them', async () => {
  const h = shippingActions({ current: { ...saved, shipping_template: 'km-classic', shipping_show_footer: false } });
  h.form.delete('shippingTemplate'); await h.api.saveShippingLabelSettings(h.form);
  assert.equal(h.writes[0].value.shipping_template, 'km-classic'); assert.equal(h.writes[0].value.shipping_show_footer, false); assert.equal(h.reads.length, 1);
});
for (const [name, options, patch] of [
  ['stale branch', { branch: 'branch-b' }, null], ['missing permission', { denied: true }, null],
  ['invalid template', {}, ['shippingTemplate', 'unknown']], ['invalid size', {}, ['shippingLabelSize', '99x99']],
  ['storage failure', { failSave: true }, null],
]) test(`shipping save rejects ${name} without a successful write or cache success`, async () => {
  const h = shippingActions(options); if (patch) h.form.set(...patch);
  await assert.rejects(h.api.saveShippingLabelSettings(h.form)); assert.equal(h.writes.length, 0); assert.equal(h.invalidated.length, 0);
});
test('branch JSON persistence validates the template and loads it back at the identical branch path', async () => {
  const entries = new Map(), paths = [];
  const api = loadTs('lib/receipts/shipping-design-store.ts', {
    'server-only': {},
    './shipping-templates': templates,
    './shipping-layout': loadTs('lib/receipts/shipping-layout.ts'),
    '@/lib/branches/context': { getBranchContext: async () => ({ business: { id: 'business-a' }, branchId: 'branch-a' }) },
    '@/lib/branches/order-access': { authorizedOrderBranch: async () => 'branch-a' },
    '@/lib/supabase/admin': { supabaseAdmin: { storage: {
      getBucket: async () => ({ error: null }),
      from: bucket => { assert.equal(bucket, 'tenh-printer-designs'); return {
        upload: async (path, json) => { paths.push(path); entries.set(path, json); return { error: null }; },
        download: async path => { paths.push(path); return entries.has(path) ? { data: { text: async () => entries.get(path) }, error: null } : { data: null, error: { message: 'Not found' } }; },
      }; },
    } } },
  });
  await api.persistShippingSettings('business-a', { ...saved, shipping_template: 'km-courier' });
  const result = await api.loadShippingSettings('business-a');
  assert.equal(result.shipping_template, 'km-courier'); assert.deepEqual(paths, ['business-a/branch-a/shipping-settings.json', 'business-a/branch-a/shipping-settings.json']);
  await assert.rejects(api.persistShippingSettings('business-b', { ...saved, shipping_template: 'km-courier' }));
  assert.equal(entries.size, 1);
});
