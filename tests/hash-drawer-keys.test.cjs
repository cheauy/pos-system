const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

function setup(t, hash = '#campaign-details-test') {
  const events = {};
  let active = null;
  const close = { tabIndex: 0, hasAttribute: () => false, getClientRects: () => [1], focus() { active = close; } };
  const save = { ...close, focus() { active = save; } };
  const backdrop = { ...close, tabIndex: -1 };
  const drawer = { getClientRects: () => [1], querySelector: () => close, querySelectorAll: selector => selector === 'form' ? [] : [backdrop, close, save] };
  const globals = {
    location: { hash },
    document: { get activeElement() { return active; }, querySelector: () => drawer, getElementById: () => null, addEventListener: (name, callback) => events[name] = callback, removeEventListener() {} },
    window: { addEventListener: (name, callback) => events[name] = callback, removeEventListener() {} },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  let effect;
  const Component = loadTs('components/ui/hash-drawer-keys.tsx', { react: { useEffect: callback => effect = callback } }).default;
  Component();
  return { effect: () => effect(), events, close, save, active: () => active, location: globals.location };
}

test('a malformed fragment cannot crash drawer initialization', t => {
  const ui = setup(t, '#%');
  assert.doesNotThrow(ui.effect);
});

test('drawer focus wraps in both directions and Escape closes it', t => {
  const ui = setup(t);
  ui.effect();
  assert.equal(ui.active(), ui.close);
  let prevented = 0;
  ui.events.keydown({ key: 'Tab', shiftKey: true, preventDefault: () => prevented++ });
  assert.equal(ui.active(), ui.save);
  ui.events.keydown({ key: 'Tab', shiftKey: false, preventDefault: () => prevented++ });
  assert.equal(ui.active(), ui.close);
  assert.equal(prevented, 2);
  ui.events.keydown({ key: 'Escape' });
  assert.equal(ui.location.hash, 'close');
});
