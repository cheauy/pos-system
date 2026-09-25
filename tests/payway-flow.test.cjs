const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

const source = ts.transpileModule(fs.readFileSync('lib/payway/server.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load({ order = {}, payload = {}, environment = {}, failure = false } = {}) {
  const calls = [];
  const record = { id: 'order', business_id: 'business', status: 'pending_payment', total_amount: 10,
    currency: 'USD', payment_provider: 'aba_payway', payway_tran_id: 'TPTEST',
    payment_expires_at: new Date(Date.now() + 600000).toISOString(), ...order };
  const query = {
    is(...args) { calls.push(['filter', ...args]); return this; },
    select() { return this; }, eq(...args) { calls.push(['filter', ...args]); return this; },
    update(value) { calls.push(['update', value]); return this; },
    async maybeSingle() { return { data: record, error: null }; },
    then(resolve) { resolve({ error: null }); },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, Buffer, URL, AbortSignal,
    process: { env: { PAYWAY_ENV: 'sandbox', PAYWAY_MERCHANT_ID: 'test', PAYWAY_API_KEY: 'secret', TENH_APP_URL: 'https://example.com', ...environment } },
    fetch: async (url, options) => {
      calls.push(['fetch', url, options]);
      if (failure) throw new Error('Gateway unavailable');
      return { ok: true, json: async () => ({ status: { code: '00' }, data: { payment_status_code: 0, payment_status: 'APPROVED', payment_amount: 10, payment_currency: 'USD', ...payload } }) };
    },
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name.includes('supabase/admin')) return { supabaseAdmin: { from: name => {calls.push(['table',name]);return query;}, rpc: async (name, args) => { calls.push(['confirm', name, args]); return { data: { status: 'approved' }, error: null }; } } };
      if (name.includes('tenancy/domain')) return { getAppUrl: () => 'https://example.com' };
      throw new Error(name);
    },
  });
  return { api: exports, calls };
}
test('PayWay refuses live mode without explicit activation and mismatched gateway hosts', () => {
  assert.throws(() => load({ environment: { PAYWAY_ENV: 'live' } }).api.getPaywayConfig(), /LIVE_ENABLED/);
  assert.throws(() => load({ environment: { PAYWAY_CHECK_TRANSACTION_URL: 'https://example.com/check' } }).api.getPaywayConfig(), /host|PayWay/i);
});
test('subscription purchase signs numeric zero shipping and requests ABA KHQR', async () => {
  const { api } = load();
  const checkout = await api.prepareSubscriptionPaywayCheckout({ orderId: 'order', businessId: 'business', email: 'owner@example.com' });
  const fields = checkout.fields;
  assert.equal(fields.shipping, '0.00');
  assert.equal(fields.payment_option, 'abapay_khqr');
  assert.equal(fields.view_type, 'popup');
  const signed = Object.entries(fields).filter(([key]) => !['hash', 'view_type', 'payment_gate'].includes(key)).map(([, value]) => value).join('');
  assert.equal(fields.hash, crypto.createHmac('sha512', 'secret').update(signed).digest('base64'));
  assert.equal(JSON.parse(Buffer.from(fields.items, 'base64').toString())[0].price, Number(fields.amount));
});
test('approved payment uses signed server lookup and business-scoped confirmation', async () => {
  const { api, calls } = load();
  assert.equal((await api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order', businessId: 'business' })).state, 'approved');
  assert.ok(calls.some(c => c[0] === 'filter' && c[1] === 'business_id' && c[2] === 'business'));
  const options = calls.find(c => c[0] === 'fetch')[2];
  const body = JSON.parse(options.body);
  assert.equal(body.hash, crypto.createHmac('sha512', 'secret').update(body.req_time + body.merchant_id + body.tran_id).digest('base64'));
  assert.equal(options.cache, 'no-store');
  assert.equal(calls.filter(c => c[0] === 'confirm').length, 1);
});
test('wrong amount or currency never activates a subscription', async () => {
  for (const payload of [{ payment_amount: 9 }, { payment_currency: 'KHR' }]) {
    const { api, calls } = load({ payload });
    await assert.rejects(api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order' }), /does not match/);
    assert.ok(!calls.some(c => c[0] === 'confirm'));
  }
});
test('pending payment and gateway failure never activate a subscription', async () => {
  const pending = load({ payload: { payment_status_code: 1, payment_status: 'PENDING' } });
  assert.equal((await pending.api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order' })).state, 'pending');
  assert.ok(!pending.calls.some(c => c[0] === 'confirm'));
  const failed = load({ failure: true });
  await assert.rejects(failed.api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order' }), /unavailable/);
  assert.ok(!failed.calls.some(c => c[0] === 'confirm'));
});
test('duplicate confirmation does not activate or call gateway again', async () => {
  const { api, calls } = load({ order: { status: 'approved', payway_verified_at: new Date().toISOString() } });
  assert.equal((await api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order' })).alreadyConfirmed, true);
  assert.ok(!calls.some(c => c[0] === 'confirm' || c[0] === 'fetch'));
});
test('rechecking a scanned but unpaid QR stays pending and fetches fresh status', async () => {
  const { api, calls } = load({ payload: { payment_status: 'SCANNED', payment_status_code: 1 } });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order' })).state, 'pending');
  }
  assert.equal(calls.filter(c => c[0] === 'fetch').length, 2);
  assert.ok(!calls.some(c => c[0] === 'confirm' || c[0] === 'update'));
});
test('approved payment after expiry is placed under review instead of activated', async () => {
  const { api, calls } = load({ order: { payment_expires_at: '2020-01-01T00:00:00Z' } });
  assert.equal((await api.verifyAndConfirmSubscriptionPaywayPayment({ orderId: 'order' })).state, 'late_payment_review');
  assert.equal(calls.find(c => c[0] === 'update')[1].status, 'under_review');
  assert.ok(!calls.some(c => c[0] === 'confirm'));
});
test('switching away from a late approved payment never reports activation or permits replacement', async () => {
  const { api, calls } = load({ order: { payment_expires_at: '2020-01-01T00:00:00Z' } });
  const result = await api.cancelSubscriptionPaywayCheckout({ orderId: 'order', businessId: 'business' });
  assert.equal(result.state, 'provider_close_unavailable');
  assert.match(result.message, /review/);
  assert.ok(!calls.some(c => c[0] === 'confirm'));
});
test('business-credit checkout uses the same signed popup but grants credits separately',async()=>{
  const {api,calls}=load({order:{credit_purchase:true}});
  const checkout=await api.prepareSubscriptionPaywayCheckout({orderId:'order',businessId:'business',kind:'business_change'});
  assert.equal(checkout.fields.view_type,'popup');
  assert.match(Buffer.from(checkout.fields.return_url,'base64').toString(),/business-change\/callback$/);
  assert.match(checkout.fields.continue_success_url,/settings\/business\/payment\/order\/payway-return$/);
  await api.verifyAndConfirmSubscriptionPaywayPayment({orderId:'order',businessId:'business',kind:'business_change'});
  assert.ok(calls.filter(c=>c[0]==='table').every(c=>c[1]==='business_change_orders'));
  assert.equal(calls.find(c=>c[0]==='confirm')[1],'confirm_payway_business_change_order');
});
test('business-credit checkout rejects manual evidence and never confirms a scanned QR',async()=>{
  const manual=load({order:{credit_purchase:true,proof_path:'receipt.png',payment_provider:null,payway_tran_id:null}});
  await assert.rejects(manual.api.prepareSubscriptionPaywayCheckout({orderId:'order',businessId:'business',kind:'business_change'}),/Manual payment/);
  const pending=load({payload:{payment_status:'SCANNED',payment_status_code:1}});
  assert.equal((await pending.api.verifyAndConfirmSubscriptionPaywayPayment({orderId:'order',kind:'business_change'})).state,'pending');
  assert.ok(!pending.calls.some(c=>c[0]==='confirm'));
});
test('callback signature rejects missing and tampered messages', () => {
  const { api } = load();
  const payload = { tran_id: 'TPTEST', amount: '10.00' };
  const signature = crypto.createHmac('sha512', 'secret').update('10.00TPTEST').digest('base64');
  assert.equal(api.verifyPaywayCallbackSignature(payload, signature), true);
  assert.equal(api.verifyPaywayCallbackSignature(payload, null), false);
  assert.equal(api.verifyPaywayCallbackSignature({ ...payload, amount: '1.00' }, signature), false);
});
