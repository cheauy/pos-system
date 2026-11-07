/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./helpers/load-ts.cjs');
const domains = ['loeuklabs.site', 'mekhalatech.site', 'tumnob.site', 'helenbl.site', 'honey-wellaerospace.site'];
const fixture = () => ({checkedAt: Date.now(), backendReady: true, domains: domains.map(domain => ({domain, status: 'ready', lastReceivedAt: null, ...Object.fromEntries(['mx', 'spf', 'dmarc'].map(key => [key, {state: 'pass', records: ['record']}]))}))});
const load = (allowed = true) => loadTs('app/(super-admin)/super-admin/temp/actions.ts', {'@/lib/auth/require-super-admin': {requireSuperAdmin: async () => {if (!allowed) throw Error('Forbidden');}}});

test('Temp health authenticates before any service request', async () => {
  const original = global.fetch;
  let called = false;
  global.fetch = async () => {called = true;};
  try {await assert.rejects(load(false).runTempMailHealth(), /Forbidden/); assert.equal(called, false);}
  finally {global.fetch = original;}
});

test('Temp health validates fresh DNS reports, strips extra fields and bounds requests', async () => {
  const original = global.fetch;
  let report = fixture();
  report.privateData = 'do not forward';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://temp-mail.tenh-pos.com/api/domains/status');
    assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return Response.json(report);
  };
  try {
    const api = load();
    assert.equal((await api.runTempMailHealth()).domains.length, 5);
    assert.equal(JSON.stringify(await api.runTempMailHealth()).includes('privateData'), false);
    report.checkedAt -= 180_000; await assert.rejects(api.runTempMailHealth(), /Invalid/);
    report = fixture(); report.domains[1].domain = domains[0]; await assert.rejects(api.runTempMailHealth(), /Invalid/);
    report = fixture(); report.domains[0].mx.records = [42]; await assert.rejects(api.runTempMailHealth(), /Invalid/);
    report = fixture(); report.domains[0].dmarc.state = 'pretend-pass'; await assert.rejects(api.runTempMailHealth(), /Invalid/);
    report = fixture(); report.domains[0].status = 'attention'; report.domains[0].dmarc.state = 'warning';
    assert.equal((await api.runTempMailHealth()).domains[0].status, 'attention');
    global.fetch = async () => new Response('offline', {status: 503}); await assert.rejects(api.runTempMailHealth(), /unavailable/);
  } finally {global.fetch = original;}
});
