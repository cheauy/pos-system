// Isolated component checks: every purchase/list service is replaced before bundling.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.TENH_BROWSER_MODULES || path.join(__dirname, '../node_modules')] }));
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/purchase-orders-workspace.tsx');
const output = path.join(root, 'docs/evidence/purchase-orders-redesign-20261010');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-po-fixture-'));
const checks = [];
const check = name => { checks.push(name); console.log('PASS ' + name); };
const loader = path.join(temp, 'loader.cjs');
fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css'))return 'module.exports='+JSON.stringify(Object.fromEntries([...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m=>[m[1],'po-'+m[1]])));return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
const dynamic = path.join(temp, 'dynamic.js');
fs.writeFileSync(dynamic, `const React=require(${JSON.stringify(require.resolve('react'))});module.exports=(load,options)=>{const Component=React.lazy(load);return props=>React.createElement(React.Suspense,{fallback:React.createElement(options.loading)},React.createElement(Component,props));};`);
const toast = path.join(temp, 'toast.js');
fs.writeFileSync(toast, 'module.exports={toast:{success(){}}};');
const link = path.join(temp, 'link.js');
fs.writeFileSync(link, `const React=require(${JSON.stringify(require.resolve('react'))});module.exports=({children,...props})=>React.createElement('a',props,children);`);
async function build() {
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: 'development', devtool: false, context: root, entry: fixture, output: { path: temp, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/navigation$': fixture, 'next/link$': link, 'next/dynamic$': dynamic, 'sonner$': toast } }, module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }), new webpack.NormalModuleReplacementPlugin(/^(\.\.\/actions|\.\/actions|\.\/list-actions)$/, resource => { if (resource.context.includes(path.join('dashboard', 'purchase-orders'))) resource.request = fixture; })], performance: { hints: false } });
    compiler.run((error, stats) => { compiler.close(() => {}); error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve(); });
  });
  const global = await postcss([tailwind()]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
  const css = ['app/(dashboard)/dashboard/purchase-orders/purchase-orders-responsive.module.css', 'components/date-range-filter.module.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([a-zA-Z][\w-]*)/g, '.po-$1')).join('\n');
  fs.writeFileSync(path.join(temp, 'style.css'), global.css + '\n' + css);
}
async function run() {
  await build(); fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    if (/^\/[\w.-]+\.(js|css)$/.test(req.url) && fs.existsSync(path.join(temp, req.url.slice(1)))) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(path.join(temp, req.url.slice(1)))); }
    else res.end('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error); });
    await page.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
    const button = name => page.getByRole('button', { name, exact: true });
    const modal = () => page.locator('dialog.po-orderDialog[open]');
    const filter = () => page.getByRole('dialog', { name: 'Filters', exact: true });
    const load = async (state = 'empty', lang = 'en', extra = '') => { await page.goto(`${url}/?state=${state}&lang=${lang}${extra}`); await page.locator('main').waitFor(); };
    const screenshot = async name => page.screenshot({ path: path.join(output, name + '.png') });
    async function noOverflow(label) {
      const result = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const scope = dialog || document.querySelector('main');
        const bounds = dialog?.getBoundingClientRect() || { left: 0, right: innerWidth };
        return { width: innerWidth, scroll: document.documentElement.scrollWidth, clipped: [...scope.querySelectorAll('input:not([type=hidden]), select, textarea, button, a')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').filter(el => { const rect = el.getBoundingClientRect(); return rect.left < bounds.left - 1 || rect.right > bounds.right + 1; }).map(el => el.outerHTML.slice(0, 100)) };
      });
      assert.ok(result.scroll <= result.width, label + ': page overflow'); assert.deepEqual(result.clipped, [], label + ': clipped controls');
    }
    async function openForm() { await button('New Purchase Order').filter({ visible: true }).click(); await modal().locator('[name=supplierId]').waitFor(); }
    async function chooseProducts() { await button('Choose Products').click(); await page.getByRole('checkbox', { name: 'Select all of QA Tee' }).check(); await page.getByRole('checkbox', { name: 'Select all of Linen Shirt' }).check(); await button('Choose Products').click(); }
    async function prepareForm() { await openForm(); await modal().locator('[name=supplierId]').selectOption('fixture-supplier'); await chooseProducts(); await modal().getByRole('spinbutton', { name: 'Quantity', exact: true }).nth(0).fill('10'); await modal().getByRole('spinbutton', { name: 'Quantity', exact: true }).nth(1).fill('5'); }

    await load(); assert.equal(await button('New Purchase Order').filter({ visible: true }).count(), 1);
    const toolbar = page.locator('.po-compactToolbar'); assert.equal(await toolbar.isVisible(), true);
    assert.equal(await page.getByRole('combobox').filter({ visible: true }).count(), 0); await noOverflow('phone empty'); await screenshot('phone-empty');
    await load('list'); await button('Filter').click(); await filter().locator('[name=statusFilter]').selectOption('draft'); await filter().locator('[name=supplierFilter]').selectOption('fixture-supplier'); await filter().locator('[name=sortMode]').selectOption('oldest');
    await filter().locator('[name=fromDate]').fill('2026-10-11'); await filter().locator('[name=toDate]').fill('2026-10-10'); await button('Apply').filter({ visible: true }).click();
    assert.equal(await filter().isVisible(), true); assert.match(await filter().getByRole('alert').innerText(), /Start date/); assert.equal(await page.evaluate(() => window.purchaseFixture.loads.length), 0); await screenshot('phone-filter-validation');
    await filter().locator('[name=fromDate]').fill('2026-10-09'); await page.evaluate(() => { window.purchaseFixture.hold = true; }); await button('Apply').filter({ visible: true }).click();
    await page.waitForFunction(() => window.purchaseFixture.loads.length === 1); assert.equal(await filter().count(), 0); assert.equal(await page.locator('.po-skeleton').isVisible(), true); await screenshot('phone-filter-loading');
    const filters = await page.evaluate(() => window.purchaseFixture.loads[0]); assert.equal(filters.statusFilter, 'draft'); assert.equal(filters.supplierFilter, 'fixture-supplier'); assert.equal(filters.sortMode, 'oldest'); assert.equal(filters.fromDate, '2026-10-09');
    await page.evaluate(() => { window.purchaseFixture.hold = false; window.purchaseFixture.release(); }); await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false'); assert.equal(await page.locator('.po-listContent ul > li').count(), 1);
    await button('Filter').click(); await button('Reset').filter({ visible: true }).click(); await button('Apply').filter({ visible: true }).click(); await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false');
    await page.getByRole('textbox', { name: 'Search purchase orders' }).fill('TEST-PO-001'); await page.waitForFunction(() => window.purchaseFixture.loads.length === 3); await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false'); assert.equal(await page.locator('.po-listContent ul > li').count(), 1);
    await button('Filter').click(); await page.keyboard.press('Escape'); assert.equal(await filter().count(), 0); assert.equal(await button('Filter').evaluate(el => el === document.activeElement), true); check('compact filters: validation, draft Apply, skeleton, supplier/status/sort/date, reset, search, Escape and focus return');

    for (const [name, width, height] of [['phone-portrait',390,844], ['phone-landscape',844,390], ['tablet-portrait',768,1024], ['tablet-landscape',1024,768]]) {
      await page.setViewportSize({ width, height }); await load(); await prepareForm(); await noOverflow(name);
      assert.equal(await modal().locator('.po-bottomBar').isVisible(), true); assert.match(await modal().locator('.po-bottomTotals').innerText(), /\$100.00/);
      const footer = await modal().locator('.po-bottomBar').boundingBox(); assert.ok(footer.y + footer.height <= height + 1, name + ': footer below viewport');
      assert.equal(await modal().locator('.po-formHeader > div:last-child').isVisible(), false);
      if (name.startsWith('phone')) { assert.equal(await modal().locator('thead').isVisible(), false); assert.equal(await modal().locator('.po-orderDialog').count(), 0); }
      if (name.startsWith('tablet')) { assert.equal(await modal().locator('thead').isVisible(), true); const info = await modal().locator('.po-information').boundingBox(); const summary = await modal().locator('.po-summary').boundingBox(); assert.ok(summary.x > info.x + info.width - 1); }
      const color = await modal().locator('.po-bottomBar button[value=sent]').evaluate(el => getComputedStyle(el).backgroundColor); assert.equal(color, 'rgb(147, 67, 11)');
      await modal().locator('[name=notes]').fill('Fixture notes');
      await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.po-formContent').scrollTop = 0; window.scrollTo(0, 0); });
      await screenshot(name);
      if (name === 'phone-portrait') { await modal().locator('.po-itemsCard').evaluate(el => el.scrollIntoView({ block: 'start' })); await screenshot('phone-editable-items'); }
      check(name + ': fields, editable items, total, themed actions and footer bounds');
    }
    await page.setViewportSize({ width: 390, height: 844 }); await load(); await prepareForm();
    await modal().getByRole('spinbutton', { name: 'Cost Price', exact: true }).nth(0).fill('7.5'); assert.match(await modal().locator('.po-bottomTotals').innerText(), /\$115.00/);
    await button('Choose Products').click(); await page.getByRole('checkbox', { name: 'Select all of Linen Shirt' }).uncheck(); await page.getByRole('checkbox', { name: 'Select all of Linen Shirt' }).check(); await button('Choose Products').click(); assert.equal(await modal().getByRole('spinbutton', { name: 'Quantity', exact: true }).nth(0).inputValue(), '10');
    await button('Scan Barcode').click(); await modal().getByPlaceholder('Scan or enter barcode').fill('TEST-SHIRT'); await button('Add barcode item').click();
    await modal().locator('input[type=file]').setInputFiles({ name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from('sku,quantity,unit_cost\nQAT-BLK-M,2,6\n') });
    await page.waitForFunction(() => document.querySelector('input[name=items]').value.includes('"quantity":12'));
    await modal().getByRole('button', { name: 'Remove purchase order item' }).nth(1).click(); assert.equal(await modal().locator('tbody tr').count(), 1); check('product selection preserves edits; barcode, CSV import and removal');
    await modal().locator('[name=notes]').fill('Fixture notes');
    await modal().locator('[name=referenceNumber]').fill('TEST-reference');
    await modal().locator('[name=expectedDate]').fill('2027-01-01');
    await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, value: 420 }); visualViewport.dispatchEvent(new Event('resize')); });
    await modal().locator('[name=notes]').focus(); await page.waitForTimeout(100);
    const keyboardBounds = await modal().locator('[name=notes]').boundingBox(); const barBounds = await modal().locator('.po-bottomBar').boundingBox();
    assert.ok(keyboardBounds.y + keyboardBounds.height <= barBounds.y + 1, 'focused notes covered'); assert.ok(barBounds.y + barBounds.height <= 421, 'footer outside keyboard viewport'); await screenshot('phone-keyboard-viewport');
    await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
    await page.evaluate(() => { window.purchaseFixture.failNext = true; });
    assert.equal(await modal().locator('[name=notes]').inputValue(), 'Fixture notes');
    await modal().locator('.po-bottomBar button[value=draft]').click(); await modal().getByRole('alert').waitFor(); assert.equal(await modal().locator('[name=notes]').inputValue(), 'Fixture notes'); assert.equal(await modal().locator('[name=supplierId]').inputValue(), 'fixture-supplier'); assert.equal(await modal().locator('[name=referenceNumber]').inputValue(), 'TEST-reference'); assert.equal(await modal().locator('[name=expectedDate]').inputValue(), '2027-01-01');
    await page.evaluate(() => { window.purchaseFixture.hold = true; }); await modal().locator('.po-bottomBar button[value=draft]').click(); await page.waitForFunction(() => window.purchaseFixture.calls.length === 2); assert.equal(await modal().locator('.po-bottomBar button[value=draft]').isDisabled(), true); assert.equal(await button('Close new purchase order').isDisabled(), true);
    await page.evaluate(() => { window.purchaseFixture.hold = false; window.purchaseFixture.release(); }); await page.waitForFunction(() => !document.querySelector('dialog[aria-label="New Purchase Order"]'));
    const draft = await page.evaluate(() => window.purchaseFixture.calls[1]); assert.equal(draft.submissionStatus, 'draft'); assert.equal(draft.supplierId, 'fixture-supplier'); assert.equal(JSON.parse(draft.items)[0].quantity, 12); assert.equal(draft.notes, 'Fixture notes'); assert.equal(Object.hasOwn(draft, 'po_number'), false);
    await prepareForm(); await modal().locator('.po-bottomBar button[value=sent]').click(); await page.waitForFunction(() => window.purchaseFixture.calls.length === 3); assert.equal(await page.evaluate(() => window.purchaseFixture.calls[2].submissionStatus), 'sent'); check('keyboard viewport, failed save retains draft, pending lock, draft/sent payloads and automatic PO numbering');
    await load('empty','en','&permission=view'); assert.equal(await button('New Purchase Order').count(), 0); check('create permission preserved');
    await load('empty','km'); await page.waitForFunction(() => /[\u1780-\u17ff]/.test(document.querySelector('main').innerText)); await page.locator('.po-emptyState button').click(); await modal().locator('[name=supplierId]').waitFor(); await noOverflow('Khmer phone'); await screenshot('phone-khmer'); check('Khmer translations and widths');
    await page.setViewportSize({ width: 768, height: 1024 }); await load('standalone'); await noOverflow('standalone tablet'); assert.equal(await page.locator('.po-bottomBar').isVisible(), true); await screenshot('tablet-standalone');
    await page.setViewportSize({ width: 1440, height: 1000 }); await load('list'); assert.equal(await toolbar.isVisible(), false); assert.equal(await page.locator('.po-desktopFilters').isVisible(), true); assert.equal(await page.locator('.po-listContent > table').isVisible(), true); await openForm(); assert.equal(await modal().locator('.po-formHeader > div:last-child').isVisible(), true); assert.equal(await modal().locator('.po-bottomBar').isVisible(), false); await screenshot('desktop-preserved'); check('standalone form and desktop layout preserved');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors, screenshotFiles: fs.readdirSync(output).filter(file => file.endsWith('.png')), changedFiles: [
      'app/(dashboard)/dashboard/purchase-orders/purchase-orders-client.tsx',
      'app/(dashboard)/dashboard/purchase-orders/new-order-dialog.tsx',
      'app/(dashboard)/dashboard/purchase-orders/new/purchase-order-form.tsx',
      'app/(dashboard)/dashboard/purchase-orders/compact-purchase-filters.tsx',
      'app/(dashboard)/dashboard/purchase-orders/purchase-orders-responsive.module.css',
      'tests/purchase-order-picker.test.mjs', 'tests/fixtures/purchase-orders-workspace.tsx', 'tests/purchase-orders-workspace.browser.cjs',
    ], viewports: { phonePortrait: [390,844], phoneLandscape: [844,390], tabletPortrait: [768,1024], tabletLandscape: [1024,768], desktop: [1440,1000], keyboardVisualViewport: [390,420] }, safety: 'Real components; mocked purchase/list services and Next navigation; external network blocked. No SQL or real orders.', limitations: ['Keyboard covered with a simulated visual viewport, not a physical device.', 'No native mobile changes; no live supplier or financial requests.'] }, null, 2));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
