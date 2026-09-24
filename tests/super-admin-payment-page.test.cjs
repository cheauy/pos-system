/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(path, dependencies) {
  const result = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(result.exports, id => dependencies[id] ?? require(id));
  return result.exports.default;
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node && typeof node === 'object' ? [node, ...elements(node.props?.children)] : [];
}
test('one payment page selects the correct review flow and requires super admin access', async () => {
  let allowed = true, checks = 0;
  const auth = { requireSuperAdmin: async () => { checks++; if (!allowed) throw new Error('Forbidden'); } };
  const BusinessChanges = () => null, Subscriptions = () => null;
  const Page = load('app/(super-admin)/super-admin/manual-payments/page.tsx', {
    '@/lib/auth/require-super-admin': auth,
    './business-change-list': { default: BusinessChanges },
    '../subscription-payments/payment-list': { default: Subscriptions },
  });
  for (const type of [undefined, 'business-changes', 'subscriptions', 'invalid']) {
    const tree = elements(await Page({ searchParams: Promise.resolve({ type }) }));
    const business = type === 'business-changes';
    assert.equal(tree.filter(node => node.type === BusinessChanges).length, business ? 1 : 0);
    assert.equal(tree.filter(node => node.type === Subscriptions).length, business ? 0 : 1);
    assert.equal(tree.filter(node => node.props?.['aria-current'] === 'page').length, 1);
  }
  allowed = false;
  await assert.rejects(Page({ searchParams: Promise.resolve({}) }), /Forbidden/);
  assert.equal(checks, 5);
});
test('old subscription payment link requires authorization and redirects to the merged page', async () => {
  let checked = false;
  const Page = load('app/(super-admin)/super-admin/subscription-payments/page.tsx', {
    '@/lib/auth/require-super-admin': { requireSuperAdmin: async () => { checked = true; } },
    'next/navigation': { redirect: path => { assert.ok(checked); assert.equal(path, '/super-admin/manual-payments'); } },
  });
  await Page();
});
