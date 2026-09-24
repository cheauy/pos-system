/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path) {
  const mod = { exports: {} };
  new Function('exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports);
  return mod.exports;
}
const { translateUiText: t } = load('lib/i18n/translations.ts');
test('menu labels, CRUD labels and required-field markers translate consistently', () => {
  for (const label of ['Bundle Items', 'Staff Report', 'Printer Settings', 'Order Items', 'Add New Category', 'Edit Product', 'Delete user', 'View details', 'Save changes', 'Text size', 'Interface density']) {
    assert.notEqual(t(label, 'km'), label, label);
    assert.equal(t(label.toUpperCase(), 'km'), t(label, 'km'));
    assert.equal(t(label, 'en'), label);
  }
  assert.equal(t('  Save changes * ', 'km'), '  រក្សាទុកការផ្លាស់ប្តូរ * ');
  assert.equal(t('Order something unknown', 'km'), 'Order something unknown');
});
test('dark palette ignores accents and light palette restores selected color', () => {
  const { appearancePalette, defaultAppearance, accentColors } = load('lib/appearance.ts');
  for (const accent of Object.keys(accentColors)) {
    const value = { ...defaultAppearance, accent };
    assert.equal(appearancePalette(value, 'dark').background, '#0f172a');
    assert.equal(appearancePalette(value, 'light').background, accentColors[accent]);
  }
});

test('switching back to English preserves later React text and placeholder updates', () => {
  const React = require('react');
  let language = 'km', cursor = 0, observe;
  const refs = [], effects = [];
  const element = { nodeType: 1, tagName: 'INPUT', closest: () => null, hasAttribute: key => key === 'placeholder', getAttribute: () => element.placeholder, setAttribute: (_key, value) => { element.placeholder = value; }, placeholder: 'Save changes' };
  const text = { nodeType: 3, nodeValue: 'Save changes', parentElement: element };
  const previous = { document: global.document, Node: global.Node, NodeFilter: global.NodeFilter, MutationObserver: global.MutationObserver };
  global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  global.NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1 };
  global.document = { body: element, createTreeWalker: () => { let visited = false; return { nextNode() { if (visited) return null; visited = true; return text; } }; } };
  global.MutationObserver = class { constructor(fn) { observe = fn; } observe() {} disconnect() {} };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('components/providers/language-provider.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, id => id === 'react' ? { ...React, useState: () => [language, () => {}], useRef: initial => { const index = cursor++; return refs[index] ??= { current: initial }; }, useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => effects.push(fn) } : id === '@/lib/i18n/translations' ? load('lib/i18n/translations.ts') : require(id));
  function render() { cursor = 0; effects.length = 0; exports.default({ initialLanguage: language, children: null }); effects[1](); }
  try {
    render(); assert.equal(text.nodeValue, t('Save changes', 'km'));
    language = 'en'; render(); assert.equal(text.nodeValue, 'Save changes');
    text.nodeValue = 'Saved successfully'; element.placeholder = 'Search products';
    observe([{ type: 'characterData', target: text }, { type: 'attributes', target: element }]);
    assert.equal(text.nodeValue, 'Saved successfully'); assert.equal(element.placeholder, 'Search products');
  } finally { Object.assign(global, previous); }
});
