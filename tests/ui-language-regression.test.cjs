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
const { translateUiText: t, formatUiText } = load('lib/i18n/translations.ts');
test('unknown identifier text never resolves inherited object properties', () => {
  for (const source of ['constructor', 'toString', '__proto__']) {
    assert.equal(t(source, 'km'), source);
    assert.equal(t(source, 'en'), source);
  }
});
test('translated templates preserve replacement tokens and placeholder-looking user data', () => {
  const rawName = '$& $1 {1}';
  assert.equal(formatUiText(t('{0} photo {1}', 'km'), [rawName, 9]), `${rawName} រូបភាព 9`);
  assert.equal(formatUiText(t('{0} photo {1}', 'en'), [rawName, 9]), `${rawName} photo 9`);
});
test('Khmer dynamic labels preserve identifiers, money, brands and English mode', () => {
  for (const source of ['Tenh POS', 'TENH POS', 'USD', 'KHR', 'KHQR', 'SKU', 'F2', 'Google', 'Facebook']) {
    assert.equal(t(source, 'km'), source, source);
  }
  for (const source of ['12 POs', '2 months', 'Delete SUMMER-001 (SKU-042)?', 'Remove Price from order', 'Coupon · SUMMER-001', 'Discount (12%)']) {
    assert.notEqual(t(source, 'km'), source, source);
    assert.equal(t(source, 'en'), source, source);
    for (const token of source.match(/\d+(?:[-.]\d+)*|SUMMER-001|SKU-042|Price/g) ?? []) assert.ok(t(source, 'km').includes(token), token);
  }
  assert.equal(t('left', 'km'), 'នៅសល់');
  assert.equal(t('Left', 'km'), 'ឆ្វេង');
  for (const source of ['Hide confirmation password', 'Show confirmation password', 'Hide new password', 'Show new password']) {
    assert.ok(!/[A-Za-z]/.test(t(source, 'km')), source);
  }
});
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
  const element = { '__reactFiber$test': {}, nodeType: 1, tagName: 'INPUT', closest: () => null, hasAttribute: key => ['placeholder', 'alt', 'label'].includes(key), getAttribute: key => element[key], setAttribute: (key, value) => { element[key] = value; }, placeholder: 'Save changes', alt: 'Store QR code', label: 'Products' };
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
    assert.equal(element.alt, t('Store QR code', 'km'));
    assert.equal(element.label, t('Products', 'km'));
    const userElement = { ...element, closest: () => ({ dataset: { i18nIgnore: 'true' } }), alt: 'Price' };
    const userText = { nodeType: 3, nodeValue: 'Price', parentElement: userElement };
    observe([{ type: 'characterData', target: userText }, { type: 'attributes', target: userElement }]);
    assert.equal(userText.nodeValue, 'Price', 'user-entered text that matches a UI key stays unchanged');
    assert.equal(userElement.alt, 'Price');
    const rawAttributeElement = { ...element, alt: 'Products', placeholder: 'Search products', getAttribute(key) { return key === 'data-i18n-ignore-attributes' ? 'alt' : this[key]; }, setAttribute(key, value) { this[key] = value; } };
    observe([{ type: 'attributes', target: rawAttributeElement }]);
    assert.equal(rawAttributeElement.alt, 'Products', 'raw image alt stays unchanged while other attributes translate');
    assert.equal(rawAttributeElement.placeholder, t('Search products', 'km'));
    const templateElement = { ...element, title: 'Shop logo', hasAttribute: key => key === 'title', getAttribute(key) { return key === 'data-i18n-template-title' ? '{0} logo' : key === 'data-i18n-values-title' ? JSON.stringify(['Shop']) : this[key]; }, setAttribute(key, value) { this[key] = value; } };
    observe([{ type: 'attributes', target: templateElement }]);
    assert.equal(templateElement.title, formatUiText(t('{0} logo', 'km'), ['Shop']), 'template slots keep brand names even when the resulting English label is an exact UI key');
    const streamed = { nodeType: 3, nodeValue: 'Save changes', parentElement: { nodeType: 1, tagName: 'SPAN', closest: () => null } };
    observe([{ type: 'characterData', target: streamed }]);
    assert.equal(streamed.nodeValue, 'Save changes', 'server HTML React has not hydrated yet stays untouched');
    language = 'en'; render(); assert.equal(text.nodeValue, 'Save changes');
    observe([{ type: 'attributes', target: templateElement }]);
    assert.equal(templateElement.title, 'Shop logo', 'server template attributes switch back to English');
    assert.equal(element.alt, 'Store QR code');
    assert.equal(element.label, 'Products');
    text.nodeValue = 'Saved successfully'; element.placeholder = 'Search products';
    observe([{ type: 'characterData', target: text }, { type: 'attributes', target: element }]);
    assert.equal(text.nodeValue, 'Saved successfully'); assert.equal(element.placeholder, 'Search products');
  } finally { Object.assign(global, previous); }
});
