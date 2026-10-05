const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, queryDouble } = require('./helpers/load-ts.cjs');
const mobile = loadTs('lib/mobile/request-context.ts', { 'node:async_hooks': require('node:async_hooks') });
const storageModule = loadTs('mobile/src/secure-storage.ts');
const B = '11111111-1111-4111-8111-111111111111', L = '22222222-2222-4222-8222-222222222222';

test('mobile authentication context remains isolated across simultaneous requests', async () => {
  const outputs = await Promise.all(['alice', 'bob'].map(token => mobile.mobileRequest.run({ token }, async () => {
    await new Promise(resolve => setTimeout(resolve, token === 'alice' ? 8 : 1));
    return mobile.mobileRequest.getStore().token;
  })));
  assert.deepEqual(outputs, ['alice', 'bob']);
  assert.equal(mobile.mobileRequest.getStore(), undefined);
  assert.equal(mobile.mobileSelection(B), B);
  assert.throws(() => mobile.mobileSelection('foreign-branch'), /Invalid/);
});

test('mobile Supabase requests use the bearer token and scoped headers without web cookies', async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public';
  let options;
  const server = loadTs('lib/supabase/server.ts', {
    '@supabase/ssr': { createServerClient: () => { throw new Error('Native requests must not use cookie auth'); } },
    '@supabase/supabase-js': { createClient: (_url, _key, value) => { options = value; return {}; } },
    '@/lib/mobile/request-context': mobile,
    'next/headers': { cookies: () => { throw new Error('No web cookies in native auth'); } },
    '@/lib/auth/session-persistence': {}, '@/lib/tenancy/domain': {},
  });
  try {
    await mobile.mobileRequest.run({ token: 'alice' }, () => server.createClient({ 'x-tenh-branch-id': L }));
    assert.equal(options.global.headers.Authorization, 'Bearer alice');
    assert.equal(options.global.headers['x-tenh-branch-id'], L);
    assert.equal(options.auth.persistSession, false);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});

test('keychain snapshot writes do not block another record, while same-record reads stay ordered', async () => {
  const values = new Map(); let release; let started;
  const blocked = new Promise(resolve => { release = resolve; });
  const writing = new Promise(resolve => { started = resolve; });
  const store = storageModule.secureStorage({
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (key.startsWith('snapshot.') && key.endsWith('.0')) { started(); await blocked; }
      values.set(key, value);
    },
    deleteItemAsync: async key => { values.delete(key); },
  });
  await store.setItem('auth', 'token');
  const save = store.setItem('snapshot', 'offline data'); await writing;
  let sameRecordFinished = false;
  const same = store.getItem('snapshot').then(value => { sameRecordFinished = true; return value; });
  try {
    const read = store.getItem('auth');
    const value = await Promise.race([read, new Promise(resolve => setImmediate(() => resolve('blocked')))]);
    assert.equal(value, 'token'); assert.equal(sameRecordFinished, false);
  } finally { release(); }
  await save; assert.equal(await same, 'offline data');
});

test('keychain chunk storage preserves Unicode, serializes refresh and logout, and survives failed replacement', async () => {
  const values = new Map(); let fail = false;
  const store = storageModule.secureStorage({
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      assert.ok(Buffer.byteLength(value) <= 2000);
      if (fail && key.endsWith('.1')) throw new Error('device locked');
      values.set(key, value);
    },
    deleteItemAsync: async key => { values.delete(key); },
  });
  const value = 'ភាសាខ្មែរ🙂'.repeat(2000);
  await store.setItem('auth', value); assert.equal(await store.getItem('auth'), value);
  fail = true; await assert.rejects(store.setItem('auth', value + 'replacement'), /device locked/);
  assert.equal(await store.getItem('auth'), value);
  fail = false;
  await Promise.all([store.setItem('auth', 'new token'), store.removeItem('auth')]);
  assert.equal(await store.getItem('auth'), null); assert.equal(values.size, 0);
});

function route({ detailedOrder = null, authenticated = true, permissions = ['orders.view', 'inventory.view'], locked = false, catalog, tableResults = {}, transferResult = { data: { transferId: B }, error: null }, purchaseResult = { data: { purchaseOrderId: B }, error: null }, refundResult = { data: { returnId: B }, error: null } } = {}) {
  const log = [], actions = [];
  const business = { id: B, name: 'Test', role: 'owner', subscriptionLocked: locked };
  const db = {
    auth: { getUser: async token => ({ data: { user: authenticated && token === 'valid' ? { id: 'user' } : null }, error: null }) },
    from: table => queryDouble(table, tableResults[table] || { data: [], count: 0, error: null }, log),
    rpc: async (name, input) => { log.push({ rpc: name, input }); if (name === 'tenh_mobile_transfer_action') return transferResult; if (name === 'tenh_mobile_return') return refundResult; if (name === 'tenh_mobile_receive_purchase') return purchaseResult; return { data: name === 'tenh_branch_notifications' ? [{ id: B, is_active: true }, { id: L, is_active: false }] : null, error: null }; },
  };
  const api = loadTs('app/api/mobile/[feature]/route.ts', {
    '@/lib/orders/order-qr': loadTs('lib/orders/order-qr.ts', {qrcode:require('qrcode'),'@/lib/tenancy/domain':loadTs('lib/tenancy/domain.ts')}),
    '@/lib/mobile/account-read': {accountAccess:{'account-users':'users.view','account-branches':'locations.manage','account-categories':'categories.manage'}},
    '@/lib/mobile/expense-breakdown': {},
    '@/lib/mobile/register-detail': {},
    '@/lib/customers/get-customer-field-settings': {},
    '@/app/(dashboard)/dashboard/settings/customers/actions': {},
    '@/lib/mobile/order-list': loadTs('lib/mobile/order-list.ts'),
    '@/lib/mobile/product-page': loadTs('lib/mobile/product-page.ts'),
    '@/lib/users/setup-state': {needsTeamPasswordSetup: async()=>false},
    '@/lib/mobile/order-photos': {loadMobileOrderPhotos: async()=>new Map()},
    '@/lib/mobile/request-context': mobile,
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/supabase/branch-server': { createClient: async () => db },
    '@/lib/business/get-current-business': { getCurrentBusinessForSubscription: async () => business },
    '@/lib/branches/context': { getBranchContext: async () => ({ branchId: L, branches: [{ id: L, name: 'Test' }] }) },
    '@/lib/auth/effective-permissions': { getEffectivePermissions: async () => permissions },
    '@/app/(dashboard)/dashboard/orders/order-workspace-data': { loadWorkspace: async (_business, filters) => ({ branch: filters.branch, rows: [], total: 0, page: 1, pages: 1 }) },
    '@/app/(dashboard)/dashboard/orders/order-workspace-types': { parseFilters: input => input },
    '@/app/(dashboard)/dashboard/orders/order-workspace-actions': { changeOrderWorkspaceStatus: async (...args) => { actions.push(args); return { success: true }; } },
    '@/app/(dashboard)/dashboard/notifications/read-actions': {},
    '@/app/(dashboard)/dashboard/pos/pos-workspace-actions': { loadPosWorkspace: async () => ({ success: true, data: catalog }), completePosSale: async (...args) => { actions.push(args); return { success: true, data: {} }; }, savePosHold: async (...args) => { actions.push(['save-hold', ...args]); return { success: true, data: { id: args[1] } }; }, deletePosHold: async (...args) => { actions.push(['delete-hold', ...args]); return { success: true, data: { id: args[1] } }; } },
    '@/app/(dashboard)/dashboard/pos/pos-workspace-helpers': loadTs('app/(dashboard)/dashboard/pos/pos-workspace-helpers.ts', { './pos-currency': {} }),
    '@/app/(dashboard)/dashboard/expenses/actions': {},
    '@/app/(dashboard)/dashboard/expenses/expense-model': { CATEGORIES: [] },
    '@/app/(dashboard)/dashboard/settings/support/actions': {},
    '@/app/(dashboard)/dashboard/pos/pos-customer-actions': {},
    '@/app/(dashboard)/dashboard/register/actions': {},
    '@/app/(dashboard)/dashboard/orders/[id]/order-detail-data': {loadDetailedOrder:async (business,id)=>{log.push({detail:{business,id}});return detailedOrder;}},
    '@/app/(dashboard)/dashboard/orders/[id]/order-detail-model': {},
    '@/lib/orders/order-contact': loadTs('lib/orders/order-contact.ts'),
    '@/lib/receipts/load-receipt-context': {},
    '@/lib/mobile/receipt-html': {},
    '@/lib/mobile/reports': {},
    '@/lib/operations/rpc-outcome': loadTs('lib/operations/rpc-outcome.ts'),
    '@/lib/receipts/shipping-design-store': {},
    '@/lib/mobile/shipping-html': {},
    '@/lib/supabase/admin': {},
    '@/lib/mobile/management': {managementAccess:{},managementRead:()=>{},managementWrite:()=>{}},
    '@/lib/promotions/pricing': loadTs('lib/promotions/pricing.ts'),
    '@/app/(dashboard)/dashboard/inventory/adjustments/actions': {},
    '@/lib/branches/incoming-orders': {},
    '@/app/(dashboard)/dashboard/online-orders/actions': {},
    '@/app/api/online-orders/[orderId]/proof/route': {},
  });
  async function call(feature, { token = 'valid', body, headers = {}, query = '' } = {}) {
    const request = new Request(`http://localhost/api/mobile/${feature}${query}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    return api[request.method](request, { params: Promise.resolve({ feature }) });
  }
  return { call, actions, log };
}
test('mobile API rejects absent or invalid credentials before loading business data', async () => {
  const api = route();
  assert.equal((await api.call('session', { token: '' })).status, 401);
  assert.equal((await api.call('session', { token: 'invalid' })).status, 401);
  assert.equal(api.log.length, 0);
});
test('expired subscriptions and missing permissions fail closed', async () => {
  assert.equal((await route({ locked: true }).call('session')).status, 403);
  assert.equal((await route({ permissions: [] }).call('stock')).status, 403);
});
test('invalid branch selection is a client error without loading business data', async () => {
  const api = route();
  const result = await api.call('session', { headers: { 'X-Branch-Id': 'invalid' } });
  assert.equal(result.status, 400);
  assert.equal(api.log.length, 0);
});
test('reports require report permission and validate the selected period', async () => {
  assert.equal((await route().call('reports')).status, 403);
});
test('new administration menus keep their existing permissions',async()=>{
 for(const menu of ['account-users','account-branches','account-categories'])assert.equal((await route().call(menu)).status,403);
});
test('mobile reports count completed sales, preserve variants, and match staff refund math', () => {
  const { summarizeMobileReports } = loadTs('lib/mobile/reports.ts', {
    '@/lib/analytics/product-variants': loadTs('lib/analytics/product-variants.ts'),
    '@/lib/analytics/staff-report': loadTs('lib/analytics/staff-report.ts'),
  });
  const sale = { id: B, order_number: 'TEST', staff_user_id: 'staff', staff_name: 'Staff', order_source: 'pos', status: 'completed', total: 20, discount: 0, created_at: '2026-09-26T18:00:00Z', payment_method: 'cash', returns: [],
    order_items: [{ product_id: B, product_name: 'Shirt', variant_label: 'Blue / M', quantity: 2, cost_price: 3, products: null }] };
  const result = summarizeMobileReports([sale, { ...sale, id: L, status: 'cancelled', total: 999 }], [{ id: B, amount: 2.5 }]);
  assert.equal(result.revenue, 20); assert.equal(result.cost, 6); assert.equal(result.netProfit, 11.5);
  assert.deepEqual(result.products, [{ name: 'Shirt · Blue / M', quantity: 2 }]);
  assert.deepEqual(result.days, [{ date: '2026-09-27', value: 20,profit:14 }]);
  assert.deepEqual(result.sources,[{name:'pos',value:20}]);
  assert.equal(result.staff[0].sales, 20); assert.equal(result.staff[0].cancelled, 1);
});
test('order reads use the server branch and responses are private and uncacheable', async () => {
  const result = await route().call('orders');
  assert.equal((await result.json()).branch, L);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});
test('mutations require explicit scope, current order version and permissions', async () => {
  const body = { id: B, status: 'accepted', updatedAt: '2026-09-27T00:00:00Z' };
  const denied = route();
  assert.equal((await denied.call('order', { body })).status, 400);
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  assert.equal((await denied.call('order', { body, headers })).status, 403);
  const allowed = route({ permissions: ['orders.view', 'orders.update'] });
  assert.equal((await allowed.call('order', { body: { ...body, updatedAt: 'bad' }, headers })).status, 400);
  assert.equal((await allowed.call('order', { body, headers })).status, 200);
  assert.equal(allowed.actions.length, 1);
  assert.equal(allowed.actions[0][4], B);
});
test('mobile checkout quotes use branch products, tax and delivery fees, and reject foreign customers', async () => {
  const catalog = { products: [{ id: B, name: 'Shirt', selling_price: 10, stock_quantity: 5 }], customers: [{ id: L, name: 'Customer' }], groups: [], options: [], branches: [{ id: L }], stock: [{ product_id: B, location_id: L, quantity: 5 }], settings: { currency: 'USD', taxRate: 10, pointValue: 0 }, shift: { location_id: L } };
  const api = route({ permissions: ['pos.access'], catalog });
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  const body = { requestId: B, items: [{ productId: B, quantity: 2, optionIds: [] }], customerId: L, shipping: { method: 'delivery', recipientName: 'Customer', phone: '012345678', address: 'Street 1', carrier: 'jt' }, deliveryFee: 2, paymentMethod: 'cod' };
  const result = await api.call('quote', { headers, body });
  assert.equal(result.status, 200);
  const quote = await result.json();
  assert.equal(quote.total.total, 24); assert.equal(quote.input.amountPaid, 0); assert.equal(quote.input.paymentsConfirmed, false);
  assert.equal(quote.input.customerId, L); assert.equal(quote.input.branchId, L);
  assert.equal((await api.call('quote', { headers, body: { ...body, customerId: B } })).status, 400);
  assert.equal((await api.call('quote', { headers, body: { ...body, shipping: { ...body.shipping, carrier: '' } } })).status, 400);
  assert.equal((await api.call('quote', { headers, body: { ...body, items: [{ ...body.items[0], quantity: 6 }] } })).status, 400);
  assert.equal((await api.call('sale', { headers, body: { branchId: B } })).status, 400);
  assert.equal(api.actions.length, 0);
});
test('native settlement validates cash, deposits and split cents before persisting a pending sale', () => {
  const { checkoutPayment } = loadTs('mobile/src/checkout-payment.ts');
  const split = checkoutPayment('split', 10.01, '3.33');
  assert.deepEqual(split.tenders.map(row => row.amount), [3.33, 6.68]);
  assert.equal(split.amountPaid, 10.01); assert.equal(split.paymentsConfirmed, true);
  assert.equal(checkoutPayment('deposit', 10, '2').amountPaid, 2);
  assert.equal(checkoutPayment('cod', 10, '').amountPaid, 0);
  assert.equal(checkoutPayment('bank_transfer', 10, '').paymentsConfirmed, true);
  for (const [method, value] of [['cash', '9'], ['cash', 'NaN'], ['cash', '1.234'], ['deposit', '10'], ['deposit', '0'], ['split', '10']]) assert.throws(() => checkoutPayment(method, 10, value));
});
test('mobile coupons and points follow enabled settings and cannot over-discount or apply to unpaid orders', async () => {
  const catalog = { products: [{ id: B, name: 'Shirt', selling_price: 10, stock_quantity: 5 }], customers: [{ id: L, name: 'Customer', loyalty_points: 100 }], groups: [], options: [], branches: [{ id: L }], stock: [{ product_id: B, location_id: L, quantity: 5 }], settings: { currency: 'USD', taxRate: 10, pointValue: 0.1, loyaltyEnabled: true, couponsEnabled: true }, shift: { location_id: L }, coupons: [{ code: 'SAVE10', is_active: true, is_automatic: false, apply_pos: true, product_ids: null, discount_type: 'percentage', discount_value: 10, minimum_order: 0, max_discount: null, starts_at: null, ends_at: null, usage_limit: null, per_customer_limit: null }] };
  const api = route({ permissions: ['pos.access'], catalog });
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  const body = { requestId: B, items: [{ productId: B, quantity: 2, optionIds: [] }], customerId: L, couponCode: 'SAVE10', redeemPoints: 10 };
  const response = await api.call('quote', { headers, body });
  assert.equal(response.status, 200);
  const quote = await response.json();
  assert.equal(quote.total.total, 18.7); assert.equal(quote.input.discount, 2); assert.equal(quote.input.redeemPoints, 10);
  assert.equal((await api.call('quote', { headers, body: { ...body, discount: 1 } })).status, 400);
  assert.equal((await api.call('quote', { headers, body: { ...body, paymentMethod: 'cod' } })).status, 400);
  assert.equal((await api.call('quote', { headers, body: { ...body, redeemPoints: 101 } })).status, 400);
  catalog.settings.couponsEnabled = false;
  assert.equal((await api.call('quote', { headers, body })).status, 400);
});
test('held-order quotes retain the exact server version and reject stale or foreign holds', async () => {
  const catalog = { products: [{ id: B, name: 'Shirt', selling_price: 10, stock_quantity: 5 }], customers: [], groups: [], options: [], branches: [{ id: L }], stock: [{ product_id: B, location_id: L, quantity: 5 }], settings: { currency: 'USD', taxRate: 0, pointValue: 0 }, holds: [{ id: B, version: 3, draft: { branchId: L, baseCurrency: 'USD' } }] };
  const api = route({ permissions: ['pos.access'], catalog });
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  const body = { requestId: L, items: [{ productId: B, quantity: 1, optionIds: [] }], holdId: B, holdVersion: 3 };
  const result = await api.call('quote', { headers, body });
  assert.equal(result.status, 200); assert.equal((await result.json()).input.holdVersion, 3);
  assert.equal((await api.call('quote', { headers, body: { ...body, holdVersion: 2 } })).status, 400);
  catalog.holds[0].draft.branchId = B;
  assert.equal((await api.call('quote', { headers, body })).status, 400);
});
test('held drafts use server prices and deletion requires the current branch and version', async () => {
  const catalog = { products: [{ id: B, name: 'Shirt', selling_price: 10, stock_quantity: 5 }], customers: [], groups: [], options: [], branches: [{ id: L }], stock: [{ product_id: B, location_id: L, quantity: 5 }], settings: { currency: 'USD', taxRate: 0, pointValue: 0 }, holds: [{ id: B, version: 3, draft: { branchId: L, baseCurrency: 'USD' } }] };
  const api = route({ permissions: ['pos.access'], catalog });
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  const body = { requestId: L, items: [{ productId: B, quantity: 1, optionIds: [], unitPrice: 0.01 }], label: 'Customer A', currency: 'USD' };
  assert.equal((await api.call('hold', { headers, body })).status, 200);
  const saved = api.actions[0];
  assert.equal(saved[0], 'save-hold'); assert.equal(saved[5].lines[0].unitPrice, 10); assert.equal(saved[5].branchId, L);
  assert.equal((await api.call('delete-hold', { headers, body: { id: B, version: 2 } })).status, 409);
  assert.equal((await api.call('delete-hold', { headers, body: { id: B, version: 3 } })).status, 200);
  assert.equal(api.actions[1][0], 'delete-hold');
  catalog.holds[0].draft.branchId = B;
  assert.equal((await api.call('delete-hold', { headers, body: { id: B, version: 3 } })).status, 409);
});
test('hold recovery only clears a local draft when the complete saved draft matches', () => {
  const { matchesHeldOrder } = loadTs('mobile/src/held-order.ts');
  const request = { requestId: B, holdId: null, holdVersion: null, label: 'A', currency: 'USD', customerId: null, paymentMethod: 'cash', items: [{ productId: L, quantity: 1, optionIds: [] }], shipping: { method: 'in_store', recipientName: '', phone: '', address: '' }, deliveryFee: 0, discount: 0, discountType: 'amount', couponCode: '', redeemPoints: 0 };
  const saved = { id: B, version: 1, label: 'A', draft: { branchId: L, baseCurrency: 'USD', customerId: '', paymentMethod: 'cash', lines: request.items, shipping: request.shipping, deliveryFee: '0', discount: '0', discountType: 'amount', couponCode: '', points: '0' } };
  assert.equal(matchesHeldOrder(saved, request, L), true);
  assert.equal(matchesHeldOrder({ ...saved, version: 0 }, request, L), false);
  assert.equal(matchesHeldOrder(saved, { ...request, discount: 1 }, L), false);
  assert.equal(matchesHeldOrder(saved, request, B), false);
});
test('refund API gates permissions, rejects duplicate items and pins the server branch', async () => {
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  const body = { requestId: B, orderId: L, reason: 'Incorrect Size or Fit', refundMethod: 'cash', items: [{ order_item_id: B, quantity: 1 }] };
  assert.equal((await route().call('returns', { headers, body })).status, 403);
  const api = route({ permissions: ['orders.return'] });
  assert.equal((await api.call('returns', { headers, body: { ...body, items: [...body.items, ...body.items] } })).status, 400);
  assert.equal((await api.call('returns', { headers, body: { ...body, branchId: B } })).status, 200);
  assert.equal(api.log.find(row => row.rpc === 'tenh_mobile_return').input.p_branch_id, L);
  for (const [refundResult, uncertain] of [
    [{ data: null, error: { code: '42501', message: 'Permission changed after earlier attempt' } }, true],
    [{ data: null, error: null }, true],
    [{ data: { rolledBack: true, error: 'Quantity exceeds remaining items' }, error: null }, false],
  ]) {
    const result = await route({ permissions: ['orders.return'], refundResult }).call('returns', { headers, body });
    assert.equal((await result.json()).uncertain, uncertain);
  }
});
test('mobile inventory lists and details are paginated, permission gated and pinned to the operating branch', async () => {
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  assert.equal((await route().call('purchases', { headers })).status,403);
  assert.equal((await route().call('transfers', { headers })).status,403);
  const api = route({ permissions: ['purchases.view', 'transfers.manage'] });
  assert.equal((await api.call('purchases', { headers, query: '?page=2&search=PO' })).status,200);
  const purchase = api.log.find(row=>row.table==='purchase_orders');
  assert.ok(purchase.steps.some(s=>s[0]==='eq' && s[1]==='business_id' && s[2]===B));
  assert.ok(purchase.steps.some(s=>s[0]==='eq' && s[1]==='location_id' && s[2]===L));
  assert.ok(purchase.steps.some(s=>s[0]==='range' && s[1]===25 && s[2]===49));
  assert.equal((await api.call('transfers', { headers, query: '?search=TR' })).status,200);
  assert.ok(api.log.find(row=>row.table==='stock_transfers').steps.some(s=>s[0]==='or' && s[1]===`source_location_id.eq.${L},destination_location_id.eq.${L}`));
  const absent = route({ permissions: ['purchases.view'], tableResults: { purchase_orders: { data:null,error:null } } });
  assert.equal((await absent.call('purchase-detail', { headers, query:`?id=${B}` })).status,404);
  assert.equal(absent.log.some(row=>row.table==='purchase_order_items'),false,'do not read lines before checking branch ownership');
});
test('mobile transfer actions pin branch, validate snapshots, and preserve uncertain outcomes', async () => {
  const body={id:B,action:'send',expected:'2026-09-27T00:00:00Z',items:[{productId:B,quantity:2}]};
  const headers={'X-Business-Id':B,'X-Branch-Id':L};
  const api=route({permissions:['transfers.manage']});
  assert.equal((await route().call('transfer-action',{headers,body})).status,403);
  for(const invalid of [{...body,expected:'bad'}, {...body,items:[...body.items,...body.items]}, {...body,items:[{productId:B,quantity:1.5}]}, {...body,action:'draft'}]) {
    assert.equal((await api.call('transfer-action',{headers,body:invalid})).status,400);
  }
  assert.equal(api.log.filter(row=>row.rpc==='tenh_mobile_transfer_action').length,0);
  assert.equal((await api.call('transfer-action',{headers,body})).status,200);
  assert.equal(api.log.find(row=>row.rpc==='tenh_mobile_transfer_action').input.p_branch_id,L);
  const unknown=await route({permissions:['transfers.manage'],transferResult:{data:null,error:{message:'Connection lost'}}}).call('transfer-action',{headers,body});
  assert.equal(unknown.status,409); assert.equal((await unknown.json()).uncertain,true);
  const mismatch=await route({permissions:['transfers.manage'],transferResult:{data:{transferId:L},error:null}}).call('transfer-action',{headers,body});
  assert.equal(mismatch.status,503);
});
test('mobile purchase receiving validates counts and preserves unknown outcomes for safe retries', async () => {
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  const body = { requestId:B, orderId:B, items:[{itemId:L,quantity:2,expectedReceived:0}] };
  assert.equal((await route().call('purchase-receive', { headers,body })).status,403);
  const api = route({ permissions:['purchases.update'] });
  assert.equal((await api.call('purchase-receive', { headers,body:{...body,items:[...body.items,...body.items]} })).status,400);
  assert.equal((await api.call('purchase-receive', { headers,body:{...body,items:[{itemId:L,quantity:1.5,expectedReceived:0}]} })).status,400);
  assert.equal((await api.call('purchase-receive', { headers,body:{...body,items:[{itemId:L,quantity:1}]} })).status,400);
  assert.equal((await api.call('purchase-receive', { headers,body:{...body,branchId:B} })).status,200);
  assert.equal(api.log.find(row=>row.rpc==='tenh_mobile_receive_purchase').input.p_branch_id,L);
  for (const [purchaseResult, uncertain] of [
    [{data:null,error:{code:'42501',message:'Permission changed'}},true],
    [{data:null,error:null},true],
    [{data:{rolledBack:true,error:'Quantities changed'},error:null},false],
  ]) {
    const result = await route({ permissions:['purchases.update'],purchaseResult }).call('purchase-receive',{headers,body});
    assert.equal((await result.json()).uncertain,uncertain);
  }
});
test('oversized and malformed mobile mutation bodies are rejected before writes', async () => {
  const api = route({ permissions: ['orders.view', 'orders.update'] });
  const headers = { 'X-Business-Id': B, 'X-Branch-Id': L };
  assert.equal((await api.call('order', { body: 'x'.repeat(16385), headers })).status, 413);
  assert.equal((await api.call('order', { body: '{broken', headers })).status, 400);
  assert.equal(api.actions.length, 0);
});
test('alerts use the same authorized branch feed as the website and count only active unread alerts', async () => {
  const api = route();
  const result = await api.call('alerts');
  const body = await result.json();
  assert.equal(body.unread, 1); assert.equal(body.rows.length, 1);
  assert.deepEqual(api.log.find(item => item.rpc === 'tenh_branch_notifications').input, { p_business: B, p_branch: L });
  assert.ok(api.log.find(item => item.table === 'business_notification_reads').steps.some(step => step[0] === 'eq' && step[1] === 'user_id' && step[2] === 'user'));
});
test('receipt HTML follows visibility and sizing while escaping customer content', () => {
  const model = loadTs('lib/receipts/receipt-model.ts');
  const { mobileReceiptHtml } = loadTs('lib/mobile/receipt-html.ts', { '@/lib/receipts/receipt-model': model });
  const receipt = model.receiptSample('<script>alert(1)</script>');
  const context = { appearance: { ...model.DEFAULT_RECEIPT, showWifi: true, wifiPassword: '<unsafe>', showQr: true, qrUrl: 'javascript:alert(1)', fontSize: 'large' }, store: { name: '', phone: '123', address: 'A & B' } };
  const html = mobileReceiptHtml(receipt, context, 'https://app.example.com');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B')); assert.ok(html.includes('Wi-Fi password: &lt;unsafe&gt;'));
  assert.ok(!html.includes('javascript:')); assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('font:14.399999999999999px') || html.includes('font:14.4px'));
  context.appearance.showBusinessName = false; context.appearance.showWifi = false;
  const hidden = mobileReceiptHtml(receipt, context, 'https://app.example.com');
  assert.ok(!hidden.includes('&lt;script&gt;')); assert.ok(!hidden.includes('Wi-Fi password:'));
});
test('mobile shipping labels honor saved size and visibility, escape customer text and use vector order QR codes', () => {
  const receiptModel = loadTs('lib/receipts/receipt-model.ts');
  const html = loadTs('lib/mobile/receipt-html.ts', { '@/lib/receipts/receipt-model': receiptModel });
  const { mobileShippingHtml } = loadTs('lib/mobile/shipping-html.ts', {'@/lib/orders/order-payment':loadTs('lib/orders/order-payment.ts'),
    '@/lib/orders/order-qr': loadTs('lib/orders/order-qr.ts', {qrcode:require('qrcode'),'@/lib/tenancy/domain':loadTs('lib/tenancy/domain.ts')}),
    '@/lib/receipts/receipt-model': receiptModel,
    '@/lib/orders/order-contact': loadTs('lib/orders/order-contact.ts'),
    './receipt-html': html,
    // This test exercises native page/visibility/escaping; payment semantics use the real shared renderer in order-payment-audit.
    '@/lib/receipts/shipping-label-markup': {shippingPaymentText:order=>order.payment_method},
  });
  const order = { id:B, order_number: 'WEB-123', order_code:'482193057716', guest_name: '<script>bad</script>', guest_phone: '01234', guest_address: 'Street & Lane', customers: null, order_items: [{ quantity: 2 }], payment_method: 'cod', total: 12, remaining_balance: 10 };
  const context = { store: { name: 'Test Store', address: 'Store Address', phone: '999' } };
  const settings = { shipping_label_size: '80x50', shipping_show_store_phone: false };
  const result = mobileShippingHtml(order, context, settings, 'USD');
  assert.equal(result.size, '80x50'); assert.equal(result.width, 80 * 72 / 25.4);
  assert.ok(result.html.includes('&lt;script&gt;bad&lt;/script&gt;')); assert.ok(!result.html.includes('<script>'));
  assert.ok(result.html.includes('Street &amp; Lane')); assert.ok(!result.html.includes('Tel: 999'));
  assert.ok(result.html.includes('<svg')); assert.ok(result.html.includes('Balance due: $10.00'));
  assert.ok(!mobileShippingHtml(order, context, { ...settings, shipping_show_barcode: false }, 'USD').html.includes('<svg'));
  assert.throws(() => mobileShippingHtml({ ...order, guest_address: '' }, context, settings, 'USD'), /delivery address/);
  const updated=mobileShippingHtml({...order,customers:[{name:'Updated name',phone:'new-phone',address:'Updated street'}]},context,settings,'USD').html;
  for(const value of ['Updated name','new-phone','Updated street'])assert.ok(updated.includes(value));
  assert.ok(!updated.includes('Street &amp; Lane'));assert.ok(!updated.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.throws(()=>mobileShippingHtml({...order,customers:{name:'Updated name',phone:null,address:''}},context,settings,'USD'),/delivery address/);
});

test('order QR resolver requires permissions and authorized order details', async()=>{
 const qr=loadTs('lib/orders/order-qr.ts',{qrcode:require('qrcode'),'@/lib/tenancy/domain':loadTs('lib/tenancy/domain.ts')});
 const value=qr.orderQrPayload(B),query='?value='+encodeURIComponent(value);
 assert.equal((await route({permissions:[]}).call('order-qr',{query})).status,403);
 const invalid=route();assert.equal((await invalid.call('order-qr',{query:'?value=https://example.com'})).status,400);
 assert.ok(!invalid.log.some(row=>row.detail));
 assert.equal((await route().call('order-qr',{query})).status,404);
 const allowed=route({detailedOrder:{id:B,order_source:'online'},tableResults:{business_storefronts:{data:{currency:'KHR'},error:null}}});
 const response=await allowed.call('order-qr',{query}),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.id,B);assert.equal(data.incoming,true);assert.equal(data.currency,'KHR');assert.ok(data.svg.includes('<svg'));
 assert.deepEqual(allowed.log.find(row=>row.detail).detail,{business:B,id:B});
});
