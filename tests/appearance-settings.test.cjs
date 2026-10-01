/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function load(path, dependencies = {}) {
  const result = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(result.exports, id => id in dependencies ? dependencies[id] : require(id));
  return result.exports;
}
const model = load('lib/appearance.ts');

// Run the actual component's event handlers, keeping React state across renders.
function hooks() {
  let cursor = 0;
  const state = [], effects = [];
  return {
    react: { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => effects.push(fn) },
    render(component, props = {}) { cursor = 0; effects.length = 0; return component(props); },
    mountEffects() { return effects.map(fn => fn()).filter(Boolean); },
  };
}
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node.type === 'function') return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
function content(node) {
  if (Array.isArray(node)) return node.map(content).join('');
  if (typeof node === 'string') return node;
  if (node?.props?.['aria-hidden']) return '';
  return node && typeof node === 'object' ? content(node.props?.children) : '';
}

test('all appearance choices and Reset are drafts; only Save changes providers; remount discards drafts', () => {
  let saved = { ...model.defaultAppearance, ready: true };
  let language = 'en', saves = 0, languageSaves = 0, successes = 0, errors = 0;
  const setup = () => {
    const runtime = hooks();
    const Form = load('app/(dashboard)/dashboard/settings/system/appearance-form.tsx', {
      react: runtime.react, '@/lib/appearance': model,
      './customer-fields': load('app/(dashboard)/dashboard/settings/system/customer-fields.tsx'),
      '../customers/actions': { updateCustomerFieldSettings: async () => {} },
      '@/components/providers/theme-provider': { useTheme: () => ({ ...saved, saveAppearance(value) { saves++; saved = { ...model.normalizeAppearance(value), ready: true }; } }) },
      '@/components/providers/language-provider': { useLanguage: () => ({ language, setLanguage(value) { languageSaves++; language = value; } }) },
      sonner: { toast: { success: () => successes++, error: () => errors++ } },
    }).default;
    const render = () => runtime.render(Form);
    const findButton = prefix => elements(render()).find(node => node.type === 'button' && content(node).toLowerCase().startsWith(prefix.toLowerCase()));
    const click = prefix => { const node = findButton(prefix); assert.ok(node, prefix); assert.ok(!node.props.disabled); node.props.onClick(); };
    return { render, findButton, click };
  };
  let page = setup();
  page.click('Teal'); page.click('Dark'); page.click('ខ្មែរ');
  const large = elements(page.render()).find(node => node.type === 'button' && content(node) === 'Aalarge'); large.props.onClick();
  page.click('Compact');
  const contrast = elements(page.render()).find(node => node.type === 'input' && node.props.role === 'switch'); contrast.props.onChange({ target: { checked: true } });
  assert.equal(saves, 0); assert.equal(languageSaves, 0); assert.equal(saved.accent, 'white');
  page = setup(); // Navigation away and back mounts a fresh draft.
  assert.equal(page.findButton('White').props['aria-pressed'], true);
  assert.equal(page.findButton('System').props['aria-pressed'], true);
  assert.equal(page.findButton('Save changes').props.disabled, true);
  page.click('Teal'); page.click('Dark'); page.click('ខ្មែរ'); page.click('Save changes');
  assert.equal(saves, 1); assert.equal(languageSaves, 1); assert.equal(successes, 1); assert.equal(errors, 0);
  assert.equal(saved.accent, 'teal'); assert.equal(saved.theme, 'dark'); assert.equal(language, 'km');
  page = setup();
  assert.equal(page.findButton('Teal'), undefined);
  page.click('Reset');
  assert.equal(saved.accent, 'teal'); assert.equal(saved.theme, 'dark'); assert.equal(language, 'km');
  page = setup();
  assert.equal(page.findButton('Teal'), undefined);
  page.click('Reset'); page.click('Save changes');
  assert.deepEqual(model.normalizeAppearance(saved), model.defaultAppearance); assert.equal(language, 'en');
});

test('provider migrates previous preferences, persists one record, restores on reload and never applies a failed save', () => {
  const storage = new Map([['theme', 'dark'], ['tenh-accent', 'teal']]);
  let denyStorage = false, writes = 0;
  const previous = { window: global.window, document: global.document, localStorage: global.localStorage };
  const classes = new Set();
  const root = { dataset: {}, classList: { toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } }, style: { setProperty(key, value) { this[key] = value; } } };
  global.document = { documentElement: root };
  global.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} };
  global.localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (denyStorage) throw new Error('Storage blocked'); storage.set(key, value); writes++; } };
  const mount = () => {
    const runtime = hooks();
    const Provider = load('components/providers/theme-provider.tsx', { react: runtime.react, '@/lib/appearance': model }).default;
    runtime.render(Provider, { children: null });
    const cleanup = runtime.mountEffects();
    return { read: () => runtime.render(Provider, { children: null }).props.value, cleanup: () => cleanup.forEach(fn => fn()) };
  };
  try {
    let provider = mount();
    assert.equal(provider.read().accent, 'teal'); assert.equal(provider.read().theme, 'dark'); assert.equal(writes, 0);
    const next = { ...model.defaultAppearance, accent: 'custom', customColor: '#f2dddd', textSize: 'large', density: 'compact', highContrast: true };
    provider.read().saveAppearance(next);
    assert.equal(writes, 1); assert.equal(root.dataset.textSize, 'large'); assert.equal(root.dataset.density, 'compact'); assert.equal(root.dataset.highContrast, 'true');
    assert.equal(root.style['--sidebar-background'], '#f2dddd');
    assert.deepEqual(JSON.parse(storage.get(model.APPEARANCE_STORAGE_KEY)), next);
    provider.cleanup(); provider = mount();
    assert.equal(provider.read().customColor, '#f2dddd'); assert.equal(provider.read().textSize, 'large');
    denyStorage = true;
    assert.throws(() => provider.read().saveAppearance(model.defaultAppearance), /Storage blocked/);
    assert.equal(provider.read().accent, 'custom'); assert.equal(root.dataset.textSize, 'large');
    provider.cleanup();
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete global[key]; else global[key] = value; } }
});

test('invalid saved inputs fall back safely; light custom colors get readable actions and text', () => {
  assert.deepEqual(model.normalizeAppearance({ theme: 'bad', accent: 'red', customColor: 'url(javascript:bad)', textSize: 100, density: 'bad', highContrast: 'true' }), model.defaultAppearance);
  const luminance = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const color of ['#ffffff', '#000000', '#ff0000', '#00ff00', '#028391', '#f6dcac', '#ffff00']) {
    const palette = model.appearancePalette({ ...model.defaultAppearance, accent: 'custom', customColor: color });
    assert.ok(1.05 / (luminance(palette.action) + 0.05) >= 4.5);
    const pair = [luminance(color), luminance(palette.foreground)].sort((a, b) => b - a);
    assert.ok((pair[0] + 0.05) / (pair[1] + 0.05) >= 4.5);
  }
});


test('customer fields stay drafts until the shared save, cancel restores them and errors preserve drafts', async () => {
  const runtime = hooks();
  let calls = [], fail = false;
  const errors = [];
  const Form = load('app/(dashboard)/dashboard/settings/system/appearance-form.tsx', {
    react: runtime.react, '@/lib/appearance': model,
    './customer-fields': load('app/(dashboard)/dashboard/settings/system/customer-fields.tsx'),
    '../customers/actions': { updateCustomerFieldSettings: async data => { if(fail) throw new Error('Save failed'); calls.push(Object.fromEntries(data)); } },
    '@/components/providers/theme-provider': { useTheme: () => ({ ...model.defaultAppearance, ready:true, saveAppearance() { throw new Error('Unchanged appearance must not save'); } }) },
    '@/components/providers/language-provider': { useLanguage: () => ({ language:'en', setLanguage() {} }) },
    sonner: { toast: { success() {}, error(message) { errors.push(message); } } },
  }).default;
  const render = () => elements(runtime.render(Form, { customerFields:{emailEnabled:true,birthdayEnabled:true,genderEnabled:false},branchId:'branch-a' }));
  const button = name => render().find(n => n.type === 'button' && content(n) === name);
  const gender = () => render().find(n => n.type === 'input' && n.props.name === 'genderEnabled');
  assert.equal(render().filter(n => n.type === 'button' && content(n) === 'Save changes').length,1);
  gender().props.onChange({target:{checked:true}});
  assert.equal(calls.length,0);
  button('Cancel').props.onClick();
  assert.equal(gender().props.checked,false);
  gender().props.onChange({target:{checked:true}});
  fail=true; await button('Save changes').props.onClick();
  assert.equal(gender().props.checked,true); assert.equal(calls.length,0); assert.equal(errors[0],'Save failed');
  fail=false;
  const save=button('Save changes').props.onClick;
  await Promise.all([save(),save()]);
  assert.equal(calls.length,1);
  assert.equal(calls[0].genderEnabled,'on'); assert.equal(calls[0].branchId,'branch-a');
  assert.equal(calls[0].genderSettingPresent,'1');
  assert.equal(button('Save changes').props.disabled,true);
});


test('System & Display sections have distinct keys for the same branch', async () => {
  const Page = load('app/(dashboard)/dashboard/settings/system/page.tsx', {
    'next/link': {default: () => null},
    '@/lib/business/get-current-business': {getCurrentBusiness:async()=>({id:'business-a',role:'owner'})},
    '@/lib/branches/context': {getBranchContext:async()=>({branchId:'same-branch',branches:[]})},
    '@/lib/supabase/branch-server': {createClient:async()=>({from(){return this},select(){return this},eq(){return this},maybeSingle:async()=>({data:{require_open_register:true}})})},
    '../register-setting': {default:()=>null},
    '@/lib/auth/effective-permissions': {businessHasPermission:()=>true},
    '@/lib/customers/get-customer-field-settings': {getCustomerFieldSettings:async()=>({emailEnabled:true,birthdayEnabled:true,genderEnabled:false})},
    './appearance-form': {default:()=>null},
  }).default;
  const page=await Page();
  const keys=page.props.children.filter(Boolean).map(child=>child.key).filter(key=>key!==null);
  assert.equal(keys.length,2); assert.equal(new Set(keys).size,keys.length);
});
