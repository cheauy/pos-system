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

test('supplier form reports success only after save, prevents duplicate submissions and keeps failed drafts', async () => {
  const messages = [], states = [];
  let calls = 0, resolve, reject;
  const Client = loadTs('app/(dashboard)/dashboard/suppliers/suppliers-client.tsx', {
    'react/jsx-runtime': jsx, 'next/link': () => null, 'lucide-react': icons, '@/components/pending-submit-button': { ButtonSpinner: () => null },
    react: { useState: initial => [initial, value => states.push(value)], useMemo: fn => fn(), useEffect() {}, useRef: value => ({current:value}) },
    'react-dom': { createPortal: node => node }, sonner: {toast:{success:(...args)=>messages.push(args)}},
    './actions': {createSupplier:()=>{calls++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},updateSupplier(){},deleteSupplier(){},toggleSupplierStatus(){}},
  }).default;
  const root = Client({suppliers:[],purchaseOrders:[],loadError:null});
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
