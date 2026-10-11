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
const sharp = require('sharp');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.env.TENH_BROWSER_MODULES || path.join(path.dirname(__dirname), 'node_modules')],
}));
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/stock-transfers-responsive.tsx');
const output = path.join(root, 'docs/evidence/stock-transfers-responsive-20261010');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-transfer-fixture-'));
const checks = [];
const desktopComparisons = [];
function check(name) { checks.push(name); console.log('PASS ' + name); }
const loader = path.join(temp, 'loader.cjs');
fs.writeFileSync(loader, `
const ts = require(${JSON.stringify(require.resolve('typescript'))});
module.exports = function(source) {
  const baseline = ${JSON.stringify(process.env.TRANSFER_BASELINE_SOURCE || '')};
  if (baseline && this.resourcePath.endsWith('stock-transfers-client.tsx')) source = require('node:fs').readFileSync(baseline, 'utf8');
  if (this.resourcePath.endsWith('.css')) {
    const names = [...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m => m[1]);
    return 'module.exports = ' + JSON.stringify(Object.fromEntries(names.map(n => [n, require('node:path').basename(this.resourcePath,'.module.css') + '-' + n])));
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
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/navigation$': fixture, [path.join(root, 'app/(dashboard)/dashboard/workspace-branch-provider.tsx')]: fixture } },
      module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] },
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }), new webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
        if (resource.context.endsWith('stock-transfers')) resource.request = fixture;
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
  const cssFiles = ['app/(dashboard)/dashboard/pos/pos-workspace.module.css','app/(dashboard)/dashboard/stock-transfers/stock-transfers-responsive.module.css'].filter(file => fs.existsSync(path.join(root,file)));
  const local = cssFiles.map(file => fs.readFileSync(path.join(root,file),'utf8').replace(/:global\(([^)]+)\)/g,'$1').replace(/\.([a-zA-Z][\w-]*)/g,'.' + path.basename(file,'.module.css') + '-$1').replaceAll('.pos-workspace-dark','.dark')).join('\n');
  fs.writeFileSync(path.join(temp, 'style.css'), global.css + '\n' + local);
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  await build();
  const server = http.createServer((req, res) => {
    const css = req.url.startsWith('/style.css');
    if (css || req.url.startsWith('/fixture.js')) {
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
    let page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('request', req => assert.equal(new URL(req.url()).origin, url, 'fixture cannot make external requests'));
    const get = name => page.getByRole('button', { name, exact: true });
    const load = async (query = '') => { await page.goto(url + '/?' + query); await page.locator('main').waitFor(); await page.waitForTimeout(120); };
    const shot = (name, fullPage = false) => page.screenshot({ path: path.join(output, name + '.png'), fullPage });
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const state of ['empty', 'populated']) {
        await load(state === 'empty' ? 'empty' : '');
        for (const view of ['listing', 'dialog', 'selected']) {
          if (view === 'dialog') await get('New Transfer').click();
          if (view === 'selected') {
            const draft = page.getByRole('dialog', { name: 'New Transfer', exact: true });
            await draft.locator('select').nth(0).selectOption('central'); await draft.locator('select').nth(1).selectOption('north'); await get('Select all').click();
            await draft.getByRole('spinbutton').first().fill('3'); await draft.locator('input[placeholder="e.g. Stock for new store opening..."]:visible').fill('Desktop draft fixture');
            await page.mouse.move(0, 0); await page.waitForTimeout(250);
          }
          const name = 'desktop-' + width + '-' + state + '-' + view;
          if (process.env.TRANSFER_BASELINE_SOURCE) { if (view === 'selected') await shot('baseline-' + name, true); continue; }
          await shot(name, true);
          const before = await sharp(path.join(output, 'baseline-' + name + '.png')).raw().toBuffer({ resolveWithObject: true });
          const after = await sharp(path.join(output, name + '.png')).raw().toBuffer({ resolveWithObject: true });
          assert.deepEqual(before.info, after.info);
          let changedPixels = 0, maxRgbDifference = 0;
          for (let pixel = 0; pixel < before.data.length; pixel += 3) {
            let changed = false;
            for (let channel = 0; channel < 3; channel++) {
              const delta = Math.abs(before.data[pixel + channel] - after.data[pixel + channel]);
              maxRgbDifference = Math.max(delta, maxRgbDifference); changed ||= delta > 0;
            }
            if (changed) changedPixels++;
          }
          // Chromium occasionally rounds a few shadow pixels by one RGB level.
          assert.ok(maxRgbDifference <= 1 && changedPixels <= Math.ceil(before.info.width * before.info.height * .0001), name + ' desktop changed: ' + JSON.stringify({ changedPixels, maxRgbDifference }));
          desktopComparisons.push({ name, changedPixels, maxRgbDifference }); check(name + ' unchanged');
        }
      }
    }
    if (process.env.TRANSFER_BASELINE_SOURCE) return;
    await page.close();
    page = await browser.newPage({ hasTouch: true });
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('request', req => assert.equal(new URL(req.url()).origin, url, 'fixture cannot make external requests'));
    const cls = name => page.locator('.stock-transfers-responsive-' + name);
    const dialog = () => page.getByRole('dialog', { name: 'New Transfer', exact: true });
    const source = () => cls('branches').locator('select').nth(0);
    const destination = () => cls('branches').locator('select').nth(1);
    const picker = () => page.getByRole('searchbox', { name: 'Search products' });
    const quantities = () => cls('selectedItems').getByRole('spinbutton');
    const note = () => cls('optional').getByPlaceholder('e.g. Stock for new store opening...');
    const calls = () => page.evaluate(() => window.transferFixture.calls);
    async function noOverflow(label) {
      const result = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth,
        clipped: [...document.querySelectorAll('main input, main select, main button')].filter(el => el.getClientRects().length && !el.closest('nav')).filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.outerHTML.slice(0, 130)) }));
      assert.ok(result.document <= result.width, label + ' document overflow'); assert.deepEqual(result.clipped, [], label + ' clipped controls');
    }
    async function assertFooter(label) {
      const footer = await cls('draftActions').boundingBox(), bounds = await page.getByRole('dialog').boundingBox();
      assert.ok(footer.y + footer.height <= bounds.y + bounds.height + 1, label + ' footer within dialog: ' + JSON.stringify({ footer, bounds, containers: await page.getByRole('dialog').evaluate(el => [...el.querySelectorAll('form,fieldset,form>fieldset>div')].map(node => ({ cls: node.className, rect: node.getBoundingClientRect().toJSON(), flex: getComputedStyle(node).flex, height: getComputedStyle(node).height }))) }));
      assert.ok(footer.y + footer.height <= page.viewportSize().height + 1, label + ' footer within viewport');
      assert.ok(bounds.y + bounds.height - footer.y - footer.height <= 16, label + ' no empty area below actions');
      for (const button of await cls('draftActions').locator('button').all()) assert.ok((await button.boundingBox()).height >= 44, label + ' touch targets');
    }
    for (const [name, width, height] of [['phone-portrait', 390, 844], ['phone-landscape', 844, 390], ['tablet-portrait', 820, 1180], ['tablet-landscape', 1180, 820]]) {
      await page.setViewportSize({ width, height }); await load('empty'); await noOverflow(name + ' empty listing'); await shot(name + '-empty-listing'); await load();
      assert.equal(await get('New Transfer').count(), 1); assert.equal(await cls('pageHeading').isVisible(), false);
      const summary = await page.getByRole('region', { name: 'Transfer summary' }).innerText();
      for (const text of ['Total', '12', 'Draft', 'In Transit', 'Received', 'Cancelled', 'Last 14 days']) assert.ok(summary.includes(text));
      const toolbar = await cls('toolbar').boundingBox(), filter = await get('Filters').boundingBox();
      assert.ok(filter.y >= toolbar.y && filter.y + filter.height <= toolbar.y + toolbar.height);
      await noOverflow(name + ' listing'); await shot(name + '-listing');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const header = await page.locator('.workspace-header').boundingBox(); assert.equal(header.y, 0, name + ' fixed header');
      const pagination = await cls('pagination').boundingBox(), bar = await cls('listingBar').boundingBox();
      assert.ok(pagination.y + pagination.height <= bar.y, name + ' pagination clear of action bar');
      await get('Next page').click(); assert.ok((await cls('listing').innerText()).includes('TR-TEST-006'));
      await get('New Transfer').click(); await dialog().waitFor(); assert.equal(await cls('listingBar').count(), 0);
      await shot(name + '-new-transfer');
      const dialogBounds = await dialog().boundingBox(), headerBounds = await page.locator('.workspace-header').boundingBox();
      assert.ok(dialogBounds.y >= headerBounds.height - 1, name + ' header uncovered: ' + JSON.stringify({ dialogBounds, headerBounds }));
      assert.equal(await get('Create Draft').isDisabled(), true); assert.equal(await cls('chooseSource').isVisible(), true); assert.equal(await note().isVisible(), false);
      const branches = await cls('branches').boundingBox(), product = await cls('picker').boundingBox();
      assert.ok(width >= 760 && height >= 520 ? product.x >= branches.x + branches.width : product.y >= branches.y + branches.height, name + ' layout');
      await assertFooter(name + ' empty'); await noOverflow(name + ' dialog'); await shot(name + '-new-transfer');
      await source().selectOption('central'); await destination().selectOption('north'); await get('Select all').click();
      assert.equal(await quantities().count(), 17); await quantities().first().fill('6'); assert.equal(await quantities().first().inputValue(), '6');
      await shot(name + '-selected');
      await assertFooter(name + ' selected'); await noOverflow(name + ' populated dialog');
      await quantities().last().scrollIntoViewIfNeeded();
      const quantity = await quantities().last().boundingBox(), scroller = await cls('draftScroll').boundingBox();
      assert.ok(quantity.y >= scroller.y && quantity.y + quantity.height <= scroller.y + scroller.height + 1, name + ' quantity scrolls into view');
      await shot(name + '-selected'); await get('Cancel').click(); assert.equal((await calls()).length, 0, 'selection must never save automatically');
      check(name + ': compact listing, fixed header, pagination clearance, adaptive dialog, source prompt, 17 selections, quantity scroll, stable actions');
    }
    await page.setViewportSize({ width: 390, height: 844 }); await load();
    await get('Filters').click();
    const popup = page.getByRole('dialog', { name: 'Filters', exact: true }); await popup.waitFor();
    await popup.locator('[name=status]').selectOption('received'); await popup.locator('[name=branch]').selectOption('central');
    assert.ok((await cls('listing').innerText()).includes('12 transfer records'), 'filters stay staged');
    await page.keyboard.press('Escape'); assert.equal(await popup.count(), 0); await get('Filters').click();
    assert.equal(await popup.locator('[name=status]').inputValue(), 'all');
    await popup.locator('[name=status]').selectOption('received'); await popup.locator('[name=branch]').selectOption('central');
    await shot('phone-filters'); await get('Apply').click(); assert.equal(await popup.count(), 0);
    assert.ok((await cls('listing').innerText()).includes('2 transfer records'));
    assert.equal(await page.locator('[aria-busy=true]').count(), 0, 'local filters have no artificial loader');
    assert.equal(await get('Filters').evaluate(el => el === document.activeElement), true, 'opener focus restored');
    await get('Filters').click(); await get('Reset').click();
    assert.ok((await cls('listing').innerText()).includes('2 transfer records')); await get('Apply').click();
    assert.ok((await cls('listing').innerText()).includes('12 transfer records'));
    const listingSearch = page.getByPlaceholder('Search transfers, reference, or products...');
    await listingSearch.fill('Fixture reference 9'); assert.ok((await cls('listing').innerText()).includes('1 transfer records'));
    await listingSearch.fill('TEST-0'); assert.ok((await cls('listing').innerText()).includes('12 transfer records'));
    const tabs = page.getByRole('navigation', { name: 'Transfer status' });
    await tabs.getByRole('button', { name: 'Cancelled', exact: true }).click();
    assert.ok((await cls('listing').innerText()).includes('2 transfer records')); assert.ok(await tabs.evaluate(el => el.scrollWidth > el.clientWidth));
    check('filters Apply/cancel/Reset/focus, local apply without fake skeletons, listing reference/SKU search and horizontally scrolling tabs');

    await load(); await get('New Transfer').click(); await source().selectOption('central'); await destination().selectOption('north');
    for (const term of ['Linen', 'M', 'Black', 'TEST-1']) { await picker().fill(term); assert.ok(await page.getByRole('list', { name: 'Products' }).locator('li').count() > 0); }
    await picker().fill('TEST-1'); await get('Select shown').click(); assert.ok(await quantities().count() > 0);
    await picker().fill(''); await get('Select all').click(); assert.equal(await quantities().count(), 17);
    await get('Clear').click(); assert.equal(await quantities().count(), 0); await get('Select all').click();
    await source().selectOption('north'); assert.equal(await quantities().count(), 0); assert.equal(await destination().inputValue(), '');
    await destination().selectOption('east'); await get('Select all').click(); assert.equal(await quantities().count(), 3);
    await quantities().first().fill('99'); assert.equal(await quantities().first().inputValue(), '4', 'source quantity cap');
    await quantities().first().fill('3'); await page.getByRole('button', { name: 'Remove Linen shirt', exact: true }).first().click(); assert.equal(await quantities().count(), 2);
    await get('Reference / Note (Optional)').click(); await note().fill('TEST ONLY retained note');
    await get('Reference / Note (Optional)').click(); assert.equal(await note().isVisible(), false);
    await get('Reference / Note (Optional)').click(); assert.equal(await note().inputValue(), 'TEST ONLY retained note');
    await quantities().first().fill('1.5'); await get('Create Draft').click(); assert.equal((await calls()).length, 0, 'native fractional validation'); await quantities().first().fill('2');
    await page.evaluate(() => { window.transferFixture.fail = true; }); await get('Create Draft').click();
    await page.getByText('Fixture draft rejected', { exact: true }).waitFor();
    assert.equal(await quantities().count(), 2); assert.equal(await note().inputValue(), 'TEST ONLY retained note');
    await page.evaluate(() => { window.transferFixture.hold = true; }); await get('Create Draft').click(); await get('Creating Draft...').waitFor();
    for (const button of ['Creating Draft...', 'Cancel', 'Close dialog']) assert.equal(await get(button).isDisabled(), true);
    await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 1);
    await cls('draftForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal((await calls()).length, 2, 'pending duplicate prevented');
    const payload = (await calls())[1].payload;
    assert.equal(payload.sourceLocationId, 'north'); assert.equal(payload.destinationLocationId, 'east'); assert.equal(payload.note, 'TEST ONLY retained note'); assert.equal(JSON.parse(payload.itemsJson).length, 2);
    await page.evaluate(() => window.transferFixture.release()); await dialog().waitFor({ state: 'hidden' }); assert.equal(await cls('listingBar').count(), 1);
    check('source stock, product/size/color/SKU search, multiselect/Clear/remove, quantity caps and validation, retained optional note, failed/pending draft protection and payload');

    await load(); await get('New Transfer').click(); await source().selectOption('central'); await get('Select all').click();
    await get('Reference / Note (Optional)').click(); await note().fill('Clear this fixture'); await get('Clear All').click();
    assert.equal(await source().inputValue(), ''); assert.equal(await quantities().count(), 0); assert.equal(await note().inputValue(), ''); assert.equal(await get('Create Draft').isDisabled(), true); await get('Cancel').click();
    await cls('listing').getByRole('button', { name: /TR-TEST-001/ }).click(); await page.getByRole('button', { name: 'Draft transfer actions' }).click(); await get('Edit').click();
    await page.getByRole('dialog', { name: 'Edit Draft Transfer', exact: true }).waitFor(); assert.equal(await quantities().count(), 2);
    await get('Save Draft').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await calls())[0].action, 'update'); assert.equal((await calls())[0].payload.transferId, 'transfer-0');
    check('Clear All resets fields; draft editing preserves update action and transfer identity');

    for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
      await page.setViewportSize({ width, height }); await load('long&lang=km');
      await cls('listingBar').locator('button').click(); await source().selectOption('central'); await destination().selectOption('north');
      await noOverflow(name + ' long Khmer'); assert.ok((await cls('branchName').first().innerText()).includes('TENH Central'));
      assert.ok((await page.getByRole('dialog').innerText()).includes('សាខា')); await shot(name + '-khmer-long-branches');
    }
    check('long English/Khmer branch names stay readable without clipping');
    await page.setViewportSize({ width: 390, height: 844 }); await load(); await get('New Transfer').click();
    await source().selectOption('central'); await destination().selectOption('north'); await get('Select all').click(); await get('Reference / Note (Optional)').click();
    await page.setViewportSize({ width: 390, height: 430 }); await note().focus(); await note().fill('Keyboard fixture');
    await assertFooter('keyboard viewport'); await noOverflow('keyboard');
    const focused = await note().boundingBox(), footer = await cls('draftActions').boundingBox();
    assert.ok(focused.y + focused.height <= footer.y, 'focused note above footer'); await shot('phone-keyboard');
    await picker().focus(); await picker().fill('TEST-0'); await picker().scrollIntoViewIfNeeded();
    const searchBox = await picker().boundingBox(), scroll = await cls('draftScroll').boundingBox();
    assert.ok(searchBox.y >= scroll.y && searchBox.y + searchBox.height <= scroll.y + scroll.height, 'focused picker visible');
    check('reduced keyboard viewport keeps focused fields and bottom actions visible');
    await page.setViewportSize({ width: 390, height: 844 }); await note().focus();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 430 });
      Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, get: () => 25 });
      window.visualViewport.dispatchEvent(new Event('resize')); window.visualViewport.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(120); await assertFooter('visual viewport');
    const viewportDialog = await dialog().boundingBox(), viewportFooter = await cls('draftActions').boundingBox();
    assert.ok(viewportDialog.y + viewportDialog.height <= 455 && viewportFooter.y + viewportFooter.height <= 455, 'actions track visual viewport without layout resize');
    const viewportNote = await note().boundingBox(); assert.ok(viewportNote.y + viewportNote.height <= viewportFooter.y, 'visual viewport focus stays clear of actions');
    await page.screenshot({ path: path.join(output, 'phone-visual-viewport-keyboard.png'), clip: { x: 0, y: 25, width: 390, height: 430 } });
    check('iOS-style visual viewport height/offset changes keep focused note and action area above keyboard');
    for (const [width, height] of [[320, 568], [768, 1024], [1024, 768]]) {
      await page.setViewportSize({ width, height }); await load('empty'); await noOverflow('edge ' + width);
      await get('New Transfer').click(); await noOverflow('edge dialog ' + width); await assertFooter('edge ' + width);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await load('theme=dark'); await get('New Transfer').click(); await noOverflow('dark'); await shot('phone-dark');
    await page.evaluate(() => document.documentElement.style.setProperty('--app-accent', '#9333ea'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.stock-transfers-responsive-draftActions button[type=submit]')).backgroundColor === 'rgb(147, 51, 234)');
    assert.equal(await get('Create Draft').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(147, 51, 234)');
    check('320/768/1024 edge widths, dark theme and Settings accent');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ checks, desktopComparisons, externalRequests: 0, browserErrors: errors }, null, 2));
  } finally {
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
