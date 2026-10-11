import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { loadTs } from './helpers/load-ts.cjs';

const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate); if (match) return match;
  }
};

test('compact filters apply drafts after closing and restore trigger focus', () => {
  const events = [], effects = [];
  const Filters = loadTs('app/(dashboard)/dashboard/suppliers/compact-supplier-filters.tsx', {
    'react/jsx-runtime': jsx, 'lucide-react': icons,
    '@/components/providers/language-provider': { useLanguage: () => ({ t: text => text }) },
    './suppliers-responsive.module.css': { default: {} },
    react: { useState: () => [true, value => events.push(['open', value])], useRef: current => ({ current }), useEffect: effect => effects.push(effect) },
  }).default;
  const tree = Filters({ search: '', status: 'inactive', onSearch() {}, onApply: value => events.push(['apply', value]) });
  const dialog = find(tree, node => node.type === 'dialog');
  const trigger = find(tree, node => node.props?.['aria-haspopup'] === 'dialog');
  const select = find(tree, node => node.type === 'select');
  assert.equal(select.props.defaultValue, 'inactive');
  assert.equal(select.props.onChange, undefined);
  assert.deepEqual(events, []);
  const saved = { FormData: globalThis.FormData, window: globalThis.window };
  globalThis.FormData = class { get() { return 'active'; } };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  dialog.props.ref.current = { showModal() {}, close: () => events.push(['close']) };
  trigger.props.ref.current = { focus: () => events.push(['focus']) };
  try {
    const cleanup = effects[0]();
    find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    assert.deepEqual(events, [['open', false], ['apply', 'active']]);
    cleanup();
    assert.deepEqual(events.slice(-2), [['close'], ['focus']]);
    events.length = 0;
    dialog.props.onCancel({ preventDefault() {} });
    assert.deepEqual(events, [['open', false]]);
  } finally { Object.assign(globalThis, saved); }
});

test('compact supplier sheet preserves field requirements and guards busy dismissal and viewport resizing', () => {
  const effects = [], states = [];
  let stateIndex = 0;
  const Client = loadTs('app/(dashboard)/dashboard/suppliers/suppliers-client.tsx', {
    '@/components/providers/language-provider': { useLanguage: () => ({ language: 'en', t: text => text }) },
    '@/lib/i18n/translations': loadTs('lib/i18n/translations.ts'),
    'react/jsx-runtime': jsx, 'next/link': () => null, 'lucide-react': icons,
    '@/components/pending-submit-button': { ButtonSpinner: () => null },
    react: { useState: initial => [stateIndex++ === 3 ? true : initial, value => states.push(value)], useMemo: fn => fn(), useEffect: effect => effects.push(effect), useRef: current => ({ current }) },
    'react-dom': { createPortal: node => node }, sonner: { toast: { success() {} } },
    '@/components/mobile-list-card': { default: () => null, MobileList: () => null },
    '@/components/ui/content-skeleton': { default: () => null },
    './compact-supplier-filters': { default: () => null },
    './suppliers-responsive.module.css': { default: {} },
    './list-actions': { loadSuppliers() {} },
    '@/lib/use-paged-workspace': { usePagedWorkspace: data => ({ data, busy: false, error: '' }) },
    './actions': { createSupplier() {}, updateSupplier() {}, deleteSupplier() {}, toggleSupplierStatus() {} },
  }).default;
  const tree = Client({ workspace: { suppliers: [], total: 0, page: 1, metrics: {}, stats: { total: 0, active: 0, thisMonthOrders: 0, openPoValue: 0 } } });
  const dialogElement = find(tree, node => node.type?.name === 'SupplierDialog');
  const formElement = dialogElement.props.children;
  const form = formElement.type(formElement.props);
  for (const name of ['name', 'contactPerson', 'phone', 'address']) assert.equal(find(form, node => node.props?.name === name).props.required, true);
  assert.equal(find(form, node => node.props?.name === 'email').props.type, 'email');
  assert.equal(find(form, node => node.props?.name === 'email').props.required, undefined);
  const notes = find(form, node => node.type === 'details');
  assert.equal(notes.props.open, undefined);
  assert.equal(find(notes, node => node.props?.name === 'notes').type, 'textarea');
  assert.equal(find(form, node => node.props?.name === 'address').type, 'textarea');
  assert.equal(find(find(form, node => node.type === 'fieldset'), node => node.props?.type === 'submit'), undefined);
  assert.equal(find(form.props.children.at(-1), node => node.props?.type === 'submit').type, 'button');

  const saved = { document: globalThis.document, window: globalThis.window };
  const listeners = new Map(), properties = new Map();
  let closed = 0, scrolled = 0;
  const focused = { scrollIntoView: () => scrolled++ };
  const viewport = { height: 430, offsetTop: 18, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  globalThis.window = { visualViewport: viewport, innerHeight: 844 };
  globalThis.document = { body: {}, activeElement: focused };
  try {
    effects.length = 0;
    const dialog = dialogElement.type({ ...dialogElement.props, open: true, busy: true, close: () => closed++ });
    dialog.props.ref.current = { showModal() {}, close() {}, contains: target => target === focused, style: { setProperty: (name, value) => properties.set(name, value) } };
    const cleanup = effects[0]();
    assert.equal(properties.get('--supplier-viewport-height'), '430px');
    assert.equal(properties.get('--supplier-viewport-top'), '18px');
    viewport.height = 330; listeners.get('resize')();
    assert.equal(properties.get('--supplier-viewport-height'), '330px');
    assert.equal(scrolled, 2);
    dialog.props.onCancel({ preventDefault() {} });
    dialog.props.onClick({ target: dialog.props.ref.current, currentTarget: dialog.props.ref.current });
    assert.equal(closed, 0);
    assert.equal(find(dialog, node => node.type === 'button').props.disabled, true);
    cleanup(); assert.equal(listeners.size, 0);
    const idle = dialogElement.type({ ...dialogElement.props, open: true, busy: false, close: () => closed++ });
    idle.props.onCancel({ preventDefault() {} });
    assert.equal(closed, 1);
  } finally { Object.assign(globalThis, saved); }
});

test('supplier form reports success only after save, prevents duplicate submissions and keeps failed drafts', async () => {
  const messages = [], states = [];
  let calls = 0, resolve, reject;
  const Client = loadTs('app/(dashboard)/dashboard/suppliers/suppliers-client.tsx', {
    '@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},
    '@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),
    'react/jsx-runtime': jsx, 'next/link': () => null, 'lucide-react': icons, '@/components/pending-submit-button': { ButtonSpinner: () => null },
    react: { useState: initial => [initial, value => states.push(value)], useMemo: fn => fn(), useEffect() {}, useRef: value => ({current:value}) },
    'react-dom': { createPortal: node => node }, sonner: {toast:{success:(...args)=>messages.push(args)}},
    '@/components/mobile-list-card': { default: () => null, MobileList: () => null },
    '@/components/ui/content-skeleton': { default: () => null },
    './compact-supplier-filters': { default: () => null },
    './suppliers-responsive.module.css': { default: new Proxy({}, {get:(_target,key)=>String(key)}) },
    './list-actions': { loadSuppliers: async () => ({}) },
    '@/lib/use-paged-workspace': { usePagedWorkspace: initial => ({ data: initial, busy: false, error: '' }) },
    './actions': {createSupplier:()=>{calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},updateSupplier(){},deleteSupplier(){},toggleSupplierStatus(){}},
  }).default;
  const root = Client({workspace:{suppliers:[],total:0,page:1,metrics:{},stats:{total:0,active:0,thisMonthOrders:0,openPoValue:0}}});
  const panel = find(root, node => node.type?.name === 'AddSupplierPanel');
  const formElement = find(panel.type(panel.props), node => node.type?.name === 'SupplierForm');
  const form = formElement.type(formElement.props);
  let resets = 0;
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class extends NativeFormData { constructor() { super(); } };
  try {
    const event = {preventDefault(){},currentTarget:{reset(){resets++;}}};
    const save = form.props.onSubmit(event);
    await form.props.onSubmit(event);
    assert.equal(calls,1); assert.equal(messages.length,0); assert.equal(resets,0);
    resolve(); await save;
    assert.equal(resets,1); assert.equal(messages[0][1].position,'top-right');
    const failed = form.props.onSubmit(event); reject(new Error('Unable to save')); await failed;
    assert.equal(resets,1); assert.equal(messages.length,1); assert.ok(states.includes('Unable to save'));
  } finally { globalThis.FormData = NativeFormData; }
});
