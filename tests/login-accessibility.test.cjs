// Source/callback and compiled-CSS fixtures, not a browser or live auth test.
/* eslint-disable @typescript-eslint/no-require-imports -- These Node fixtures use the repository's CommonJS test loader. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { parseCookieHeader } = require('@supabase/ssr');
const { getImageProps } = require('next/image');
const { loadTs } = require('./helpers/load-ts.cjs');
const persistence = loadTs('lib/auth/session-persistence.ts');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' ? node : node?.props ? text(node.props.children) : '';

function fixture({ cookie = '', signInError = null, profile = { role: 'owner', is_active: true }, profileError = null, oauthError = null, importError = false } = {}) {
  const values = [], effects = [], calls = [], routes = [];
  let cursor = 0, imports = 0, failImport = importError;
  const client = {
    auth: {
      signInWithPassword: async input => { calls.push(['password', input]); return { data: { user: signInError ? null : { id: 'fixture-user' } }, error: signInError }; },
      signOut: async () => { calls.push(['signOut']); },
      signInWithOAuth: async input => { calls.push(['oauth', input]); return { error: oauthError }; },
    },
    from(table) { calls.push(['table', table]); return { select(fields) { calls.push(['select', fields]); return this; }, eq(field, value) { calls.push(['eq', field, value]); return this; }, async maybeSingle() { return { data: profile, error: profileError }; } }; },
  };
  const authModule = {
    get createClient() { imports++; if (failImport) throw new Error('Fixture chunk failed'); return () => { calls.push(['createClient']); return client; }; },
    setRememberMe: remember => calls.push(['remember', remember]),
  };
  const Component = loadTs('app/login/page.tsx', {
    react: { useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; }, useEffect(fn) { if (!effects.length) effects.push(fn); } },
    'react/jsx-runtime': require('react/jsx-runtime'), 'next/image': { default: 'fixture-image' }, 'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => ({ replace: value => routes.push(['replace', value]), refresh: () => routes.push(['refresh']), push: value => routes.push(['push', value]) }), useSearchParams: () => new URLSearchParams() },
    'lucide-react': require('lucide-react'), 'react-icons/fa': require('react-icons/fa'), 'react-icons/fc': require('react-icons/fc'),
    '@supabase/ssr': { parseCookieHeader }, '@/lib/auth/session-persistence': persistence, '@/lib/supabase/client': authModule,
    '@/components/pending-submit-button': { ButtonSpinner: () => null },
    '@/components/providers/language-provider': { useLanguage: () => ({ language: 'en' }) },
  }).default;
  const render = () => { cursor = 0; return Component(); };
  const hydratePreference = () => { const previous = global.document; global.document = { cookie }; try { effects[0](); } finally { global.document = previous; } };
  const input = (id, value) => nodes(render()).find(node => node.props.id === id).props.onChange({ target: { value } });
  return { render, calls, routes, hydratePreference, input, get imports() { return imports; }, retryImport() { failImport = false; } };
}
// Successful sign-in leaves through a full navigation; record it with the router calls.
async function withLocation(f, run) {
  const previous = global.window; global.window = { location: { replace: value => f.routes.push(['location', value]) } };
  try { await run(); } finally { global.window = previous; }
}

test('initial Login rendering and cookie preference restoration never initialize auth', () => {
  const live = `tenh_remember_me=1:${Date.now()}`, expired = `tenh_remember_me=1:${Date.now() - 31 * 86400000}`;
  for (const cookie of ['', 'tenh_remember_me=0', 'other=1; tenh_remember_me=1', 'tenh_remember_me=%31', 'tenh_remember_me=0; tenh_remember_me=1', live, `other=1; ${live}`, expired]) {
    const f = fixture({ cookie }); f.render(); f.hydratePreference();
    const expected = cookie.includes(live);
    assert.equal(persistence.isRemembered(parseCookieHeader(cookie).find(row => row.name === persistence.REMEMBER_ME_COOKIE)?.value), expected);
    assert.equal(nodes(f.render()).find(node => node.props.id === 'remember').props.checked, expected);
    assert.equal(f.imports, 0); assert.deepEqual(f.calls, []);
  }
});

test('password toggle retains input value, explicit accessible action and non-submit behavior', () => {
  const f = fixture(); f.render(); f.input('password', 'fixture secret');
  let tree = f.render(), button = nodes(tree).find(node => node.props['aria-label'] === 'Show password');
  assert.equal(button.props.type, 'button'); assert.equal(button.props['aria-controls'], 'password');
  assert.equal(nodes(tree).find(node => node.props.id === 'password').props.type, 'password');
  button.props.onClick(); tree = f.render();
  button = nodes(tree).find(node => node.props['aria-label'] === 'Hide password');
  assert.ok(button); assert.equal(nodes(tree).find(node => node.props.id === 'password').props.type, 'text');
  assert.equal(nodes(tree).find(node => node.props.id === 'password').props.value, 'fixture secret');
  assert.equal(button.props.children.props['aria-hidden'], 'true');
  button.props.onClick(); assert.equal(nodes(f.render()).find(node => node.props.id === 'password').props.type, 'password');
  assert.equal(f.imports, 0); assert.deepEqual(f.calls, []);
});

test('email sign-in lazily initializes the existing client and preserves preference, profile gate and continuation', async () => {
  for (const remember of [false, true]) {
    const f = fixture({ cookie: `tenh_remember_me=${remember ? `1:${Date.now()}` : 0}` }); f.render(); f.hydratePreference();
    f.input('email', ' fixture@example.com '); f.input('password', 'fixture secret');
    await withLocation(f, async () => {
      const pending = nodes(f.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
      assert.ok(nodes(f.render()).filter(node => node.props.type === 'submit').every(node => node.props.disabled));
      await pending;
    });
    assert.deepEqual(f.calls.slice(0, 3), [['remember', remember], ['createClient'], ['password', { email: 'fixture@example.com', password: 'fixture secret' }]]);
    assert.deepEqual(f.calls.slice(3), [['table', 'profiles'], ['select', 'role, is_active'], ['eq', 'id', 'fixture-user']]);
    // One full navigation, no extra router refresh, and the button stays busy until the page is replaced.
    assert.deepEqual(f.routes, [['location', '/auth/continue']]);
    assert.ok(nodes(f.render()).filter(node => node.props.type === 'submit').every(node => node.props.disabled));
    assert.equal(f.imports, 1);
  }
});

test('network failures say the connection failed instead of blaming credentials', async () => {
  const offline = Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
  const f = fixture({ signInError: offline }); f.render();
  await nodes(f.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.routes, []);
  assert.ok(text(f.render()).includes('Unable to reach Tenh POS. Check your connection and try again.'));
  assert.ok(nodes(f.render()).filter(node => node.props.type === 'submit').every(node => !node.props.disabled));
});

test('invalid credentials and inactive, missing or unreadable profiles never navigate into the app', async () => {
  for (const options of [{ signInError: new Error('fixture') }, { profile: { is_active: false } }, { profile: null }, { profileError: new Error('fixture') }]) {
    const f = fixture(options); f.render();
    await nodes(f.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(f.routes, []);
    assert.ok(text(f.render()).includes('Unable to sign in. Check your credentials or account status.'));
    assert.equal(f.calls.some(row => row[0] === 'signOut'), !options.signInError);
    assert.ok(nodes(f.render()).filter(node => node.props.type === 'submit').every(node => !node.props.disabled));
  }
});

test('auth chunk failure restores the form and a retry keeps entered credentials', async () => {
  const f = fixture({ importError: true }); f.render(); f.input('email', 'fixture@example.com'); f.input('password', 'fixture secret');
  await nodes(f.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.ok(text(f.render()).includes('Something went wrong. Please try again.')); assert.deepEqual(f.calls, []); assert.deepEqual(f.routes, []);
  assert.equal(nodes(f.render()).find(node => node.props.id === 'password').props.value, 'fixture secret');
  f.retryImport(); await withLocation(f, () => nodes(f.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }));
  assert.equal(f.calls.find(row => row[0] === 'password')[1].password, 'fixture secret'); assert.equal(f.routes[0][1], '/auth/continue');
});

test('Google and Facebook retain callback, preference and failure behavior when loaded on demand', async () => {
  const previous = global.window; global.window = { location: { origin: 'https://app.tenh-pos.com' } };
  try {
    for (const provider of ['google', 'facebook']) for (const failed of [false, true]) {
      const f = fixture({ cookie: `tenh_remember_me=1:${Date.now()}`, oauthError: failed ? new Error('fixture') : null }); f.render(); f.hydratePreference();
      const button = nodes(f.render()).find(node => node.type === 'button' && text(node).includes(`Continue with ${provider === 'google' ? 'Google' : 'Facebook'}`));
      await button.props.onClick();
      assert.deepEqual(f.calls, [['remember', true], ['createClient'], ['oauth', { provider, options: { redirectTo: 'https://app.tenh-pos.com/auth/callback' } }]]);
      assert.deepEqual(f.routes, []);
      if (failed) { assert.ok(text(f.render()).includes(`Unable to sign in with ${provider === 'google' ? 'Google' : 'Facebook'}. Please try again.`)); assert.ok(!nodes(f.render()).find(node => node.props.type === 'submit').props.disabled); }
    }
    const broken = fixture({ importError: true }); broken.render();
    await nodes(broken.render()).find(node => node.type === 'button' && text(node).includes('Continue with Google')).props.onClick();
    assert.ok(text(broken.render()).includes('Social sign-in could not be started. Please try again.')); assert.deepEqual(broken.calls, []);
  } finally { global.window = previous; }
});

test('both existing images expose an eager high-priority request in real Next image props and HTML', () => {
  const images = nodes(fixture().render()).filter(node => node.type === 'fixture-image'); assert.equal(images.length, 2);
  for (const image of images) {
    const { props } = getImageProps(image.props);
    const html = renderToStaticMarkup(React.createElement('img', props));
    assert.match(html, /fetchPriority="high"/i); assert.match(html, /loading="eager"/); assert.ok(props.src);
    assert.equal(props.alt, image.props.alt); assert.equal(props.width, image.props.width); assert.equal(props.height, image.props.height);
  }
});

let compiledCss;
async function css() {
  return compiledCss ??= require('postcss')([require('@tailwindcss/postcss')({ base: path.resolve(__dirname, '..'), optimize: false })]).process('@import "tailwindcss" source(none);\n@source "../app/login/page.tsx";', { from: path.join(__dirname, 'login-fixture.css') }).then(result => result.root);
}
function variable(root, name) { let value; root.walkDecls(name, decl => { value = decl.value; }); assert.ok(value, name); return value; }
function utility(root, name, property) { let value; root.walkRules(rule => { if (rule.selector === name) rule.walkDecls(property, decl => { value = decl.value; }); }); assert.ok(value, `${name} ${property}`); return value; }
function rgb(root, color) {
  const value = variable(root, color), match = value.match(/oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/); assert.ok(match, value);
  const L = Number(match[1]) / 100, C = Number(match[2]), h = Number(match[3]) * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(channel => Math.max(0, Math.min(1, channel)));
}
const contrastOnWhite = linear => 1.05 / (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05);

test('compiled palette gives the affected text, placeholders and keyboard focus sufficient contrast on the fixed Login surface', async () => {
  const root = await css(), tree = fixture().render();
  assert.ok(nodes(tree).some(node => node.props.className?.includes('bg-white')));
  assert.ok(!nodes(tree).some(node => node.props.className?.includes('workspace-theme')));
  for (const phrase of ['Manage your store, orders, and inventory in one place.', 'or sign in with email']) {
    const node = nodes(tree).find(node => ['p', 'span'].includes(node.type) && text(node).trim() === phrase);
    const color = node.props.className.match(/(?:^| )text-(slate-\d+)(?: |$)/)[1];
    assert.ok(contrastOnWhite(rgb(root, `--color-${color}`)) >= 4.5);
  }
  for (const id of ['email', 'password']) { const input = nodes(tree).find(node => node.props.id === id); const color = input.props.className.match(/placeholder:text-(slate-\d+)/)[1]; assert.ok(contrastOnWhite(rgb(root, `--color-${color}`)) >= 4.5); }
  assert.ok(contrastOnWhite(rgb(root, '--color-blue-600')) >= 3);
  // Actual Login has fixed white surfaces; dark workspace overrides require a workspace-theme ancestor.
  const globals = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');
  assert.match(globals, /\.dark \.workspace-theme :is\([^\n]*text-slate-600/);
});

test('compiled toggle dimensions stay 48 pixels at every configured root text size and leave password text clear', async () => {
  const root = await css(), tree = fixture().render(), button = nodes(tree).find(node => node.props['aria-label'] === 'Show password'), input = nodes(tree).find(node => node.props.id === 'password');
  assert.ok(button.props.className.includes('h-[48px]')); assert.ok(button.props.className.includes('w-[48px]'));
  assert.equal(utility(root, '.h-\\[48px\\]', 'height'), '48px'); assert.equal(utility(root, '.w-\\[48px\\]', 'width'), '48px');
  assert.ok(button.props.className.includes('focus-visible:outline-blue-600'));
  assert.ok(button.props.className.includes('focus-visible:outline-2'));
  assert.ok(input.props.className.includes('pr-16'));
  for (const rootPixels of [14, 16, 18]) { const right = rootPixels * 0.25, inputHeight = rootPixels * 3.5, rightPadding = rootPixels * 4; assert.ok(inputHeight >= 48); assert.ok(rightPadding >= right + 48); }
});
