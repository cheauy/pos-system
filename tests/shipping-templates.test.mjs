import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { loadTs } = require('./helpers/load-ts.cjs');
const layoutApi = loadTs('lib/receipts/shipping-layout.ts');
const model = loadTs('lib/receipts/receipt-model.ts');
const contact = loadTs('lib/orders/order-contact.ts');
// QR encoding is unchanged and belongs to order-qr tests. This fixture tests label layout/data boundaries.
const qr = { isOrderCode: v => typeof v === 'string' && /^[1-9][0-9]{11}$/.test(v), orderQrSvg: id => `<svg data-qr="${id}" viewBox="0 0 41 41"><rect width="41" height="41" fill="white"/></svg>` };
const custom = loadTs('lib/receipts/shipping-custom.ts',{'@/lib/receipts/receipt-model':loadTs('lib/receipts/receipt-model.ts'),qrcode:require('qrcode'),'@/lib/barcode/code39':loadTs('lib/barcode/code39.ts'),'@/lib/orders/order-qr':qr,'./shipping-layout':layoutApi});
const templates = loadTs('lib/receipts/shipping-templates.ts', {'./shipping-layout':layoutApi,'./shipping-custom':custom});
const render = loadTs('lib/receipts/shipping-label-markup.ts', {'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),
  '@/lib/i18n/translations': loadTs('lib/i18n/translations.ts'),
  '@/lib/orders/order-contact': contact,
  '@/lib/barcode/code39': loadTs('lib/barcode/code39.ts'),
  '@/lib/orders/order-qr': qr,
  '@/lib/receipts/receipt-model': model,
  './shipping-templates': templates,
  './shipping-layout':layoutApi, './shipping-custom':custom,
});
const order = { id: '550e8400-e29b-41d4-a716-446655440000', order_number: 'POS-DE60443D61', order_code: '482193057716', created_at: '2026-09-28T08:56:00Z', guest_name: 'Uy Chea', guest_phone: '010 312 400', guest_address: 'Phnom Penh, Cambodia', customers: null, total: 18, amount_paid: 0, change_amount: 0, remaining_balance: 18, payment_status: 'unpaid', payment_method: 'COD', order_items: [{ quantity: 1 }] };
const store = { name: 'Test Store', phone: '016 898 117', address: 'Sender street' };

test('Shipping type stores a dynamic binding, renders tags in Edit and resolves the order carrier safely',()=>{
 const base=layoutApi.defaultShippingLayout('80x50').elements[0],element={...base,field:'shippingType',text:''};
 const layout=layoutApi.validateShippingLayout({version:1,size:'80x50',enabled:true,elements:[element]});
 assert.equal(layout.elements[0].field,'shippingType');
 for(const [shipping,expected] of [[{carrier:'jt'},'J&T'],[{carrier:'vet'},'VET'],[{carrier:'grab'},'Grab'],[{carrier:'other',carrierOther:'Jalat'},'Jalat'],[{carrier:'other',carrierOther:' '},'Other'],[{carrier:' GRAB '},'Grab'],[null,''],[undefined,''],[{carrier:''},''],[{carrier:'Jalat'},'Jalat'],[{carrier:'__proto__'},'__proto__'],[{carrier:'other',carrierOther:'<img src=x>'},'<img src=x>']]){
  const values=render.shippingValues({...order,pos_checkout:{shipping}},store);assert.equal(values.shippingType,expected);
  assert.equal(custom.shippingElementContent(element,values,true),'{{shipping_type}}');
  assert.equal(custom.shippingElementContent(element,values),render.escapeShippingHtml(expected));
  const text={...element,field:'text',text:'{Shipping type} / {{shipping_type}}'};
  assert.equal(custom.shippingElementContent(text,values).replace(/<\/?span[^>]*>/g,''),`${render.escapeShippingHtml(expected)} / ${render.escapeShippingHtml(expected)}`);
 }
 assert.equal(render.shippingValues({...order,fulfillment_type:'delivery'},store).shippingType,'');
 assert.equal(render.shippingValues({...order,pos_checkout:{receipt:{shipping:{carrier:'jt'}},shipping:{carrier:'grab'}}},store).shippingType,'J&T');
 assert.equal(render.shippingValues({...order,pos_checkout:{receipt:{},shipping:{carrier:'other',carrierOther:'Jalat'}}},store).shippingType,'Jalat');
});

test('designer displays dynamic text bindings and authored tags while printing resolves order values',()=>{
 const base=layoutApi.defaultShippingLayout('80x50').elements[0],values=render.shippingValues(order,store);
 for(const {field,tag} of layoutApi.SHIPPING_TEXT_TAGS.filter(option=>option.tag.startsWith('{{'))){
  const element={...base,field,text:''};assert.equal(custom.shippingElementContent(element,values,true),tag);assert.equal(custom.shippingElementContent(element,values),render.escapeShippingHtml(values[field]||''));
 }
 const text={...base,field:'text',text:'To: {{recipient_name}} / {Order number} <img src=x>'};
 const design=custom.shippingElementContent(text,values,true);assert.ok(design.includes('{{recipient_name}}'));assert.ok(design.includes('{Order number}'));assert.ok(design.includes('&lt;img src=x&gt;'));assert.ok(!design.includes('Uy Chea'));
 const printed=custom.shippingElementContent(text,values);assert.ok(printed.includes('Uy Chea'));assert.ok(!printed.includes('{{recipient_name}}'));assert.ok(printed.includes('482193057716'));
 const rich={...text,richText:[{text:'To: ',bold:true},{text:'{{recipient_name}} / {Order number} <img src=x>'}]};assert.ok(custom.shippingElementContent(rich,values,true).includes('{{recipient_name}}'));assert.ok(custom.shippingElementContent(rich,values).includes('Uy Chea'));
});

test('new label styles and double-brace tags survive storage and resolve without HTML injection',()=>{
 const layout=layoutApi.defaultShippingLayout('80x50');
 const text={...layout.elements[0],id:'styled-tags',field:'text',text:'{{recipient_name}} / {Order number} / {{tracking_number}} / {{date}}',color:'#1f2937',padding:2,locked:true,lineHeight:1.4,richText:[{text:'{{recipient_',bold:true},{text:'name}} / {Order number} / {{tracking_number}} / {{date}}'}]};
 layout.elements.push(text);const copy=layoutApi.validateShippingLayout(JSON.parse(JSON.stringify(layout)));assert.deepEqual(copy,layout);
 const values=render.shippingValues({...order,guest_name:'សួស្តី <img src=x>',tracking_number:'TRACK-123'},store);
 const html=custom.shippingElementMarkup(copy.elements.at(-1),values);assert.ok(html.includes('សួស្តី &lt;img src=x&gt;'));assert.ok(!html.includes('{{'));assert.ok(html.includes('TRACK-123'));assert.ok(html.includes(render.shippingOrderDate(order.created_at)));assert.ok(html.includes('color:#1f2937;padding:2px'));assert.equal(text.text,copy.elements.at(-1).text);
 assert.equal(custom.shippingElementMarkup({...text,hidden:true},values),'');assert.equal(custom.shippingElementContent({...text,hidden:true},values),'');
 assert.equal(render.shippingValues(order,store).tracking,'');
 for(const patch of [{color:'red;display:none'},{color:null},{padding:21},{hidden:'true'},{locked:1}])assert.throws(()=>layoutApi.validateShippingLayout({...layout,elements:[{...text,...patch}]}));
});

test('custom logos use safe configured images and reject executable or external protocol URLs',()=>{
 const logo={...layoutApi.defaultShippingLayout().elements[0],field:'logo',text:''};
 const values=render.shippingValues(order,{...store,logoUrl:'https://cdn.example.test/logo.png'});assert.equal(values.logo,'https://cdn.example.test/logo.png');
 assert.match(custom.shippingElementContent(logo,values),/<img src="https:\/\/cdn.example.test\/logo.png"/);
 assert.ok(custom.shippingElementContent({...logo,text:'/logo.png'},values).includes('src="/logo.png"'));
 for(const text of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','//evil.example/logo','https://user:pass@example.com/logo','/\\evil.example/logo'])assert.equal(custom.shippingElementContent({...logo,text},values),'');
});

test('QR padding preserves the printed code minimum instead of shrinking its quiet zone',()=>{
 const layout=layoutApi.defaultShippingLayout('80x50'),original=layout.elements.find(item=>item.field==='qr');
 const padded=layoutApi.fitShippingElement({...original,padding:20},layout.size,18.6);layoutApi.assertShippingQrSize(padded,layout.size,18.6);
 assert.ok(padded.width*80/100-40*25.4/96>=18.6-.00001);assert.equal(padded.width*80,padded.height*50);
 assert.throws(()=>layoutApi.assertShippingQrSize({...original,padding:20},layout.size,18.6));
});
const saved = { shipping_label_size: '80x50', ...Object.fromEntries(templates.SHIPPING_VISIBILITY_FLAGS.map(key => [`shipping_show_${key}`, true])) };
const markup = (settings = {}, changes = {}, business = store) => render.shippingLabelMarkup({ order: { ...order, ...changes }, store: business, settings });

test('preset and custom shipping labels print current linked customer data instead of old guest contact',()=>{
 const customer={name:'Updated សុភា <script>',phone:'012345678',address:'Updated street & lane'};
 const layout=layoutApi.defaultShippingLayout('80x50');layout.elements.push({...layout.elements[0],id:'contact-tags',field:'text',text:'{{recipient_name}} / {{recipient_phone}} / {{recipient_address}}'});
 for(const customers of [customer,[customer]]){
  const current={...order,customers},values=render.shippingValues(current,store);
  assert.equal(values.customerName,customer.name);assert.equal(values.customerPhone,customer.phone);assert.equal(values.customerAddress,customer.address);
  for(const settings of [{shipping_template:'en-classic'},{shipping_template:'km-classic'},{shipping_template:'custom',shipping_custom_layout:JSON.stringify(layout)}]){
   const printed=markup(settings,{customers}).inner;
   for(const value of Object.values(customer))assert.ok(printed.includes(render.escapeShippingHtml(value)));
   for(const old of [order.guest_name,order.guest_phone,order.guest_address])assert.ok(!printed.includes(old));
  }
 }
 const cleared=render.shippingValues({...order,customers:{...customer,phone:null,address:''}},store);assert.equal(cleared.customerPhone,'');assert.equal(cleared.customerAddress,'');
});

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
test('Khmer reference template includes Khmer date, sender phone, amount, QR caption and footer', () => {
  const { inner } = markup({ shipping_template: 'km-courier' });
  for (const text of ['កាលបរិច្ឆេទ', 'ឈ្មោះអ្នកទទួល', 'លេខទូរស័ព្ទអ្នកផ្ញើ', 'ចំនួនទឹកប្រាក់', 'ស្កេនដើម្បីមើលព័ត៌មានលម្អិត', 'សូមអរគុណសម្រាប់ការបញ្ជាទិញ']) assert.ok(inner.includes(text), text);
  assert.ok(!inner.includes('Scan for details') && !inner.includes('Thank you for your order!'));
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
test('payment display preserves order total and prints the recorded balance separately', () => {
  assert.match(markup({ shipping_label_size: '80x50' }).inner, />COD</);
  assert.match(markup({ shipping_label_size: '100x150' }).inner, />COD</);
  assert.ok(!markup({ shipping_label_size: '100x150' }).inner.includes('Cash on Delivery'));
  assert.match(markup({}, { remaining_balance: 10, payment_method: 'deposit' }).inner, /\$10\.00/);
  assert.match(markup({}, { payment_method: 'bank_transfer' }).inner, /Bank transfer/);
  assert.match(markup({}, { remaining_balance: 10, payment_method: 'deposit' }).inner, /\$18\.00/);
  assert.match(markup().inner, /Balance due/);
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

function shippingActions({ branch = 'branch-a', denied = false, failSave = false, current = null, failNamed = false } = {}) {
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
    '@/lib/receipts/shipping-template-store': {persistShippingNamedTemplate:async (_id,entry,mode,revision,legacy)=>{
      if(failNamed)throw Error('Apply the reviewed shipping custom template migration before saving named templates.');
      const next={...entry,revision:revision+1};return mode==='update'?legacy.map(template=>template.id===entry.id?next:template):[...legacy,next];
    }},
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
  assert.deepEqual(h.reads, ['business-a']); assert.ok(h.invalidated.some(([path]) => path === '/dashboard/orders'));
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
    './shipping-template-store': {loadShippingTemplateCatalog:async()=>null},
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

for (const size of templates.SHIPPING_LABEL_SIZES) test('custom design persists and renders identically at '+size.id, async () => {
  const design = layoutApi.defaultShippingLayout(size.id);
  design.elements[0] = {...design.elements[0], bold:true,fontSize:20,x:2};
  const settings = templates.validateShippingSettings({...saved,shipping_template:'custom',shipping_label_size:size.id,shipping_custom_layout:JSON.stringify(design)});
  assert.deepEqual(JSON.parse(settings.shipping_custom_layout),design);
  const result = markup(settings);
  const values = render.shippingValues(order,store);
  assert.equal(result.className,'shipping-label ship-custom');
  assert.equal(result.paper.id,size.id);
  assert.equal(result.inner,layoutApi.resizeShippingLayout(design,size.id).elements.map(element=>custom.shippingElementMarkup(element,values)).join(''));
  assert.match(result.inner,/font-size:20px;font-weight:700/);
  assert.match(result.inner,/data-qr="482193057716"/);
  assert.ok(!result.inner.includes(order.id));
  const h=shippingActions();h.form.set('shippingTemplate','custom');h.form.set('shippingCustomLayout',JSON.stringify(design));h.form.set('shippingLabelSize',size.id);
  await h.api.saveShippingLabelSettings(h.form);
  assert.equal(h.writes[0].value.shipping_custom_layout,settings.shipping_custom_layout);
});
test('custom layouts stay saved when selecting a preset or using an older form',async()=>{
 const design=JSON.stringify(layoutApi.defaultShippingLayout());
 const h=shippingActions({current:{...saved,shipping_template:'custom',shipping_custom_layout:design}});
 await h.api.saveShippingLabelSettings(h.form);assert.equal(h.writes[0].value.shipping_custom_layout,design);
 h.form.delete('shippingTemplate');await h.api.saveShippingLabelSettings(h.form);assert.equal(h.writes[1].value.shipping_template,'custom');
});
test('invalid custom configuration fails before upload or successful cache invalidation',async()=>{
 for(const raw of ['bad json','{}',JSON.stringify({...layoutApi.defaultShippingLayout(),elements:[{...layoutApi.defaultShippingLayout().elements[0],x:99}]})]){
  const h=shippingActions();h.form.set('shippingTemplate','custom');h.form.set('shippingCustomLayout',raw);
  await assert.rejects(h.api.saveShippingLabelSettings(h.form));assert.equal(h.writes.length,0);assert.equal(h.invalidated.length,0);
 }
 assert.throws(()=>templates.validateShippingSettings({...saved,shipping_template:'custom'}));
});
test('sample QR never encodes an actionable order link, and actual QR uses only the existing contract',()=>{
 const calls=[];
 const sampleCustom=loadTs('lib/receipts/shipping-custom.ts',{'@/lib/receipts/receipt-model':loadTs('lib/receipts/receipt-model.ts'),'./shipping-layout':layoutApi,'@/lib/barcode/code39':loadTs('lib/barcode/code39.ts'),'@/lib/orders/order-qr':qr,qrcode:{create:(value,options)=>{calls.push(value);return require('qrcode').create(value,options);}}});
 assert.match(sampleCustom.shippingQr(null,true),/<svg/);assert.deepEqual(calls,['TENH SAMPLE LABEL - NOT AN ORDER']);
 assert.equal(sampleCustom.shippingQr(null,false),'');assert.equal(sampleCustom.shippingQr('invalid',false),'');
 assert.match(sampleCustom.shippingQr(order.order_code),/data-qr="482193057716"/);
 const settings={...saved,shipping_template:'custom',shipping_custom_layout:JSON.stringify(layoutApi.defaultShippingLayout()),shipping_sample_preview:true};
 const real=markup(settings);assert.match(real.inner,/data-qr="482193057716"/);
 const sample=markup(settings,{id:'00000000-0000-0000-0000-000000000000',order_code:null,order_number:'SAMPLE-ORDER'});assert.match(sample.inner,/<svg/);assert.ok(!sample.inner.includes('data-qr="482193057716"'));
});
test('custom text is escaped and unsupported barcode identifiers never become another order code',()=>{
 const element={...layoutApi.defaultShippingLayout().elements[0],field:'text',text:'<img src=x onerror=alert(1)>'};
 assert.match(custom.shippingElementContent(element,{}),/&lt;img/);
 assert.equal(custom.shippingElementContent({...element,field:'barcode'},{orderNumber:'INVALID_123'}),'');
});
test('mobile custom output uses the same dimensions and markup as the website',()=>{
 const mobile=loadTs('lib/mobile/shipping-html.ts',{'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),'@/lib/orders/order-contact':contact,'@/lib/orders/order-qr':qr,'@/lib/receipts/receipt-model':model,'@/app/(dashboard)/dashboard/orders/[id]/order-detail-model':{one:value=>Array.isArray(value)?value[0]:value},'./receipt-html':{escapeHtml:render.escapeShippingHtml},'@/lib/receipts/shipping-label-markup':render});
 const settings={...saved,shipping_template:'custom',shipping_custom_layout:JSON.stringify(layoutApi.defaultShippingLayout('80x50'))};
 const result=mobile.mobileShippingHtml(order,{store},settings,'USD');
 assert.ok(result.html.includes(markup(settings).inner));assert.ok(result.html.includes('@page{size:80mm 50mm;margin:0}'));
 assert.equal(result.width,80*72/25.4);assert.equal(result.height,50*72/25.4);
 const layout=layoutApi.defaultShippingLayout('80x50');layout.elements.push({...layout.elements[0],id:'shipping-type',field:'shippingType',text:''});
 const dynamicSettings={...settings,shipping_custom_layout:JSON.stringify(layout)};
 for(const [carrier,carrierOther,expected] of [['jt','','J&amp;T'],['grab','','Grab'],['other','Jalat','Jalat'],['other','','Other']]){
  const pos_checkout={receipt:{shipping:{method:'delivery',carrier,carrierOther}}},delivery={...order,pos_checkout};
  const web=markup(dynamicSettings,{pos_checkout}),printed=mobile.mobileShippingHtml(delivery,{store},dynamicSettings,'USD');
  assert.ok(web.inner.includes(`>${expected}</div>`));assert.ok(printed.html.includes(web.inner));assert.ok(!printed.html.includes('{{shipping_type}}'));
 }
});

 test('legacy invalid saved QR requires review; invalid save is rejected; repaired save clears review',()=>{
 const layout=layoutApi.defaultShippingLayout('80x50');const qr=layout.elements.find(x=>x.field==='qr');qr.width=2;qr.height=3.2;
 const invalid={...saved,shipping_template:'custom',shipping_custom_layout:JSON.stringify(layout)};
 assert.throws(()=>templates.validateShippingSettings(invalid),/Order QR code must be at least/);
 const repaired=templates.validateShippingSettings(invalid,true);assert.equal(repaired.shipping_custom_qr_needs_review,true);
 const valid=templates.validateShippingSettings(repaired);assert.equal(valid.shipping_custom_qr_needs_review,undefined);
 const h=markup(repaired);assert.equal(h.paper.id,'80x50');
});
 test('actual order-link QR density changes minimum size with host length and includes quiet zones',()=>{
 const encoder=require('qrcode');const sizes=[];
 for(const root of ['short.test','storefront-a-very-long-example-hostname.test']){
  const domain=loadTs('lib/tenancy/domain.ts');const original=process.env.NEXT_PUBLIC_ROOT_DOMAIN;process.env.NEXT_PUBLIC_ROOT_DOMAIN=root;
  try{
   const realQr=loadTs('lib/orders/order-qr.ts',{qrcode:encoder,'@/lib/tenancy/domain':domain});
   const live=loadTs('lib/receipts/shipping-custom.ts',{'@/lib/receipts/receipt-model':loadTs('lib/receipts/receipt-model.ts'),qrcode:encoder,'@/lib/barcode/code39':loadTs('lib/barcode/code39.ts'),'@/lib/orders/order-qr':realQr,'./shipping-layout':layoutApi});
   const svg=realQr.orderQrSvg(order.order_code),modules=layoutApi.shippingQrModules(svg);
   assert.equal(modules,encoder.create(realQr.orderLink(order.order_code),{errorCorrectionLevel:'M'}).modules.size+8);
   const minimum=live.shippingOrderQrMinimumMm();assert.ok(minimum/modules*203/25.4>=4);
   assert.ok((minimum-.1)/modules*203/25.4<4);sizes.push(minimum);
  }finally{if(original===undefined)delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;else process.env.NEXT_PUBLIC_ROOT_DOMAIN=original;}
 }
 assert.ok(sizes[1]>sizes[0]);
});
 test('print preparation blocks actual payload QR density and legacy review even inside paper bounds',()=>{
 const preparation=loadTs('lib/printing/prepare-print.ts',{'@/lib/receipts/shipping-layout':layoutApi});
 let side=1.6;const svg=custom.shippingQr(order.order_code);const element={scrollWidth:10,clientWidth:10,scrollHeight:10,clientHeight:10,querySelector:()=>({outerHTML:svg}),getBoundingClientRect:()=>({left:0,top:0,right:side,bottom:side,width:side,height:side})};
 const label={dataset:{widthMm:'80',heightMm:'50'},matches:selector=>selector.includes('ship-custom')||selector==='.shipping-label',getBoundingClientRect:()=>({left:0,top:0,right:80,bottom:50,width:80,height:50}),querySelectorAll:()=>[element]};
 assert.equal(preparation.fitShippingLabel(label),false);assert.throws(()=>preparation.assertShippingLabelsFit(label),/Order QR needs at least/);
 side=layoutApi.shippingQrMinimumMm(layoutApi.shippingQrModules(svg));assert.equal(preparation.fitShippingLabel(label),true);
 label.dataset.customQrReview='true';assert.equal(preparation.fitShippingLabel(label),false);assert.throws(()=>preparation.assertShippingLabelsFit(label),/save the layout before printing/);
});

 test('text overflow warns but never blocks printing; legacy layouts are not blocked either',()=>{
 const preparation=loadTs('lib/printing/prepare-print.ts',{'@/lib/receipts/shipping-layout':layoutApi});
 const overflowing={scrollWidth:10,clientWidth:10,scrollHeight:30,clientHeight:10,querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0,right:40,bottom:60,width:40,height:60})};
 const label={dataset:{widthMm:'80',heightMm:'50'},matches:selector=>selector.includes('ship-custom')||selector==='.shipping-label',getBoundingClientRect:()=>({left:0,top:0,right:80,bottom:50,width:80,height:50}),querySelectorAll:()=>[overflowing]};
 assert.equal(preparation.fitShippingLabel(label),false);assert.equal(label.dataset.printOverflow,'true');
 assert.doesNotThrow(()=>preparation.assertShippingLabelsFit(label));
 const legacy={dataset:{widthMm:'80',heightMm:'50'},matches:selector=>selector==='.shipping-label',getBoundingClientRect:()=>({width:80,height:200})};
 assert.doesNotThrow(()=>preparation.assertShippingLabelsFit(legacy));
});
 test('a saved custom template missing from the branch catalogue does not crash label pages',()=>{
 const flags=Object.fromEntries(templates.SHIPPING_VISIBILITY_FLAGS.map(flag=>[`shipping_show_${flag}`,true]));
 const read=templates.validateShippingSettings({shipping_label_size:'80x50',shipping_template:'custom:gone',shipping_custom_templates:'[]',...flags},true);
 assert.equal(read.shipping_template,'en-classic');assert.equal(read.shipping_template_unavailable,true);assert.equal(read.shipping_label_size,'80x50');
 // Saving still rejects an unavailable selection.
 assert.throws(()=>templates.validateShippingSettings({shipping_label_size:'80x50',shipping_template:'custom:gone',shipping_custom_templates:'[]',...flags}),/unavailable/);
});
 test('loading a legacy tiny QR repairs only the returned branch settings and performs no write',async()=>{
 const layout=layoutApi.defaultShippingLayout('80x50');const qr=layout.elements.find(x=>x.field==='qr');qr.width=2;qr.height=3.2;
 const json=JSON.stringify({...saved,shipping_template:'custom',shipping_custom_layout:JSON.stringify(layout)});let writes=0;
 const api=loadTs('lib/receipts/shipping-design-store.ts',{'server-only':{},'./shipping-template-store':{loadShippingTemplateCatalog:async()=>null},'./shipping-templates':templates,'./shipping-layout':layoutApi,'@/lib/branches/context':{getBranchContext:async()=>({business:{id:'business-a'},branchId:'branch-a'})},'@/lib/branches/order-access':{authorizedOrderBranch:async()=> 'branch-a'},'@/lib/supabase/admin':{supabaseAdmin:{storage:{from:()=>({download:async path=>{assert.equal(path,'business-a/branch-a/shipping-settings.json');return {data:{text:async()=>json},error:null};},upload:async()=>{writes++;}})}}}});
 const result=await api.loadShippingSettings('business-a');assert.equal(result.shipping_custom_qr_needs_review,true);assert.equal(writes,0);
 const repaired=JSON.parse(result.shipping_custom_layout);layoutApi.validateShippingLayout(repaired,custom.shippingOrderQrMinimumMm());
 assert.equal(JSON.parse(JSON.parse(json).shipping_custom_layout).elements.find(x=>x.field==='qr').width,2);
 });

 test('named rich templates persist selected size and render the identical escaped runs in web and mobile output',()=>{
 const layout=layoutApi.defaultShippingLayout('80x50');layout.elements.push({...layout.elements[0],id:'rich-text',field:'text',text:'Hello សួស្តី <script>',richText:[{text:'Hello ',bold:true,fontSize:14},{text:'សួស្តី ',italic:true,underline:true},{text:'<script>'}],x:5,y:84,width:90,height:10});
 const library=JSON.stringify([{id:'template-a',name:'Custom EN/KM',layout}]);
 const settings=templates.validateShippingSettings({...saved,shipping_template:'custom:template-a',shipping_custom_templates:library});
 assert.equal(settings.shipping_template,'custom:template-a');assert.equal(templates.shippingTemplate(settings.shipping_template,settings.shipping_custom_templates).name,'Custom EN/KM');
 const rendered=markup(settings);assert.match(rendered.inner,/font-weight:700;font-size:14px/);assert.match(rendered.inner,/font-style:italic;text-decoration:underline/);assert.match(rendered.inner,/&lt;script&gt;/);assert.ok(!rendered.inner.includes('<script>'));
 const stored=templates.shippingCustomTemplates(settings.shipping_custom_templates)[0];assert.deepEqual(stored.layout,layout);assert.equal(stored.layout.size,'80x50');
 const mobile=loadTs('lib/mobile/shipping-html.ts',{'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),'@/lib/orders/order-contact':contact,'@/lib/orders/order-qr':qr,'@/lib/receipts/receipt-model':model,'@/app/(dashboard)/dashboard/orders/[id]/order-detail-model':{one:value=>Array.isArray(value)?value[0]:value},'./receipt-html':{escapeHtml:render.escapeShippingHtml},'@/lib/receipts/shipping-label-markup':render});
 assert.ok(mobile.mobileShippingHtml(order,{store},settings,'USD').html.includes(rendered.inner));
});
 test('named template names reject blanks, duplicates and overlong names; IDs and layouts are validated',()=>{
 const layout=layoutApi.defaultShippingLayout();
 for(const name of ['', ' '.repeat(5), 'a'.repeat(61)])assert.throws(()=>templates.shippingCustomTemplates(JSON.stringify([{id:'a',name,layout}])));
 assert.throws(()=>templates.shippingCustomTemplates(JSON.stringify([{id:'a',name:' Example ',layout},{id:'b',name:'example',layout}])));
 assert.throws(()=>templates.shippingCustomTemplates(JSON.stringify([{id:'a',name:'A',layout},{id:'a',name:'B',layout}])));
 assert.throws(()=>templates.validateShippingSettings({...saved,shipping_template:'custom:missing'}),/unavailable/);
});
 test('Save as new appends without deleting existing templates; explicit update changes only its identity',async()=>{
 const old={id:'old-template',name:'Existing',layout:layoutApi.defaultShippingLayout()};
 const h=shippingActions({current:{...saved,shipping_template:'en-classic',shipping_custom_templates:JSON.stringify([old])}});
 const draft={id:'new-template',name:'New template',layout:layoutApi.defaultShippingLayout('80x50')};
 h.form.set('shippingTemplate','custom:new-template');h.form.set('shippingCustomTemplateMode','create');h.form.set('shippingCustomTemplateDraft',JSON.stringify(draft));
 const result=await h.api.saveShippingCustomTemplate(h.form);const library=templates.shippingCustomTemplates(result.customTemplates);
 assert.deepEqual(library[0],old);assert.deepEqual(library[1],{...draft,revision:1});assert.equal(h.writes[0].value.shipping_template,'custom:new-template');
 const update=shippingActions({current:h.writes[0].value});update.form.set('shippingTemplate','custom:new-template');update.form.set('shippingCustomTemplateMode','update');update.form.set('shippingCustomTemplateOriginal',JSON.stringify(library[1]));update.form.set('shippingCustomTemplateDraft',JSON.stringify({...draft,name:'Renamed'}));
 const changed=templates.shippingCustomTemplates((await update.api.saveShippingCustomTemplate(update.form)).customTemplates);assert.deepEqual(changed[0],old);assert.equal(changed[1].id,draft.id);assert.equal(changed[1].name,'Renamed');
});
 test('named saves reject duplicate names, unintended overwrites, unknown updates, stale branches and denied permission',async()=>{
 const existing={id:'existing',name:'Existing',layout:layoutApi.defaultShippingLayout('80x50')};
 for(const scenario of [{id:'existing',name:'Overwrite',mode:'create'},{id:'new',name:'existing',mode:'create'},{id:'missing',name:'New',mode:'update'},{id:'new',name:'New',mode:'create',branch:'branch-b'},{id:'new',name:'New',mode:'create',denied:true}]){
  const h=shippingActions({current:{...saved,shipping_custom_templates:JSON.stringify([existing])},branch:scenario.branch||'branch-a',denied:scenario.denied});
  h.form.set('shippingTemplate','custom:'+scenario.id);h.form.set('shippingCustomTemplateMode',scenario.mode);h.form.set('shippingCustomTemplateDraft',JSON.stringify({id:scenario.id,name:scenario.name,layout:existing.layout}));
  await assert.rejects(h.api.saveShippingCustomTemplate(h.form));assert.equal(h.writes.length,0);assert.equal(h.invalidated.length,0);
 }
});

test('stale named edits reject without overwriting a newer saved template',async()=>{
 const original={id:'existing',name:'Original',layout:layoutApi.defaultShippingLayout('80x50')};
 const latest={...original,name:'Changed in another editor'};
 const h=shippingActions({current:{...saved,shipping_custom_templates:JSON.stringify([latest])}});
 h.form.set('shippingTemplate','custom:existing');h.form.set('shippingCustomTemplateMode','update');
 h.form.set('shippingCustomTemplateOriginal',JSON.stringify(original));h.form.set('shippingCustomTemplateDraft',JSON.stringify({...original,name:'My edit'}));
 await assert.rejects(h.api.saveShippingCustomTemplate(h.form),/changed since you opened/);assert.equal(h.writes.length,0);assert.equal(h.invalidated.length,0);
});

test('selected rich text can remove inherited underline without changing surrounding runs',()=>{
 const element={...layoutApi.defaultShippingLayout().elements[0],field:'text',text:'AB',underline:true,richText:[{text:'A'},{text:'B',underline:false}]};
 const html=custom.shippingElementMarkup(element,{});
 assert.match(html,/text-decoration:none/);assert.match(html,/<span style="text-decoration:underline">A<\/span><span style="text-decoration:none">B<\/span>/);
});

test('a committed named template stays successful when optional default-selection storage fails',async()=>{
 const h=shippingActions({failSave:true}),draft={id:'new',name:'New',layout:layoutApi.defaultShippingLayout('80x50')};
 h.form.set('shippingTemplate','custom:new');h.form.set('shippingCustomTemplateMode','create');h.form.set('shippingCustomTemplateDraft',JSON.stringify(draft));
 const result=await h.api.saveShippingCustomTemplate(h.form);assert.match(result.warning,/template was saved/);assert.equal(templates.shippingCustomTemplates(result.customTemplates)[0].revision,1);assert.ok(h.invalidated.length>0);
});
test('missing transactional migration blocks named saves without unsafe storage fallback or success invalidation',async()=>{
 const h=shippingActions({failNamed:true}),draft={id:'new',name:'New',layout:layoutApi.defaultShippingLayout('80x50')};
 h.form.set('shippingTemplate','custom:new');h.form.set('shippingCustomTemplateMode','create');h.form.set('shippingCustomTemplateDraft',JSON.stringify(draft));
 await assert.rejects(h.api.saveShippingCustomTemplate(h.form),/reviewed shipping custom template migration/);assert.equal(h.writes.length,0);assert.equal(h.invalidated.length,0);
});

test('custom font settings use the same English/Khmer styles in saved, web and mobile labels',()=>{
 const layout=layoutApi.defaultShippingLayout('80x50');Object.assign(layout.elements[0],{fontFamily:'khmer',lineHeight:1.6,letterSpacing:.2});
 const settings=templates.validateShippingSettings({...saved,shipping_template:'custom:fonts',shipping_custom_templates:JSON.stringify([{id:'fonts',name:'Khmer and English',layout}])});
 const output=markup(settings);assert.match(output.inner,/font-family:var\(--font-hanuman/);assert.match(output.inner,/line-height:1.6;letter-spacing:0.2px/);
 assert.deepEqual(templates.shippingCustomTemplates(settings.shipping_custom_templates)[0].layout,layout);
 const mobile=loadTs('lib/mobile/shipping-html.ts',{'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),'@/lib/orders/order-contact':contact,'@/lib/orders/order-qr':qr,'@/lib/receipts/receipt-model':model,'@/app/(dashboard)/dashboard/orders/[id]/order-detail-model':{one:value=>Array.isArray(value)?value[0]:value},'./receipt-html':{escapeHtml:render.escapeShippingHtml},'@/lib/receipts/shipping-label-markup':render});
 assert.ok(mobile.mobileShippingHtml(order,{store},settings,'USD').html.includes(output.inner));
});

test('braced dynamic tags persist as editable text and resolve identically for web and mobile printing',()=>{
 const layout=layoutApi.defaultShippingLayout('80x50'),text='To: {Customer name}\n{Delivery address}\n{Order number} · {Order total}';
 layout.elements.push({...layout.elements[0],id:'tag-text',field:'text',text,x:5,y:84,width:90,height:10});
 const settings=templates.validateShippingSettings({...saved,shipping_template:'custom:tags',shipping_custom_templates:JSON.stringify([{id:'tags',name:'Dynamic tags',layout}])});
 assert.equal(templates.shippingCustomTemplates(settings.shipping_custom_templates)[0].layout.elements.at(-1).text,text);
 const output=markup(settings);assert.ok(!output.inner.includes('{Customer name}'));assert.match(output.inner,/<span>To: <\/span><span>Uy Chea<\/span>/);assert.ok(output.inner.includes('Phnom Penh, Cambodia'));assert.ok(output.inner.includes('482193057716'));assert.ok(output.inner.includes('$18.00'));
 const mobile=loadTs('lib/mobile/shipping-html.ts',{'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),'@/lib/orders/order-contact':contact,'@/lib/orders/order-qr':qr,'@/lib/receipts/receipt-model':model,'@/app/(dashboard)/dashboard/orders/[id]/order-detail-model':{one:value=>Array.isArray(value)?value[0]:value},'./receipt-html':{escapeHtml:render.escapeShippingHtml},'@/lib/receipts/shipping-label-markup':render});assert.ok(mobile.mobileShippingHtml(order,{store},settings,'USD').html.includes(output.inner));
});

test('tags split across rich-text runs use the opening mark and escape order values without recursive substitution',()=>{
 const runs=[{text:'Hello '},{text:'{Customer ',bold:true},{text:'name}',italic:true},{text:' · {Shop name} · {Unknown field}'}];
 const values={customerName:'សួស្តី <img src=x>',storeName:'{Order total}',total:'$99'};
 const html=custom.shippingRichTextMarkup(runs,false,values);assert.match(html,/<span style="font-weight:700">សួស្តី &lt;img src=x&gt;<\/span>/);assert.ok(html.includes('{Order total}'));assert.ok(html.includes('{Unknown field}'));assert.ok(!html.includes('$99'));assert.ok(!html.includes('<img'));
 assert.deepEqual(runs[1],{text:'{Customer ',bold:true});assert.ok(custom.shippingRichTextMarkup(runs).includes('{Customer '));
 assert.ok(custom.shippingRichTextMarkup([{text:'{Delivery address}'}],false,{customerAddress:'អាសយដ្ឋាន '.repeat(100)}).includes('អាសយដ្ឋាន '.repeat(100)));
 assert.equal(custom.shippingRichTextMarkup([{text:'{Customer name}'}],false,{}),'<span></span>');
});
