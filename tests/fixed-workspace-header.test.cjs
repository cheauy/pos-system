const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const file = ts.createSourceFile('header.tsx', fs.readFileSync('components/ui/fixed-workspace-header.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = file.statements.find(node => ts.isFunctionDeclaration(node));
const effect = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression).find(node => ts.isCallExpression(node) && node.expression.getText(file) === 'useLayoutEffect');
const source = ts.transpileModule(`return (${effect.arguments[0].getText(file)})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function mount(previous = '') {
  let height = 69, resize, change, disconnected = false;
  const properties = new Map(previous ? [['--workspace-header-h', previous]] : []);
  const style = {
    getPropertyValue: key => properties.get(key) || '', getPropertyPriority: () => previous ? 'important' : '',
    setProperty: (key, value, priority) => { properties.set(key, value); style.priority = priority; }, removeProperty: key => properties.delete(key),
  };
  const header = { getBoundingClientRect: () => ({ height }) };
  const mobile = { matches: true, addEventListener: (_, fn) => { change = fn; }, removeEventListener: (_, fn) => assert.equal(fn, change) };
  class Observer {
    constructor(callback) { resize = callback; }
    observe(element) { assert.equal(element, header); }
    disconnect() { disconnected = true; }
  }
  const cleanup = new Function('slot', 'document', 'window', 'ResizeObserver', source)(
    { current: { firstElementChild: header } }, { documentElement: { style } },
    { matchMedia: query => { assert.equal(query, '(max-width: 1024px), (hover: none) and (pointer: coarse)'); return mobile; } }, Observer,
  );
  return { style, mobile, value: () => style.getPropertyValue('--workspace-header-h'), resize: value => { height = value; resize(); }, change: () => change(), cleanup, disconnected: () => disconnected };
}

test('the fixed header offset follows wrapping and safe-area height, then restores desktop and unmount styles', () => {
  const view = mount();
  assert.equal(view.value(), '69px');
  view.resize(118.5); assert.equal(view.value(), '118.5px');
  view.mobile.matches = false; view.change(); assert.equal(view.value(), '');
  view.mobile.matches = true; view.change(); assert.equal(view.value(), '118.5px');
  view.cleanup(); assert.equal(view.value(), ''); assert.ok(view.disconnected());
});

test('a hidden desktop header reserves zero space and prior inline values survive cleanup', () => {
  const view = mount('80px');
  view.resize(0); assert.equal(view.value(), '0px');
  view.cleanup(); assert.equal(view.value(), '80px'); assert.equal(view.style.priority, 'important');
});

test('an absent header does not attach observers or change document styles', () => {
  assert.equal(new Function('slot', source)({ current: null }), undefined);
});
