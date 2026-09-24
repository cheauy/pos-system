import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTs } from './helpers/load-ts.cjs';
const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');
const icons = require('lucide-react');
const model = loadTs('app/(dashboard)/dashboard/orders/order-workspace-types.ts');
const customers = loadTs('app/(dashboard)/dashboard/pos/pos-customer-helpers.ts');

test('Quick Add requires an address while preserving old pending-request validation', () => {
  const input = { id: '10000000-0000-4000-8000-000000000001', name: 'Buyer', phone: '012345678', address: ' ' };
  assert.match(customers.customerInputIssue(input), /address is required/);
  assert.equal(customers.customerInputIssue({ ...input, address: 'Street 1' }), null);
  assert.equal(customers.customerInputIssue(input, undefined, true), null);
  assert.match(customers.customerInputIssue({ ...input, address: 'a'.repeat(501) }), /500/);
});

test('Orders uses the actual business type for QR filters and preserves other modes', async () => {
  for (const mode of ['fashion', 'shoes', 'general', 'restaurant', 'cafe', 'milk_tea', 'other', 'beauty']) {
    let appliedFilters;
    const Page = loadTs('app/(dashboard)/dashboard/orders/page.tsx', {
      'react/jsx-runtime': jsx, 'next/link': { default: () => null }, 'lucide-react': icons,
      '@/lib/auth/require-permission': { requirePermission: async () => ({ id: 'business', name: 'Shop', productMode: 'standard' }) },
      '@/lib/auth/effective-permissions': { businessHasPermission: async () => true },
      '@/lib/business/get-current-business-mode': { getCurrentBusinessMode: async () => ({ value: mode }) },
      './order-workspace-types': model,
      './order-workspace-data': { loadWorkspace: async (_id, filters) => { appliedFilters = filters; return {}; } },
      './orders-workspace': { default: () => null },
    }).default;
    const page = await Page({ searchParams: Promise.resolve({ source: 'qr', fulfillment: 'dine_in' }) });
    const show = !['fashion', 'shoes', 'general'].includes(mode);
    assert.equal(page.props.showTableQr, show);
    assert.equal(appliedFilters.source, show ? 'qr' : 'all');
    assert.equal(appliedFilters.fulfillment, 'walk_in');
  }
});

test('Orders dropdown renders Walk-in and includes Table QR only when enabled', () => {
  const Workspace = loadTs('app/(dashboard)/dashboard/orders/orders-workspace.tsx', {
    react: React, 'react/jsx-runtime': jsx, 'react-dom': require('react-dom'), 'lucide-react': icons,
    'next/link': { default: props => React.createElement('a', props) },
    'next/navigation': { useRouter: () => ({}) },
    '@/components/order-print-menu': { default: () => null },
    './order-workspace-actions': {}, './order-workspace-types': model, './orders-workspace.module.css': { default: {} },
  }).default;
  const props = { businessId: 'business', businessName: 'Shop', filters: model.parseFilters({}), permissions: {}, data: { rows: [], branches: [], total: 0, page: 1, pages: 1, counts: {}, currency: 'USD', timezone: 'Asia/Phnom_Penh', metrics: { today: 0, yesterday: 0, completed: 0, pending: 0, pendingValue: 0, refunds: 0, refundedAmount: 0 } } };
  const retail = renderToStaticMarkup(React.createElement(Workspace, { ...props, showTableQr: false }));
  assert.match(retail, /value="walk_in">Walk-in/); assert.ok(!retail.includes('Dine-in')); assert.ok(!retail.includes('Table QR'));
  const food = renderToStaticMarkup(React.createElement(Workspace, { ...props, showTableQr: true }));
  assert.match(food, /value="qr">Table QR/);
});
