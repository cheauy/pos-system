/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source fixtures use the repository's TS loader. */
// Executes the actual component hooks and callbacks with isolated doubles.
// This is synthetic React/route scheduling, not a browser or database test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {loadTs} = require('./helpers/load-ts.cjs');
const refreshApi = loadTs('lib/orders/workspace-refresh.ts');
const types = loadTs('app/(dashboard)/dashboard/orders/order-workspace-types.ts');
let current;
const renderers = new Set();
function slot(init) {const i = current.cursor++; return current.slots[i] ??= init();}
const hooks = {
  useState(init) {
    const owner = current;
    const state = slot(() => ({value: typeof init === 'function' ? init() : init}));
    return [state.value, value => {const next = typeof value === 'function' ? value(state.value) : value; if (!Object.is(next, state.value)) {state.value = next; owner.dirty = true;}}];
  },
  useRef(init) {return slot(() => ({current: init}));},
  useEffect(fn, deps) {
    const state = slot(() => ({}));
    if (!state.deps || deps.some((value, i) => !Object.is(value, state.deps[i]))) {
      current.effects.push(() => {state.deps = deps; state.cleanup?.(); state.cleanup = fn();});
    }
  },
  useMemo(fn) {slot(() => ({})); return fn();},
  useTransition() {slot(() => ({})); return [false, fn => fn()];},
  useSyncExternalStore(_subscribe, snapshot) {slot(() => ({})); return snapshot();},
  useActionState(_action, initial) {slot(() => ({})); return [initial, () => {throw Error('No real returns in fixtures');}, false];},
};
const jsx = {jsx: (type, props, key) => ({type, props, key}), jsxs: (type, props, key) => ({type, props, key})};
function elements(root, predicate, result = []) {
  if (Array.isArray(root)) root.forEach(node => elements(node, predicate, result));
  else if (root && typeof root === 'object' && root.props) {
    if (predicate(root)) result.push(root);
    elements(root.props.children, predicate, result);
  }
  return result;
}
function component(root, name) {return elements(root, node => node.type?.name === name)[0];}
function renderer(fn, props) {
  const r = {fn, props, cursor: 0, slots: [], effects: [], dirty: true, tree: null,
    render() {
      this.cursor = 0; this.effects = []; this.dirty = false; current = r;
      this.tree = this.fn(this.props); current = null;
      if (this.dirty) return this.render();
      for (const node of elements(this.tree, node => node.type === 'dialog' && node.props.ref)) {
        node.props.ref.current ??= {showModal() {}, close() {}};
      }
      this.effects.forEach(effect => effect()); return this.tree;
    },
    update(next) {this.props = next; this.dirty = true;},
    dispose() {this.slots.forEach(state => state.cleanup?.()); renderers.delete(this);},
  };
  renderers.add(r); r.render(); return r;
}
async function settle() {
  for (let i = 0; i < 12; i++) {await Promise.resolve(); for (const r of renderers) if (r.dirty) r.render();}
}
function clock() {
  let now = 0, id = 0; const timers = new Map();
  return {setTimeout(fn, ms) {const key = ++id; timers.set(key, {fn, at: now + ms}); return key;}, clearTimeout(key) {timers.delete(key);},
    setInterval(fn, ms) {const key = ++id; timers.set(key, {fn, at: now + ms, ms}); return key;}, clearInterval(key) {timers.delete(key);},
    async advance(ms) {
      await settle(); const end = now + ms;
      while (true) {
        let next; for (const entry of timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
        if (!next) break; now = next[1].at;
        if (next[1].ms) next[1].at += next[1].ms; else timers.delete(next[0]);
        next[1].fn(); await settle();
      }
      now = end; await settle();
    }, pending: () => timers.size};
}
const row = (id = 'selected', updatedAt = 'v1') => ({id, updatedAt, orderNumber: id, customerId: null, customerName: 'Sample', customerPhone: null, source: 'pos', fulfillment: 'walk_in', status: 'pending', onlineStatus: null, paymentState: 'unpaid', paymentMethod: 'cash', total: 10, amountPaid: 0, createdAt: '2026-10-04T00:00:00Z', branchId: 'branch', branchName: 'Branch', itemCount: 1, deleteBlocked: false});
function fixture({receiveAll = false, baseline = false, delayDetail = false, statusSucceeds = false} = {}) {
  const time = clock(); const saved = {};
  const document = new EventTarget(); document.visibilityState = 'visible'; document.activeElement = null; document.body = {};
  const window = new EventTarget(); window.localStorage = {getItem: () => '0'}; window.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  for (const [name, value] of Object.entries({window, document, HTMLElement: class HTMLElement {}, localStorage: window.localStorage, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, setInterval: time.setInterval, clearInterval: time.clearInterval})) {
    saved[name] = global[name]; global[name] = value;
  }
  const counts = {route: 0, detail: 0, summary: 0, announcements: 0, mutations: 0};
  const subscriptions = []; let rows = [row()], returnRevision = 0, incoming = [], pendingDetail = [];
  let workspace;
  const data = () => ({rows: rows.map(r => ({...r})), total: rows.length, page: 1, pages: 1, counts: {}, metrics: {today: 0, yesterday: 0, completed: 0, pending: 0, pendingValue: 0, refunds: 0, refundedAmount: 0}, currency: 'USD', timezone: 'UTC', branches: [{id: 'branch', name: 'Branch'}], receiveAllOnline: receiveAll});
  const router = {refresh() {counts.route++; time.setTimeout(() => workspace.update({...workspace.props, data: data()}), 20);}, push() {}};
  const createClient = () => ({channel() {
    const channel = {handlers: [], on(_name, filter, fn) {channel.handlers.push({filter, fn}); return channel;}, subscribe(fn) {channel.statusFn = fn; subscriptions.push(channel); fn?.('SUBSCRIBED'); return channel;}}; return channel;
  }, removeChannel(channel) {subscriptions.splice(subscriptions.indexOf(channel), 1);}});
  const getOrderWorkspaceDetail = async id => {
    counts.detail++;
    const value = {...(rows.find(r => r.id === id) ?? row(id)), returnRevision, note: 'Saved note', guestName: 'Guest', guestPhone: '', guestAddress: '', changeAmount: 0, subtotal: 10, discount: 0, deliveryFee: 0, couponCode: null, couponDiscount: 0, remainingBalance: 10, returnsUnavailable: false, activity: [], items: [{id: 'item', name: 'Item', options: [], quantity: 5, returnedQuantity: returnRevision, unitPrice: 2, subtotal: 10}]};
    if (delayDetail) return new Promise(resolve => pendingDetail.push(() => resolve({success: true, data: value})));
    return {success: true, data: value};
  };
  const failMutation = () => {throw Error('Real financial/order mutations prohibited in fixtures');};
  // Synthetic success: models Next applying the action's revalidatePath payload 20ms later. No real mutation.
  const statusAction = async () => {counts.mutations++; rows = rows.map(r => r.id === 'selected' ? {...r, status: 'in_progress', updatedAt: 'v2'} : r); time.setTimeout(() => workspace.update({...workspace.props, data: data()}), 20); return {success: true, data: undefined};};
  const deps = {
    '@/components/providers/language-provider': {useLanguage: () => ({language: 'en', t: text => text})},
    '@/lib/i18n/translations': loadTs('lib/i18n/translations.ts'),
    react: hooks, 'react/jsx-runtime': jsx, 'react-dom': {createPortal: child => child}, 'next/link': {default: () => null}, 'next/navigation': {useRouter: () => router},
    'lucide-react': new Proxy({}, {get: () => () => null}), './orders-workspace.module.css': new Proxy({}, {get: (_obj, key) => key}),
    './[id]/return-items-form': {default: function ReturnItemsForm() {}}, './[id]/order-detail-controls': {CancelOrderItem: () => null},
    '@/components/order-print-menu': {default: () => null}, '@/components/product-photo': {default: () => null}, '@/components/order-print-preview': {default: () => null}, '@/components/cancel-order-form': {default: () => null},
    './order-workspace-actions': {getOrderWorkspaceDetail, changeOrderWorkspaceStatus: statusSucceeds ? statusAction : failMutation, deleteOrderWorkspaceOrder: failMutation, saveOrderWorkspaceDetails: failMutation},
    './order-workspace-types': types, '@/lib/currency-format': {formatStoreMoney: () => ''}, '../online-orders/actions': {setIncomingOrderScope: failMutation, updateOnlinePaymentStatus: failMutation},
    '@/lib/supabase/client': {createClient}, '@/lib/supabase/realtime-topic': {realtimeTopic: x => x}, '@/components/online-order-listener': {ORDER_ALERTS_KEY: 'alerts', ORDER_SOUND_KEY: 'sound'},
    '@/lib/orders/workspace-refresh': refreshApi, sonner: {toast: {success() {counts.announcements++;}, error() {}}},
    '@/app/(dashboard)/dashboard/online-orders/actions': {incomingOrderSummary: async () => {counts.summary++; return incoming;}},
  };
  const sourceRoot = baseline ? process.env.TENH_PERF_BASELINE : path.join(__dirname, '..');
  assert.ok(sourceRoot, 'Set TENH_PERF_BASELINE for paired baseline measurements');
  function load(file, extra = '') {
    const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8') + extra;
    const code = ts.transpileModule(source, {fileName: file, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}}).outputText;
    const m = {exports: {}}; new Function('require', 'module', 'exports', code)(id => {assert.ok(id in deps, id); return deps[id];}, m, m.exports); return m.exports;
  }
  const orderModule = load('app/(dashboard)/dashboard/orders/orders-workspace.tsx', '\nexport {DetailPanel,ManageOrderDialog};');
  workspace = renderer(orderModule.default, {businessId: 'business', branchId: 'branch', businessName: 'Sample', data: data(), filters: types.parseFilters({}), permissions: {edit: true, cancel: true, refund: true, create: true, delete: true}});
  const listener = renderer(load('components/online-order-listener.tsx').default, {businessId: 'business', branchId: 'branch', receiveAll});
  return {time, counts, workspace, orderModule, deps, get detail() {return component(workspace.tree, 'DetailPanel').props.detail;},
    async ready() {await time.advance(25);},
    emit(event = 'UPDATE', id = 'other', source = 'pos', location = 'branch') {
      for (const s of subscriptions) for (const h of s.handlers) if (h.filter.event === '*' || h.filter.event === event) h.fn({eventType: event, new: {id, order_source: source, location_id: location}, old: {id}});
    },
    changeSelected(patch) {rows = rows.map(r => r.id === 'selected' ? {...r, ...patch} : r);},
    removeSelectedFromPage() {rows = [row('new-first')];},
    setReturnRevision(value) {returnRevision = value;}, setIncoming(value) {incoming = value;},
    subscriptionError() {subscriptions.forEach(channel => channel.statusFn?.('CHANNEL_ERROR'));},
    rerender() {workspace.update({...workspace.props, data: data()});},
    manual() {elements(workspace.tree, node => node.type === 'button' && node.props.onClick?.name === 'refresh')[0].props.onClick();},
    visibility(value) {document.visibilityState = value; document.dispatchEvent(new Event('visibilitychange'));},
    resolveDetails() {pendingDetail.splice(0).forEach(fn => fn());},
    dispose() {workspace.dispose(); listener.dispose(); for (const r of [...renderers]) r.dispose(); for (const [name, value] of Object.entries(saved)) {if (value === undefined) delete global[name]; else global[name] = value;}},
  };
}
async function withFixture(fn, options) {const f = fixture(options); try {await f.ready(); await fn(f);} finally {f.dispose();}}
const delta = (counts, initial) => ({route: counts.route - initial.route, detail: counts.detail - initial.detail});

test('unrelated rows and identical route payloads do not reload selected detail', () => withFixture(async f => {
  const initial = {...f.counts};
  for (let i = 0; i < 10; i++) {f.emit(); await f.time.advance(1000);}
  assert.deepEqual(delta(f.counts, initial), {route: 10, detail: 0});
  for (let i = 0; i < 50; i++) {f.rerender(); await settle();}
  assert.equal(f.counts.detail, initial.detail);
}));
test('both existing listeners share one refresh for a new online order and keep its alert', () => withFixture(async f => {
  const initial = {...f.counts}; f.emit('INSERT', 'new', 'online'); await f.time.advance(1000);
  assert.deepEqual(delta(f.counts, initial), {route: 1, detail: 0}); assert.equal(f.counts.announcements, 1);
}));
test('bursts coalesce; a subscription failure does not start timed polling', () => withFixture(async f => {
  let initial = {...f.counts};
  for (let i = 0; i < 100; i++) {f.emit(); await f.time.advance(2);}
  await f.time.advance(1000); assert.deepEqual(delta(f.counts, initial), {route: 1, detail: 0});
  initial = {...f.counts}; f.subscriptionError(); f.setReturnRevision(2); await f.time.advance(30000);
  assert.deepEqual(delta(f.counts, initial), {route: 0, detail: 0});
  f.manual(); await f.time.advance(100); assert.equal(f.detail.returnRevision, 2);
}));
test('selected changes refresh payment/status details once with the merged route response', () => withFixture(async f => {
  const initial = {...f.counts}; f.changeSelected({updatedAt: 'v2', paymentState: 'paid', amountPaid: 10}); f.emit('UPDATE', 'selected'); await f.time.advance(1000);
  assert.deepEqual(delta(f.counts, initial), {route: 1, detail: 1}); assert.equal(f.detail.updatedAt, 'v2'); assert.equal(f.detail.paymentState, 'paid');
}));
test('a selected-order change refreshes related returns with the merged route response', () => withFixture(async f => {
  const initial = {...f.counts}; await f.time.advance(29700); f.setReturnRevision(1); f.emit('UPDATE', 'selected'); await f.time.advance(1000);
  assert.deepEqual(delta(f.counts, initial), {route: 1, detail: 1}); assert.equal(f.detail.updatedAt, 'v1'); assert.equal(f.detail.items[0].returnedQuantity, 1);
}));
test('no idle auto refresh; manual refresh, hidden tabs and visibility catch-up remain', () => withFixture(async f => {
  let initial = {...f.counts}; await f.time.advance(120100); assert.deepEqual(delta(f.counts, initial), {route: 0, detail: 0});
  initial = {...f.counts}; f.manual(); await f.time.advance(100); assert.deepEqual(delta(f.counts, initial), {route: 1, detail: 1});
  initial = {...f.counts}; f.visibility('hidden'); f.emit(); await f.time.advance(120100); assert.deepEqual(delta(f.counts, initial), {route: 0, detail: 0});
  f.visibility('visible'); await f.time.advance(1000); assert.deepEqual(delta(f.counts, initial), {route: 1, detail: 1});
}));
test('a closed detail panel skips fetching until explicitly reopened', () => withFixture(async f => {
  component(f.workspace.tree, 'DetailPanel').props.onClose(); await settle(); const initial = {...f.counts};
  f.emit('UPDATE', 'selected'); await f.time.advance(31000); assert.equal(f.counts.detail, initial.detail);
  elements(f.workspace.tree, node => node.type === 'button' && node.props.children === 'Show details')[0].props.onClick(); await settle();
  assert.equal(f.counts.detail, initial.detail + 1);
}));
test('receive-all summary polling and branch/source alert guards remain', async () => {
  await withFixture(async f => {f.setIncoming([{id: 'incoming'}]); await f.time.advance(60100); assert.equal(f.counts.summary, 4); assert.equal(f.counts.announcements, 1);}, {receiveAll: true});
  await withFixture(async f => {f.emit('INSERT', 'foreign', 'online', 'other-branch'); await f.time.advance(1000); assert.equal(f.counts.announcements, 0); f.emit('INSERT', 'pos', 'pos'); await f.time.advance(1000); assert.equal(f.counts.announcements, 0);});
});
test('teardown cancels timers and stale detail responses cannot overwrite a new selection', async () => {
  await withFixture(async f => {f.emit(); f.workspace.dispose(); await f.time.advance(40000); assert.equal(f.counts.route, 0);});
  await withFixture(async f => {
    const panel = component(f.workspace.tree, 'DetailPanel'); panel.props.onAction('edit', row());
    f.workspace.update({...f.workspace.props, data: {...f.workspace.props.data, rows: [row(), row('second')]}}); await settle();
    const secondButton = elements(f.workspace.tree, node => node.type === 'button' && node.props['aria-label'] === 'View order second')[0];
    // The row button's accessible name includes the order number in this UI.
    const secondRow = elements(f.workspace.tree, node => node.type === 'tr' && node.props.onClick)[1];
    assert.ok(secondButton || secondRow); (secondButton?.props.onClick ?? secondRow.props.onClick)(); await settle();
    f.resolveDetails(); await settle(); assert.equal(f.detail.id, 'second');
  }, {delayDetail: true});
});
test('a selected order pushed off the list keeps its detail/return component identity', () => withFixture(async f => {
  const panel = renderer(f.orderModule.DetailPanel, component(f.workspace.tree, 'DetailPanel').props);
  const before = component(panel.tree, 'ReturnItemsForm'); assert.equal(before.key, 'selected');
  f.removeSelectedFromPage(); f.emit('INSERT', 'new-first'); await f.time.advance(1000);
  assert.equal(f.detail.id, 'selected'); panel.update(component(f.workspace.tree, 'DetailPanel').props); await settle();
  const after = component(panel.tree, 'ReturnItemsForm'); assert.equal(after.type, before.type); assert.equal(after.key, before.key);
}));
test('dirty edit and return state survives unrelated refreshes in the same verified scope', () => withFixture(async f => {
  component(f.workspace.tree, 'DetailPanel').props.onAction('edit', row()); await settle();
  const dialog = renderer(f.orderModule.ManageOrderDialog, component(f.workspace.tree, 'ManageOrderDialog').props); await settle();
  const note = elements(dialog.tree, node => node.type === 'textarea' && node.props.placeholder?.startsWith('Add a note for this order'))[0];
  assert.ok(note, JSON.stringify(elements(dialog.tree, node => ['textarea','input','p'].includes(node.type)).map(node => ({type: node.type, props: node.props}))));
  note.props.onChange({target: {value: 'Unsaved edit'}}); await settle();
  const returnForm = loadTs('app/(dashboard)/dashboard/orders/[id]/return-items-form.tsx', {
    '@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},
    '@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),react: hooks, 'react/jsx-runtime': jsx, 'react-dom': {createPortal: child => child}, sonner: {toast: {success() {}}}, 'next/navigation': {useRouter: () => ({refresh() {}})}, 'lucide-react': f.deps['lucide-react'], './return-actions': {createOrderReturn() {throw Error('No real returns');}}, '@/components/product-photo': {default: () => null}}).default;
  const props = {orderId: 'selected', orderNumber: 'selected', items: [{id: 'item', product_name: 'Item', quantity: 5, returned_quantity: 0, unit_price: 2}]};
  const returns = renderer(returnForm, props);
  elements(returns.tree, node => node.type === 'button')[0].props.onClick(); await settle();
  const returnNote = elements(returns.tree, node => node.type === 'textarea' && node.props.placeholder?.startsWith('Add a note'))[0]; returnNote.props.onChange({target: {value: 'Unsaved return'}}); await settle();
  f.emit(); await f.time.advance(1000); dialog.update(component(f.workspace.tree, 'ManageOrderDialog').props); returns.update({...props, items: props.items.map(item => ({...item}))}); await settle();
  assert.equal(elements(dialog.tree, node => node.type === 'textarea' && node.props.placeholder?.startsWith('Add a note for this order'))[0].props.value, 'Unsaved edit');
  assert.equal(elements(returns.tree, node => node.type === 'textarea' && node.props.placeholder?.startsWith('Add a note'))[0].props.value, 'Unsaved return');
  assert.equal(elements(returns.tree, node => node.type === 'dialog').length, 1);
}));
test('retained details keep currency units across viewing filters, deletion and empty-list selection', () => withFixture(async f => {
  const before = component(f.workspace.tree, 'DetailPanel').props;
  const nextData = {...f.workspace.props.data, rows: [row('branch-B')], currency: 'KHR'};
  f.workspace.update({...f.workspace.props, filters: {...f.workspace.props.filters, branch: 'branch-B'}, data: nextData}); await settle();
  let panel = component(f.workspace.tree, 'DetailPanel').props;
  assert.equal(panel.detail.id, 'selected'); assert.equal(panel.currency, 'USD');
  assert.equal(panel.currencyFormat, before.currencyFormat);
  panel.onAction('delete', row()); await settle();
  component(f.workspace.tree, 'ManageOrderDialog').props.onSuccess('Deleted', 'selected'); await settle();
  panel = component(f.workspace.tree, 'DetailPanel').props;
  assert.equal(panel.detail.id, 'branch-B'); assert.equal(panel.currency, 'KHR');
  // Model a new workspace whose initial list has no selected order.
  f.workspace.dispose();
  const empty = renderer(f.orderModule.default, {...f.workspace.props, filters: {...f.workspace.props.filters, branch: 'branch-A'}, data: {...nextData, rows: [], currency: 'USD'}});
  empty.update({...empty.props, filters: {...empty.props.filters, branch: 'branch-B'}, data: nextData}); await settle();
  panel = component(empty.tree, 'DetailPanel').props;
  assert.equal(panel.detail.id, 'branch-B'); assert.equal(panel.currency, 'KHR');
}));
test('shared refresh dispatch falls back outside Orders and cannot cross its branch/business scope', () => withFixture(async f => {
  const initial = {...f.counts};
  assert.equal(refreshApi.requestOrdersWorkspaceRefresh('foreign-business', 'branch'), false);
  assert.equal(refreshApi.requestOrdersWorkspaceRefresh('business', 'foreign-branch'), false);
  await f.time.advance(1000); assert.deepEqual(delta(f.counts, initial), {route: 0, detail: 0});
  f.workspace.dispose(); assert.equal(refreshApi.requestOrdersWorkspaceRefresh('business', 'branch'), false);
}));
test('Orders page keys draft state to verified business, user and operating branch', async () => {
  let context = {userId: 'user', branchId: 'branch'}, businessId = 'business';
  const page = loadTs('app/(dashboard)/dashboard/orders/page.tsx', {'react/jsx-runtime': jsx, 'next/link': {default() {}}, 'lucide-react': {AlertCircle() {}}, '@/lib/auth/require-permission': {requirePermission: async () => ({id: businessId})}, '@/lib/auth/effective-permissions': {businessHasPermission: async () => true}, './order-workspace-data': {loadWorkspace: async () => ({})}, './order-workspace-types': types, './orders-workspace': {default() {}}, '@/lib/business/get-current-business-mode': {getCurrentBusinessMode: async () => ({value: 'fashion'})}, '@/lib/branches/context': {getBranchContext: async () => context}}).default;
  const first = await page({searchParams: Promise.resolve({})}); const same = await page({searchParams: Promise.resolve({page: '2'})}); assert.equal(first.key, same.key);
  context = {...context, branchId: 'other'}; assert.notEqual((await page({searchParams: Promise.resolve({})})).key, first.key);
  context = {userId: 'other-user', branchId: 'branch'}; assert.notEqual((await page({searchParams: Promise.resolve({})})).key, first.key);
  context = {userId: 'user', branchId: 'branch'}; businessId = 'other-business'; assert.notEqual((await page({searchParams: Promise.resolve({})})).key, first.key);
});

if (process.env.TENH_PERF_BASELINE) test('paired actual-source fixture request counts', async () => {
  const results = [];
  for (const [scenario, run] of [
    ['ten spaced unrelated updates', async f => {for (let i = 0; i < 10; i++) {f.emit(); await f.time.advance(1000);}}],
    ['one online insert reaches both listeners', async f => {f.emit('INSERT', 'new', 'online'); await f.time.advance(1000);}],
    ['selected update', async f => {f.changeSelected({updatedAt: 'v2'}); f.emit('UPDATE', 'selected'); await f.time.advance(1000);}],
    ['120s visible idle', async f => {await f.time.advance(120100);}],
  ]) {
    const result = {scenario};
    for (const baseline of [true, false]) await withFixture(async f => {const initial = {...f.counts}; await run(f); result[baseline ? 'before' : 'after'] = delta(f.counts, initial);}, {baseline});
    results.push(result);
  }
  assert.deepEqual(results.map(r => r.before), [{route: 10, detail: 10}, {route: 2, detail: 2}, {route: 1, detail: 1}, {route: 4, detail: 4}]);
  assert.deepEqual(results.map(r => r.after), [{route: 10, detail: 0}, {route: 1, detail: 0}, {route: 1, detail: 1}, {route: 4, detail: 4}]);
  if (process.env.TENH_PERF_REPORT) fs.writeFileSync(process.env.TENH_PERF_REPORT, JSON.stringify({label: 'Synthetic actual-source effect/action counts. Arbitrary 20ms route response scheduling; not measured network latency.', results}, null, 2));
});

async function measureStatusClick(baseline) {
  let result;
  await withFixture(async f => {
    const panel = renderer(f.orderModule.DetailPanel, component(f.workspace.tree, 'DetailPanel').props);
    const progress = () => elements(panel.tree, node => node.type === 'button' && Array.isArray(node.props.children) && ['In Progress', 'Updating…', 'Complete'].includes(node.props.children[1]))[0];
    const initial = {...f.counts};
    progress().props.onClick(); progress().props.onClick(); await settle();
    const pendingShown = progress().props.disabled === true;
    progress().props.onClick(); // A third click while pending must not submit.
    await f.time.advance(1000); panel.update(component(f.workspace.tree, 'DetailPanel').props); await settle();
    result = {route: f.counts.route - initial.route, detail: f.counts.detail - initial.detail, mutations: f.counts.mutations - initial.mutations, pendingShown, status: f.detail.status, enabledAfter: progress()?.props.disabled === false};
  }, {statusSucceeds: true, baseline});
  return result;
}
test('status action shows pending, submits once, and reloads only the affected detail', async () => {
  const after = await measureStatusClick(false);
  if (process.env.TENH_PERF_BASELINE) console.log('status click counts', JSON.stringify({before: await measureStatusClick(true), after}));
  assert.deepEqual(after, {route: 0, detail: 1, mutations: 1, pendingShown: true, status: 'in_progress', enabledAfter: true});
});
