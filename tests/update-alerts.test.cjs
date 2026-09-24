/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('./helpers/pglite.cjs');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync('lib/update-alerts.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function('exports', compiled)(loaded.exports);
const { validateAlert } = loaded.exports;
const input = { kind: 'update', title: 'A new update', message: 'Try the new reports.', buttonLabel: '', buttonLink: '', expiresAt: null };

test('alert form checks limits, paired buttons, future expiry and safe workspace links', () => {
  assert.equal(validateAlert(input), null);
  for (const change of [{ title: ' ' }, { title: 'a'.repeat(121) }, { message: 'a'.repeat(1501) }, { kind: 'unknown' }, { buttonLabel: 'Go' }, { expiresAt: 'bad' }, { expiresAt: '2000-01-01' }]) assert.ok(validateAlert({ ...input, ...change }));
  for (const link of ['javascript:alert(1)', '//evil.test', '/dashboard\\evil', '/dashboard/%2f%2fevil.test', '/dashboard/a\nb']) assert.ok(validateAlert({ ...input, buttonLabel: 'Go', buttonLink: link }));
  assert.equal(validateAlert({ ...input, buttonLabel: 'Reports', buttonLink: '/dashboard/reports?period=yesterday' }), null);
});

test('admin form and banner render safely with all four types and a non-navigating preview', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'lucide-react': require('lucide-react'), sonner: { toast: {} }, '@/lib/update-alerts': loaded.exports,
    'next/link': { default: props => React.createElement('a', props) }, '@/lib/supabase/client': {}, './actions': {} };
  const load = path => {
    const output = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('exports', 'require', code)(output.exports, name => { if (name in deps) return deps[name]; throw new Error(`Unexpected import ${name}`); });
    return output.exports;
  };
  const cards = load('components/update-alert-banner.tsx');
  deps['@/components/update-alert-banner'] = cards;
  const form = load('app/(super-admin)/super-admin/update-alerts/update-alerts-client.tsx').default;
  const markup = renderToStaticMarkup(React.createElement(form, { initialAlerts: [], initialError: null }));
  for (const label of ['New update', 'Notice', 'Maintenance', 'Important', 'Publish an update alert', 'End automatically', 'Alert history']) assert.ok(markup.includes(label), label);
  for (const kind of Object.keys(loaded.exports.alertKinds)) {
    const alert = { id: 'test', kind, title: '<script>alert(1)</script>', message: 'Safe plain text', button_label: 'Go', button_link: '/dashboard', expires_at: null };
    const banner = renderToStaticMarkup(React.createElement(cards.UpdateAlertCard, { alert, onDismiss: () => {} }));
    assert.ok(banner.includes('Dismiss update alert'));
    assert.ok(banner.includes('href="/dashboard"'));
    assert.ok(!banner.includes('<script>'));
    const preview = renderToStaticMarkup(React.createElement(cards.UpdateAlertCard, { alert, preview: true }));
    assert.ok(!preview.includes('href='));
  }
});

test('database enforces global alert lifecycle, admin permissions, individual dismissals and retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table public.profiles(id uuid primary key, role text, is_active boolean);
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(fs.readFileSync('supabase/migrations/20260924005000_user_update_alerts.sql', 'utf8'));
    const admin = randomUUID(), owner = randomUUID(), staff = randomUUID(), disabled = randomUUID();
    for (const [id, role, active] of [[admin, 'super_admin', true], [owner, 'owner', true], [staff, 'cashier', true], [disabled, 'super_admin', false]]) {
      await db.query('insert into auth.users values ($1)', [id]);
      await db.query('insert into public.profiles values ($1,$2,$3)', [id, role, active]);
    }
    const login = async id => { await db.exec('reset role'); await db.query("select set_config('test.user',$1,false)", [id ?? '']); await db.exec('set role authenticated'); };
    const publish = async (id = randomUUID(), body = input) => (await db.query('select public.tenh_publish_update_alert($1,$2) id', [id, JSON.stringify(body)])).rows[0].id;
    const live = async () => (await db.query('select public.tenh_live_update_alert() alert')).rows[0].alert;
    const history = async offset => (await db.query('select public.tenh_update_alert_history($1) alerts', [offset ?? 0])).rows[0].alerts;
    for (const id of [owner, staff, disabled, null]) {
      await login(id);
      await assert.rejects(publish(), /active Super Admin/);
      await assert.rejects(history(), /active Super Admin/);
      await assert.rejects(db.query('select public.tenh_end_update_alert($1)', [randomUUID()]), /active Super Admin/);
      await assert.rejects(db.exec('select * from public.user_update_alerts'), /permission denied/);
    }
    await login(admin);
    const first = await publish();
    assert.equal((await live()).id, first);
    assert.equal(await publish(first), first);
    await assert.rejects(publish(first, { ...input, title: 'Changed' }), /already used/);
    assert.equal((await history()).length, 1);
    await login(owner);
    assert.equal((await live()).id, first);
    await db.query('select public.tenh_dismiss_update_alert($1)', [first]);
    await db.query('select public.tenh_dismiss_update_alert($1)', [first]);
    assert.equal(await live(), null);
    await login(staff);
    assert.equal((await live()).id, first);
    await login(owner);
    assert.equal(await live(), null, 'dismissal survives a new session');
    await assert.rejects(db.query('insert into public.user_update_alert_dismissals(alert_id,user_id) values($1,$2)', [first, staff]), /permission denied/);
    await login(admin);
    for (const change of [{ title: ' ' }, { message: 'a'.repeat(1501) }, { buttonLabel: 'Go', buttonLink: '//evil.test' }, { buttonLabel: 'Go' }, { expiresAt: '2000-01-01' }]) {
      await assert.rejects(publish(randomUUID(), { ...input, ...change }));
      assert.equal((await live()).id, first, 'invalid replacement must not end current alert');
    }
    const second = await publish();
    assert.equal((await live()).id, second);
    assert.equal((await history()).filter(a => a.is_live).length, 1);
    await publish(first);
    assert.equal((await live()).id, second, 'retry cannot reactivate replaced alert');
    await login(owner);
    assert.equal((await live()).id, second, 'new alert is not hidden by previous dismissal');
    await login(admin);
    await db.query('select public.tenh_end_update_alert($1)', [first]);
    assert.equal((await live()).id, second, 'stale end request cannot end replacement');
    await db.query('select public.tenh_end_update_alert($1)', [second]);
    assert.equal(await live(), null);
    const expired = await publish(randomUUID(), { ...input, expiresAt: new Date(Date.now() + 60000).toISOString() });
    await db.exec('reset role');
    await db.query("update public.user_update_alerts set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1", [expired]);
    await login(admin);
    assert.equal(await live(), null, 'expiry enforced by database without a scheduler');
    assert.equal((await history()).find(a => a.id === expired).is_live, false);
    await publish();
    for (let i = 0; i < 19; i++) await publish();
    assert.equal((await history()).length, 20);
    assert.equal((await history(20)).length, 3);
    await login(null);
    assert.equal(await live(), null);
    await assert.rejects(db.query('select public.tenh_dismiss_update_alert($1)', [first]), /Sign in/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.exec('select public.tenh_live_update_alert()'), /permission denied/);
  } finally { await db.close(); }
});
