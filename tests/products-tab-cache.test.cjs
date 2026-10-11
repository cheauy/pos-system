const test = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./helpers/load-ts.cjs');
const {receiveProductView, reusableProductView, productViewLifetime} = loadTs('app/(dashboard)/dashboard/products/visited-product-views.tsx', {
  '@/components/products-stock-responsive.module.css': { default: {} },
  react: {}, 'react/jsx-runtime': {}, 'next/navigation': {}, '@/components/ui/activity-link': {}, '@/components/ui/content-skeleton': {}, 'lucide-react': {},
});
test('only visited views are cached, each with a strict bounded lifetime', () => {
  const first = receiveProductView(null, 'products', 'catalog', 100);
  assert.equal(reusableProductView(first, 'stock', 100), undefined);
  assert.equal(reusableProductView(first, 'products', 100 + productViewLifetime - 1).content, 'catalog');
  assert.equal(reusableProductView(first, 'products', 100 + productViewLifetime), undefined);
  const next = receiveProductView({...first, requested:'stock'}, 'stock', 'stock', 200);
  assert.deepEqual(Object.keys(next.entries).sort(), ['products','stock']);
  assert.equal(reusableProductView(next, 'products', 201).content, 'catalog');
});
test('refreshes and mutation responses invalidate the inactive view instead of preserving stale stock', () => {
  let state = receiveProductView(null, 'products', 'old catalog', 0);
  state = receiveProductView({...state, requested:'stock'}, 'stock', 'old stock', 100);
  const refreshed = receiveProductView(state, 'stock', 'fresh stock', 200);
  assert.equal(reusableProductView(refreshed, 'products', 201), undefined);
  assert.equal(refreshed.entries.products.content, 'old catalog', 'inactive draft stays mounted but cannot be shown as valid data');
  assert.equal(refreshed.entries.stock.content, 'fresh stock');
  const changed = receiveProductView(state, 'products', 'catalog after sale', 300);
  assert.equal(reusableProductView(changed, 'stock', 301), undefined);
  assert.equal(changed.requested, null);
});
test('an unexpected response cannot retain a sibling snapshot under a new navigation', () => {
  const state = receiveProductView(null, 'products', 'catalog', 0);
  const interrupted = receiveProductView({...state, requested:'stock'}, 'products', 'new catalog', 100);
  assert.equal(interrupted.entries.stock, undefined);
  assert.equal(receiveProductView(null, 'stock', 'different tenant', 200).entries.products, undefined);
});
test('an expired native-history revisit forces one refresh even when Next retains the same server payload', () => {
  const savedWindow = global.window;
  const window = new EventTarget();
  global.window = window;
  let state = receiveProductView(null, 'products', 'catalog', 0);
  state = receiveProductView({...state, requested:'stock'}, 'stock', 'old stock', 100);
  state = {...state, shown:'products', requested:'stock', checkedAt:productViewLifetime+101};
  const ref = {current:null};
  let refreshes = 0;
  const Client = loadTs('app/(dashboard)/dashboard/products/visited-product-views.tsx', {
    '@/components/products-stock-responsive.module.css': { default: {} },
    react: {useState: () => [state, value => {state=typeof value==='function'?value(state):value;}], useRef:()=>ref, useEffect: fn=>fn()},
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/navigation': {useRouter:()=>({refresh:()=>refreshes++}),useSearchParams:()=>new URLSearchParams('view=stock')},
    '@/components/ui/activity-link': {}, '@/components/ui/content-skeleton': {}, 'lucide-react': {},
  }).default;
  const props={view:'stock',children:'old stock',canViewProducts:true,canViewStock:true,canAdjustStock:false};
  try {
    Client(props); Client(props);
    assert.equal(refreshes,1);
    assert.equal(state.invalid.stock,true);
    assert.equal(state.entries.products.content,'catalog','draft node is retained while its data is hidden');
    Client({...props,children:'fresh stock'});
    assert.equal(state.invalid.stock,undefined);
    assert.equal(state.entries.stock.content,'fresh stock');
    assert.equal(refreshes,1);
  } finally {if(savedWindow===undefined)delete global.window;else global.window=savedWindow;}
});
