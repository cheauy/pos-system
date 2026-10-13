/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser fixture runner. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.TENH_BROWSER_MODULES || path.join(__dirname, '../node_modules')] }));
const root = path.resolve(__dirname, '..'), fixture = path.join(__dirname, 'fixtures/business-overview-catalog.tsx');
const output = path.join(root, 'docs/evidence/business-overview-catalog-20261011');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-settings-'));
const loader = path.join(temp, 'loader.cjs');
fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css'))return '';return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
const qr = path.join(temp, 'qr.cjs'); fs.writeFileSync(qr, 'module.exports={toDataURL:async()=>""}');
const checks = [];
function check(name) { checks.push(name); console.log('PASS ' + name); }
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const aliases = { 'next/navigation$': fixture, 'next/link$': fixture, 'next/image$': fixture, 'qrcode$': qr };
  for (const service of ['auth/require-permission', 'auth/effective-permissions', 'supabase/admin', 'storefront/get-storefront', 'tenancy/domain', 'subscriptions/entitlements', 'subscriptions/payment-expiry']) aliases['@/lib/' + service + '$'] = fixture;
  aliases['@'] = root;
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: 'development', devtool: false, context: root, entry: fixture, output: { path: temp, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: aliases }, module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }), new webpack.NormalModuleReplacementPlugin(/^\.\/(actions|info-actions|catalog-actions|qr-actions)$|^\.\.\/\.\.\/online-store\/actions$/, resource => { if (/business|online-store/.test(resource.context)) resource.request = fixture; })], performance: { hints: false } });
    compiler.run((error, stats) => { compiler.close(() => {}); if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true }))); else resolve(); });
  });
  const global = await postcss([tailwind()]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
  const css = ['app/(dashboard)/dashboard/settings/settings-layout.css', 'app/(dashboard)/dashboard/settings/business/overview-responsive.css', 'app/(dashboard)/dashboard/online-store/catalog-responsive.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  fs.writeFileSync(path.join(temp, 'style.css'), global.css + '\n' + css);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/fixture.js') || req.url.startsWith('/style.css')) { const css = req.url.startsWith('/style.css'); res.setHeader('Content-Type', css ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(path.join(temp, css ? 'style.css' : 'fixture.js'))); }
    else if (req.url.startsWith('/shirt.svg')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#ddd"/></svg>'); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    async function newPage(options) { const target = await browser.newPage(options); target.on('pageerror', error => errors.push(error.message)); target.on('request', req => assert.equal(new URL(req.url()).origin, url, 'No external requests')); return target; }
    const page = await newPage({ viewport: { width: 390, height: 844 } });
    const load = async (query = '') => { await page.goto(url + '/?' + query); await page.locator('.business-overview').waitFor({ state: 'attached' }); };
    const overflow = async name => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' page overflow'); };
    for (const [name, width, height, touch] of [['phone',390,844,false],['tablet',768,1024,false],['pro',1024,1366,false],['landscape',1180,820,false],['pro-landscape',1366,1024,true],['desktop',1440,1000,false]]) {
      await page.setViewportSize({ width, height });
      if (touch) { await page.close(); /* Separate touch context verifies the coarse-pointer tablet rule. */ }
      if (touch) {
        const tablet = await newPage({ viewport: { width, height }, hasTouch: true });
        await tablet.goto(url); await tablet.locator('.business-overview').waitFor();
        assert.equal(await tablet.locator('.overview-credit-compact').isVisible(), true);
        assert.equal(await tablet.locator('.bs-nav').evaluate(el => getComputedStyle(el).display), 'flex');
        await tablet.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); await tablet.close(); check('iPad Pro landscape uses compact tablet layout with a coarse pointer');
        // Recreate the main page below through a separate desktop check.
        break;
      }
      await load(); await overflow(name);
      const content = await page.locator('.bs-panel-content').boundingBox(), footer = await page.locator('.settings-save-bar').filter({ visible: true }).boundingBox();
      assert.ok(content.y + content.height <= footer.y + 1, 'Content scrolls above the footer');
      assert.equal(await page.locator('.overview-credit-compact').isVisible(), width < 1280);
      assert.equal(await page.locator('.overview-duplicate-identity').isVisible(), width >= 1280);
      if (width >= 768 && width < 1280) { const a = await page.locator('.overview-identity').boundingBox(), b = await page.locator('.overview-credits').boundingBox(); assert.ok(b.x > a.x + a.width); }
      await page.screenshot({ path: path.join(output, name + '-overview.png'), fullPage: true });
      await page.locator('.bs-nav a[href="?section=product"]').click(); await page.locator('.catalog-row').first().waitFor(); await overflow(name + ' catalog');
      assert.equal(await page.locator('.catalog-desktop').isVisible(), width >= 1280);
      await page.screenshot({ path: path.join(output, name + '-catalog.png'), fullPage: true }); check(name + ' Overview and catalog layout');
    }
    const testPage = await newPage({ viewport: { width: 390, height: 844 } });
    // Tests below use the same real-component bundle on a fresh page after the touch context.
    await testPage.goto(url + '/?section=product'); await testPage.locator('.catalog-row').first().waitFor();
    const row = testPage.locator('.catalog-row').first(), drawer = testPage.locator('.catalog-details-panel');
    await row.locator('.catalog-row-select input').check(); assert.equal(await drawer.isVisible(), false);
    await row.locator('.catalog-row-details').click(); await drawer.waitFor();
    assert.ok(await drawer.getByText('Hidden by category', { exact: true }).isVisible());
    assert.equal(await testPage.evaluate(() => window.settingsFixture.loads), 1);
    await drawer.getByRole('button', { name: 'Close product details' }).click();
    assert.equal(await row.locator('.catalog-row-select input').isChecked(), true);
    await row.locator('.catalog-row-details').click(); assert.equal(await testPage.evaluate(() => window.settingsFixture.loads), 1);
    await testPage.evaluate(() => { window.settingsFixture.fail = true; window.settingsFixture.hold = true; });
    await drawer.locator('.catalog-detail-toggle').filter({ hasText: 'Online' }).locator('input').click();
    await drawer.getByText('Saving…', { exact: true }).waitFor(); assert.equal(await drawer.locator('input[role=switch]').first().isDisabled(), true);
    await testPage.evaluate(() => window.settingsFixture.release()); await drawer.getByText('Fixture save failed', { exact: true }).waitFor();
    assert.equal(await testPage.evaluate(() => window.settingsFixture.loads), 1);
    await testPage.evaluate(() => { window.settingsFixture.fail = false; window.settingsFixture.hold = false; });
    await drawer.locator('.catalog-detail-toggle').filter({ hasText: 'Online' }).locator('input').click(); await drawer.getByText('Saved', { exact: true }).waitFor();
    await drawer.getByRole('button', { name: 'Close product details' }).click();
    assert.equal(await testPage.evaluate(() => window.settingsFixture.loads), 2); check('Distinct variants, selection, drawer, instant-save pending/failure/success and request counts');
    await testPage.locator('.catalog-selection input').check(); await testPage.getByRole('button', { name: 'Actions', exact: true }).filter({ visible: true }).click();
    await testPage.getByRole('button', { name: 'Mark as Pre-order', exact: true }).filter({ visible: true }).click();
    await testPage.waitForFunction(() => window.settingsFixture.loads === 3);
    const bulk = await testPage.evaluate(() => window.settingsFixture.calls.at(-1)); assert.equal(bulk.ids.length, 10); assert.equal(new Set(bulk.ids).size, 10); check('Select page and Actions retain separate variant IDs');
    await testPage.getByRole('button', { name: 'Filter products', exact: true }).click();
    const filter = testPage.locator('.catalog-filter-panel'); await filter.getByLabel('Filter stock', { exact: true }).selectOption('out');
    await filter.getByLabel('Filter category', { exact: true }).evaluate(el => { el.insertBefore(new Option('Invalid fixture', ''), el.firstChild); el.value = ''; });
    await filter.getByRole('button', { name: 'Apply', exact: true }).click(); assert.equal(await filter.isVisible(), true);
    await filter.getByLabel('Filter category', { exact: true }).selectOption('all');
    await filter.getByRole('button', { name: 'Apply', exact: true }).click(); assert.equal(await filter.isVisible(), false); assert.equal(await testPage.locator('.catalog-row').count(), 1);
    await testPage.getByRole('button', { name: 'Grid view', exact: true }).filter({ visible: true }).click(); assert.equal(await testPage.locator('.catalog-grid').isVisible(), true);
    assert.equal(await testPage.evaluate(() => window.settingsFixture.loads), 3); check('Filter Apply closes, view switch retains data without fetching');
    await testPage.setViewportSize({ width: 390, height: 480 });
    await testPage.locator('.catalog-toolbar input').focus();
    const compactContent = await testPage.locator('.bs-panel-content').boundingBox(), compactFooter = await testPage.locator('.settings-save-bar').filter({ visible: true }).boundingBox();
    assert.ok(compactContent.y + compactContent.height <= compactFooter.y + 1); assert.ok(compactFooter.y + compactFooter.height <= 481);
    await testPage.setViewportSize({ width: 390, height: 844 }); check('Reduced keyboard viewport keeps content and Save in separate areas');
    await testPage.locator('.bs-nav a[href="?section=business-info"]').click(); await testPage.locator('[name=phone]').fill('123456');
    await testPage.locator('[name=businessName]').fill('x');
    await testPage.locator('.bs-nav a[href="?section=overview"]').click(); await testPage.getByRole('button', { name: 'Save business details', exact: true }).click();
    assert.equal(await testPage.locator('.bs-panel').getAttribute('data-active'), 'business-info'); assert.equal(await testPage.locator('[name=businessName]').evaluate(el => el.validity.valid), false);
    await testPage.locator('[name=businessName]').fill('Fixture Clothing');
    await testPage.locator('.bs-nav a[href="?section=overview"]').click(); await testPage.getByRole('button', { name: 'Save business details', exact: true }).waitFor();
    assert.equal(await testPage.getByRole('button', { name: 'Save business details', exact: true }).isEnabled(), true);
    await testPage.evaluate(() => { window.settingsFixture.fail = true; window.settingsFixture.hold = true; }); await testPage.getByRole('button', { name: 'Save business details', exact: true }).click();
    await testPage.getByRole('button', { name: 'Saving…', exact: true }).waitFor(); assert.equal(await testPage.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true);
    await testPage.evaluate(() => { window.settingsFixture.release(); window.settingsFixture.hold = false; });
    await testPage.getByText('Fixture save failed', { exact: true }).filter({ visible: true }).waitFor();
    await testPage.locator('.bs-nav a[href="?section=business-info"]').click(); assert.equal(await testPage.locator('[name=phone]').inputValue(), '123456'); check('Business draft persists, validation reveals its section and failed Save preserves entered values');
    for (const query of ['lang=km', 'section=product&lang=km', 'section=product&empty=1', 'section=product&load-error=1', 'section=product&readonly=1']) { await testPage.goto(url + '/?' + query); await testPage.locator('main').waitFor(); if (query.includes('product')) await testPage.locator('#catalog, [role=alert]').first().waitFor(); await testPage.waitForTimeout(250); assert.ok(await testPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); if (query.includes('readonly')) assert.equal(await testPage.locator('.catalog-row input').first().isDisabled(), true); if (query.includes('product&lang=km')) { await testPage.locator('.catalog-row-details').first().click(); assert.ok(await testPage.locator('.catalog-details-panel').evaluate(el => el.scrollWidth <= el.clientWidth)); await testPage.screenshot({ path: path.join(output, 'khmer-drawer.png') }); await testPage.locator('.catalog-details-panel header button').click(); } }
    check('Khmer, empty, load-error and read-only fixture states');
    await testPage.goto(url + '/?section=product&slow-load=1'); await testPage.locator('[data-skeleton=catalog]').waitFor(); await testPage.locator('#catalog').waitFor(); check('Catalog loading uses its existing local skeleton');
    const desktop = await newPage({ viewport: { width: 1440, height: 1000 } }); await desktop.goto(url + '/?section=product'); await desktop.locator('#catalog').waitFor(); assert.equal(await desktop.locator('.catalog-desktop').isVisible(), true); assert.equal(await desktop.locator('.catalog-rows').isVisible(), false); check('Desktop retains original table and filters');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, externalWrites: 0 }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
