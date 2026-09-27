const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const file = ts.createSourceFile('client.ts', fs.readFileSync('mobile/src/client.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const nodes = file.statements.filter(node => node.name && ['api', 'ApiError'].includes(node.name.text));
const source = ts.transpileModule(nodes.map(node => node.getText(file).replace(/^export /, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function client({ status = 200, type = 'application/json', response = { success: true }, fail = false } = {}) {
  const calls = [];
  class Xhr {
    upload = {};
    headers = {};
    status = status;
    responseText = JSON.stringify(response);
    open(method, url) { this.responseURL = url; calls.push({ method, url, headers: this.headers }); }
    setRequestHeader(key, value) { this.headers[key] = value; }
    getResponseHeader() { return type; }
    send(body) { calls.at(-1).body = body; queueMicrotask(() => { this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 }); fail ? this.onerror() : this.onload(); }); }
    abort() { this.onabort(); }
  }
  const api = new Function('auth', 'apiUrl', 'XMLHttpRequest', 'fetch', `${source};return api;`)({ auth: { getSession: async () => ({ data: { session: { access_token: 'test-only' } } }) } }, 'https://example.test', Xhr, async () => { throw new Error('Upload must use measured transport'); });
  return { api, calls };
}
test('multipart uploads retain authenticated branch scope and report measured progress', async () => {
  const { api, calls } = client(), form = new FormData(), progress = [];
  form.append('input', 'test');
  assert.deepEqual(await api('product-create', { businessId: 'business', branchId: 'branch' }, form, undefined, value => progress.push(value)), { success: true });
  assert.equal(calls[0].body, form);
  assert.deepEqual(calls[0].headers, { Authorization: 'Bearer test-only', 'X-Business-Id': 'business', 'X-Branch-Id': 'branch' });
  assert.deepEqual(progress, [0.5]);
});
test('upload failures do not report successful saves or lose server error details', async () => {
  const denied = client({ status: 403, response: { error: 'Not allowed', code: 'denied', uncertain: false } });
  await assert.rejects(denied.api('product-create', {}, new FormData(), undefined, () => {}), error => error.status === 403 && error.code === 'denied' && error.uncertain === false);
  const lost = client({ fail: true });
  await assert.rejects(lost.api('support', {}, new FormData(), undefined, () => {}), /could not be confirmed/);
  const invalid = client({ type: 'text/html' });
  await assert.rejects(invalid.api('support', {}, new FormData(), undefined, () => {}), /API is unavailable/);
});
test('an already cancelled upload never sends the form', async () => {
  const { api, calls } = client(), signal = new AbortController(); signal.abort();
  await assert.rejects(api('support', {}, new FormData(), signal.signal, () => {}), /timed out/);
  assert.equal(calls[0]?.body, undefined);
});
