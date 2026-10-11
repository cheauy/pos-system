const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

test('compact details lock scrolling, dismiss only outside, and restore focus without scrolling', () => {
  const previousWindow = global.window, previousDocument = global.document;
  const effects = [], events = new Map(), writes = [], closes = [];
  const opener = { isConnected: true, focus: options => writes.push(['focus', options]) };
  const dialog = { showModal: () => writes.push('open'), close: () => writes.push('close'), style: { setProperty: (...args) => writes.push(args) } };
  const viewport = { height: 440, offsetTop: 22, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  global.window = { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }), visualViewport: viewport };
  global.document = { activeElement: opener, body: { style: { overflow: 'auto' } } };
  try {
    const { default: Drawer } = loadTs('components/product-stock-drawer.tsx', {
      react: { useState: initial => [initial(), () => {}], useRef: () => ({ current: dialog }), useEffect: fn => effects.push(fn) },
      'react/jsx-runtime': require('react/jsx-runtime'), './products-stock-responsive.module.css': { default: {} },
    });
    const tree = Drawer({ children: 'details', label: 'Product details', close: () => closes.push('dismiss'), desktopClassName: 'desktop' });
    const cleanup = effects.map(fn => fn());
    assert.equal(tree.type, 'dialog');
    assert.equal(global.document.body.style.overflow, 'hidden');
    assert.ok(writes.includes('open'));
    viewport.height = 300; events.get('resize')();
    assert.deepEqual(writes.at(-2), ['--catalog-viewport-height', '300px']);
    const currentTarget = { getBoundingClientRect: () => ({ left: 12, right: 390, top: 22, bottom: 322 }) };
    tree.props.onClick({ target: currentTarget, currentTarget, clientX: 50, clientY: 100 });
    assert.equal(closes.length, 0, 'clicking drawer padding must keep it open');
    tree.props.onClick({ target: currentTarget, currentTarget, clientX: 5, clientY: 100 });
    assert.equal(closes.length, 1, 'backdrop closes details');
    let cancelled = false;
    tree.props.onCancel({ preventDefault: () => { cancelled = true; } });
    assert.ok(cancelled); assert.equal(closes.length, 2, 'Escape uses the same dismissal');
    cleanup.reverse().forEach(fn => fn?.());
    assert.equal(global.document.body.style.overflow, 'auto');
    assert.deepEqual(writes.at(-1), ['focus', { preventScroll: true }]);
    assert.equal(events.size, 0);
  } finally { global.window = previousWindow; global.document = previousDocument; }
});

test('desktop details keep the existing overlay and do not lock the body', () => {
  const previousWindow = global.window;
  global.window = { matchMedia: () => ({ matches: false }) };
  try {
    const { default: Drawer } = loadTs('components/product-stock-drawer.tsx', {
      react: { useState: initial => [initial(), () => {}], useRef: () => ({ current: null }), useEffect() {} },
      'react/jsx-runtime': require('react/jsx-runtime'), './products-stock-responsive.module.css': { default: {} },
    });
    const tree = Drawer({ children: 'details', label: 'Product details', close() {}, desktopClassName: 'desktop' });
    assert.equal(tree.type, 'div'); assert.equal(tree.props.className, 'desktop');
  } finally { global.window = previousWindow; }
});
