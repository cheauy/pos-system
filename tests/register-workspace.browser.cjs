// Isolated real-component browser checks. No Next server, credentials, SQL, or financial requests.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node fixture harness uses CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.env.TENH_BROWSER_MODULES || path.join(path.dirname(__dirname), 'node_modules')],
}));
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/register-workspace.tsx');
const output = path.join(root, 'docs/evidence/register-redesign-20261010');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-register-fixture-'));
const checks = [];
function check(name) { checks.push(name); console.log('PASS ' + name); }
const loader = path.join(temp, 'loader.cjs');
fs.writeFileSync(loader, `
const ts = require(${JSON.stringify(require.resolve('typescript'))});
module.exports = function(source) {
  if (this.resourcePath.endsWith('.css')) {
    const names = [...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m => m[1]);
    return 'module.exports = ' + JSON.stringify(Object.fromEntries(names.map(n => [n, 'register-' + n])));
  }
  return ts.transpileModule(source, {fileName:this.resourcePath,compilerOptions:{
    target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX
  }}).outputText;
};
`);
async function build() {
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development', devtool: false, context: root, entry: fixture,
      output: { path: temp, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/navigation$': fixture } },
      module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] },
      plugins: [new webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
        if (resource.context.endsWith(path.join('dashboard', 'register'))) resource.request = fixture;
      })],
      performance: { hints: false },
    });
    compiler.run((error, stats) => {
      compiler.close(() => {});
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    });
  });
  const global = await postcss([tailwind()]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
  const local = fs.readFileSync(path.join(root, 'app/(dashboard)/dashboard/register/register-workspace.module.css'), 'utf8').replace(/\.([a-zA-Z][\w-]*)/g, '.register-$1');
  fs.writeFileSync(path.join(temp, 'style.css'), global.css + '\n' + local);
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  await build();
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/fixture.js') || req.url.startsWith('/style.css')) {
      const css = req.url.startsWith('/style.css');
      res.setHeader('Content-Type', css ? 'text/css' : 'application/javascript');
      res.end(fs.readFileSync(path.join(temp, css ? 'style.css' : 'fixture.js')));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
    page.on('console', message => { if (message.type() === 'error') console.error('Console:', message.text()); });
    page.on('request', req => assert.equal(new URL(req.url()).origin, url, 'fixture must not make external requests'));
    const get = name => page.getByRole('button', { name, exact: true });
    async function load(state = 'open', lang = 'en') {
      await page.goto(url + '/?state=' + state + '&lang=' + lang);
      await page.locator('main').waitFor();
    }
    async function calls() { return page.evaluate(() => window.registerFixture.calls); }
    async function screenshot(name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
    async function noOverflow(label) {
      const measurements = await page.evaluate(() => {
        const width = innerWidth;
        const visible = [...document.querySelectorAll('main button, main input, main select, main textarea, main summary')].filter(el => el.getClientRects().length);
        return {
          viewport: width, document: document.documentElement.scrollWidth,
          clipped: visible.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > width + 1; }).map(el => el.outerHTML.slice(0, 120)),
          smallTargets: visible.filter(el => el.getBoundingClientRect().height < 43).map(el => el.outerHTML.slice(0, 120)),
        };
      });
      assert.ok(measurements.document <= measurements.viewport, label + ' horizontal overflow');
      assert.deepEqual(measurements.clipped, [], label + ' clipped controls');
      // Report dialog's existing close button is also measured.
      assert.deepEqual(measurements.smallTargets, [], label + ' touch targets');
      return measurements;
    }

    await load('closed');
    assert.equal(await page.locator('form[data-draft=opening]').isVisible(), true);
    assert.equal(await page.locator('form[data-draft=movement]').count(), 0);
    assert.equal(await get('View / Print Z').isVisible(), true);
    await screenshot('desktop-closed');
    await page.locator('[name=openingCash]').fill('-1');
    await get('Open Shift').click();
    assert.equal((await calls()).length, 0);
    await page.locator('[name=openingCash]').fill('125.25');
    await page.locator('form[data-draft=opening] [name=note]').fill('Opening fixture draft');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('combobox', { name: 'Choose register branch' }).selectOption('other');
    assert.equal(await page.getByRole('combobox', { name: 'Choose register branch' }).inputValue(), 'branch');
    assert.equal(await page.locator('[name=openingCash]').inputValue(), '125.25');
    await page.evaluate(() => { window.registerFixture.failNext = true; });
    await get('Open Shift').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('[name=openingCash]').inputValue(), '125.25');
    assert.equal(await page.locator('form[data-draft=opening] [name=note]').inputValue(), 'Opening fixture draft');
    await page.evaluate(() => { window.registerFixture.hold = true; });
    await page.locator('form[data-draft=opening]').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => window.registerFixture.calls.length === 2);
    assert.equal(await get('Open Shift').isDisabled(), true);
    await page.evaluate(() => { window.registerFixture.release(); });
    await page.getByRole('heading', { name: 'Active Shift' }).waitFor();
    assert.equal((await calls()).filter(c => c.action === 'opening').length, 2, 'one failed request + one success');
    check('opening validation, branch draft protection, failed-save retention and duplicate-submit lock');

    await load();
    assert.equal(await page.locator('#register-movement-form').isVisible(), false);
    assert.equal(await page.locator('#register-closing-form').isVisible(), false);
    assert.equal(await get('View / Print Z').isVisible(), true);
    assert.ok((await page.locator('main').innerText()).includes('$320.00'));
    await get('View all movements').click();
    assert.equal(await page.locator('.register-activity > div').count(), 6);
    await get('Show recent').click();
    await page.locator('main > section').last().locator('li').last().locator('summary').click();
    const history = await page.locator('main > section').last().locator('li').last().innerText();
    assert.ok(history.includes('Fixture opening note') && history.includes('Fixture closing note'));
    assert.ok(history.includes('Cash refunds') && history.includes('8 Oct 2026, 17:00'));
    await page.locator('main > section').last().locator('li').last().locator('summary').click();
    await get('View').click();
    assert.ok((await page.locator('dialog[open]').innerText()).includes('Open shift summary'));
    assert.equal(await get('Print Z Report').count(), 0);
    await page.getByRole('button', { name: 'Close report', exact: true }).click();
    await get('Record Cash Movement').click();
    assert.equal(await page.locator('#register-movement-form h2').evaluate(el => el === document.activeElement), true);
    await get('Safe drop').click();
    assert.equal(await page.locator('[name=type]').inputValue(), 'cash_out');
    assert.equal(await page.locator('[name=reason]').inputValue(), 'Safe drop');
    await page.locator('[name=amount]').fill('20.15');
    await page.locator('[name=reference]').fill('TEST-reference');
    await page.locator('form[data-draft=movement] [name=note]').fill('Movement draft');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('link', { name: 'Fixture navigation' }).click();
    assert.equal(new URL(page.url()).pathname, '/');
    const guards = await page.evaluate(() => {
      const unload = new Event('beforeunload', { cancelable: true });
      dispatchEvent(unload);
      const originalNow = Date.now;
      const refreshes = window.registerFixture.refreshes;
      Date.now = () => originalNow() + 60000;
      dispatchEvent(new Event('focus'));
      Date.now = originalNow;
      return { blockedUnload: unload.defaultPrevented, refreshes, after: window.registerFixture.refreshes };
    });
    assert.equal(guards.blockedUnload, true);
    assert.equal(guards.after, guards.refreshes);
    await get('Close Register').click();
    await page.locator('[name=closingCash]').fill('300');
    await page.locator('form[data-draft=closing] [name=note]').fill('Closing draft');
    await get('Record Cash Movement').click();
    assert.equal(await page.locator('[name=amount]').inputValue(), '20.15');
    assert.equal(await page.locator('[name=reference]').inputValue(), 'TEST-reference');
    await page.evaluate(() => { window.registerFixture.failNext = true; });
    await get('Record Movement').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('[name=amount]').inputValue(), '20.15');
    assert.equal(await page.locator('form[data-draft=movement] [name=note]').inputValue(), 'Movement draft');
    await page.evaluate(() => { window.registerFixture.hold = true; });
    await page.locator('form[data-draft=movement]').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => window.registerFixture.calls.length === 2);
    await page.evaluate(() => { window.registerFixture.release(); window.registerFixture.hold = false; });
    await page.waitForFunction(() => !document.querySelector('#register-movement-form').getClientRects().length);
    const movementCalls = await calls();
    assert.deepEqual(movementCalls[1].fields, { shiftId: 'active', type: 'cash_out', amount: '20.15', reason: 'Safe drop', reference: 'TEST-reference', note: 'Movement draft' });
    await get('Close Register').click();
    assert.equal(await page.locator('[name=closingCash]').inputValue(), '300');
    assert.equal(await page.locator('form[data-draft=closing] [name=note]').inputValue(), 'Closing draft');
    check('movement shortcuts, all payload fields, retained drafts across panels and saves, navigation/refresh guards, duplicate protection');

    const helper = page.locator('#register-closing-form details');
    assert.equal(await helper.getAttribute('open'), null);
    await helper.locator('summary').click();
    await page.getByRole('spinbutton', { name: 'Number of $100.00 denominations', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: 'Number of $50.00 denominations', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: 'Number of $0.01 denominations', exact: true }).fill('1');
    await get('Use counted total').click();
    assert.equal(await page.locator('[name=closingCash]').inputValue(), '300.01');
    assert.equal(await page.locator('output').innerText(), '$0.16');
    await helper.locator('summary').click();
    await get('Record Cash Movement').click();
    await get('Close Register').click();
    await helper.locator('summary').click();
    assert.equal(await page.getByRole('spinbutton', { name: 'Number of $100.00 denominations', exact: true }).inputValue(), '2');
    await helper.locator('summary').click();
    page.once('dialog', dialog => dialog.dismiss());
    await get('Close & Calculate').click();
    assert.equal((await calls()).filter(c => c.action === 'closing').length, 0);
    await page.evaluate(() => { window.registerFixture.failNext = true; });
    page.once('dialog', dialog => dialog.accept());
    await get('Close & Calculate').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('[name=closingCash]').inputValue(), '300.01');
    assert.equal(await page.locator('form[data-draft=closing] [name=note]').inputValue(), 'Closing draft');
    await page.evaluate(() => { window.registerFixture.hold = true; });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('form[data-draft=closing]').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => window.registerFixture.calls.filter(c => c.action === 'closing').length === 2);
    await page.evaluate(() => { window.registerFixture.release(); });
    await get('Open Shift').waitFor();
    const close = (await calls()).filter(c => c.action === 'closing');
    assert.deepEqual(close[1].fields, { shiftId: 'active', closingCash: '300.01', note: 'Closing draft' });
    check('expandable denomination helper, cent precision, retained counts, close confirmation, failures and duplicate protection');
    await get('View / Print Z').first().click();
    await page.locator('dialog[open]').waitFor();
    assert.ok((await page.locator('#shift-report-print').innerText()).includes('$299.85'));
    assert.ok((await page.locator('#shift-report-print').innerText()).includes('$0.16'));
    await get('Print Z Report').click();
    await page.waitForFunction(() => window.registerFixture.prints === 1);
    await page.emulateMedia({ media: 'print' });
    const print = await page.locator('#shift-report-print').boundingBox();
    assert.ok(print && print.width > 0);
    assert.equal(await page.locator('form[data-draft=opening]').isVisible(), false);
    await page.emulateMedia({ media: 'screen' });
    await screenshot('desktop-report');
    await page.getByRole('button', { name: 'Close report', exact: true }).click();
    check('closed history, final report snapshot and actual print preparation/selector with a stubbed print dialog');

    await load();
    await get('Record Cash Movement').click();
    await page.locator('[name=amount]').fill('3');
    await page.locator('[name=reason]').selectOption('Petty cash');
    await get('Close Register').click();
    await page.locator('[name=closingCash]').fill('0');
    let confirmations = 0;
    const protect = async dialog => { confirmations++; if (confirmations === 1) await dialog.accept(); else await dialog.dismiss(); };
    page.on('dialog', protect);
    await get('Close & Calculate').click();
    page.off('dialog', protect);
    assert.equal(confirmations, 2);
    assert.equal((await calls()).length, 0);
    await get('Record Cash Movement').click();
    assert.equal(await page.locator('[name=amount]').inputValue(), '3');
    await page.locator('#register-movement-form').getByRole('button', { name: 'Close', exact: true }).click();
    await get('Record Cash Movement').click();
    assert.equal(await page.locator('[name=amount]').inputValue(), '3');
    await get('Record Movement').click();
    await page.waitForFunction(() => !document.querySelector('#register-movement-form').getClientRects().length);
    await get('Close Register').click();
    page.once('dialog', dialog => dialog.accept());
    await get('Close & Calculate').click();
    await get('Open Shift').waitFor();
    assert.equal((await calls()).find(c => c.action === 'closing').fields.closingCash, '0');
    check('close protects an unsaved movement, hiding retains drafts and counted zero remains valid');

    const measurements = [];
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await load();
      measurements.push({ name, state: 'open', ...await noOverflow(name) });
      await screenshot(name + '-open');
      await get('Record Cash Movement').click();
      measurements.push({ name, state: 'movement', ...await noOverflow(name) });
      await screenshot(name + '-movement');
      await get('Close Register').click();
      await helper.locator('summary').click();
      measurements.push({ name, state: 'closing', ...await noOverflow(name) });
      await screenshot(name + '-closing');
      await load('closed');
      measurements.push({ name, state: 'closed', ...await noOverflow(name) });
      await screenshot(name + '-closed');
    }
    check('desktop 1440, tablet 820 and mobile 390: open/closed/movement/closing with no clipped controls and 44px targets');

    await page.setViewportSize({ width: 320, height: 640 });
    await load();
    await get('Close Register').click();
    await helper.locator('summary').click();
    measurements.push({ name: 'mobile-320', ...await noOverflow('320px mobile') });
    await screenshot('mobile-320-closing');
    await page.setViewportSize({ width: 820, height: 1180 });
    await load('open', 'km');
    await page.waitForFunction(() => document.querySelector('h1').textContent.includes('វេន'));
    measurements.push({ name: 'tablet-khmer', ...await noOverflow('Khmer tablet') });
    await screenshot('tablet-khmer');
    await page.setViewportSize({ width: 390, height: 844 });
    await load('open', 'km');
    await page.waitForFunction(() => document.querySelector('h1').textContent.includes('វេន'));
    measurements.push({ name: 'mobile-khmer', ...await noOverflow('Khmer mobile') });
    await screenshot('mobile-khmer');
    await page.locator('button[aria-controls=register-movement-form]').click();
    await page.locator('[name=reason]').selectOption('Cash float');
    assert.equal(await page.locator('[name=reason]').inputValue(), 'Cash float');
    await page.locator('button:has(svg.lucide-shield-check)').click();
    assert.equal(await page.locator('[name=reason]').inputValue(), 'Safe drop');
    assert.equal(await page.locator('[name=type]').inputValue(), 'cash_out');
    await page.locator('#register-movement-form button[aria-label]').click();
    await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.style.setProperty('--app-accent', '#7c3aed'); });
    await screenshot('mobile-dark');
    check('320px controls, Khmer translations and canonical reason values, existing dark/accent theme');

    await load('closing-only');
    assert.equal(await get('Record Cash Movement').count(), 0);
    await get('Close Register').click();
    assert.equal(await page.locator('[name=closingCash]').isVisible(), true);
    check('closing-only branch keeps closure and history available, blocks movement UI');
    assert.deepEqual(errors, [], 'browser runtime errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, measurements, browserErrors: errors, financialOperations: 0 }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.match(path.basename(temp), /^tenh-register-fixture-/);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
