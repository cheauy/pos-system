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
const fixture = path.join(__dirname, 'fixtures/expenses-responsive.tsx');
const output = path.join(root, 'docs/evidence/expenses-responsive-20261010');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-expense-fixture-'));
const checks = [];
function check(name) { checks.push(name); console.log('PASS ' + name); }
const loader = path.join(temp, 'loader.cjs');
fs.writeFileSync(loader, `
const ts = require(${JSON.stringify(require.resolve('typescript'))});
module.exports = function(source) {
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
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/navigation$': fixture } },
      module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] },
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }), new webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
        if (resource.context.endsWith(path.join('dashboard', 'expenses'))) resource.request = fixture;
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
  const cssFiles = ['components/date-range-filter.module.css', 'app/(dashboard)/dashboard/expenses/expenses-responsive.module.css'].filter(file => fs.existsSync(path.join(root,file)));
  const local = cssFiles.map(file => fs.readFileSync(path.join(root,file),'utf8').replace(/\.([a-zA-Z][\w-]*)/g,'.' + path.basename(file,'.module.css') + '-$1')).join('\n');
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
      if(req.url.startsWith('/shirt.svg')) {res.setHeader('Content-Type','image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" fill="#f1f5f9"/><path d="M26 16L12 28l10 12 6-4v31h24V36l6 4 10-12-14-12-9 5H35z" fill="#334155"/></svg>');return;}
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
    const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
    const add = () => page.locator('.expenses-responsive-popup[role="dialog"]:has([name=amount])');
    const overview = () => page.locator('.expenses-responsive-popup[role="dialog"]:has(.expenses-responsive-doughnut)');
    const filter = () => page.getByRole('dialog', { name: 'Filter Expenses', exact: true });
    const load = async (lang = 'en', extra = '') => { await page.goto(url + '/?lang=' + lang + extra); await page.locator('main').waitFor(); };
    const screenshot = async name => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    async function noOverflow(label) {
      const result = await page.evaluate(() => {
        const scope = document.querySelector('[role="dialog"][aria-modal="true"]') || document.querySelector('main');
        return { width: innerWidth, scroll: document.documentElement.scrollWidth, clipped: [...scope.querySelectorAll('input, select, button, summary')].filter(el => el.getClientRects().length).filter(el => { const r=el.getBoundingClientRect();return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.outerHTML.slice(0,120)) };
      });
      assert.ok(result.scroll <= result.width, label + ': page overflow');
      assert.deepEqual(result.clipped, [], label + ': clipped controls');
    }
    async function footerVisible(height) {
      const footer=await add().locator('.expenses-responsive-saveArea').boundingBox();
      assert.ok(footer && footer.y>=0 && footer.y+footer.height <= height+1, 'Save area inside visible viewport');
      const body=await add().locator('.expenses-responsive-formBody').boundingBox();
      assert.ok(body.y+body.height <= footer.y+1, 'Save reserves space below fields');
    }
    for (const [name,width,height] of [['phone',390,844],['phone-landscape',844,390],['tablet',768,1024],['tablet-landscape',1024,768],['small-phone',320,568]]) {
      await page.setViewportSize({width,height});await load();
      assert.equal(await page.locator('.expenses-responsive-compactToolbar').isVisible(),true);
      await noOverflow(name+' page');
      await button('Add expense').click();
      assert.equal(await add().locator('details').getAttribute('open'),null);
      assert.equal(await add().locator('[name=payee]').isVisible(),false);
      await footerVisible(height);await noOverflow(name+' Add');await screenshot(name+'-add');
      const amount=await add().locator('[name=amount]').boundingBox(),date=await add().locator('[name=expenseDate]').boundingBox();
      if(width===390) assert.ok(Math.abs(amount.y-date.y)<2, 'phone Amount and Date share a row');
      if(width>=600) {
        const branch=await add().locator('[name=locationId]').boundingBox();
        assert.ok(amount.x>branch.x && Math.abs(amount.y-branch.y)<2, 'tablet has two columns');
      }
      await add().locator('summary').click();await add().locator('[name=reference]').fill('TEST-ONLY');
      await footerVisible(height);await noOverflow(name+' optional fields');
      await page.keyboard.press('Escape');
      await button('Expense overview').click();await noOverflow(name+' overview');
      assert.match(await overview().locator('.expenses-responsive-doughnut').innerText(),/\$101.25/);
      assert.match(await overview().locator('.expenses-responsive-selectedTotal').innerText(),/Selected Period/);
      await screenshot(name+'-overview');await page.keyboard.press('Escape');
      check(name+': compact form, details, selected-period chart, footer and overflow');
    }
    await page.setViewportSize({width:390,height:844});await load();
    await button('Filter').click();
    await filter().getByRole('combobox',{name:'Filter by category'}).selectOption('Rent');
    await filter().getByLabel('Start date').fill('2026-10-11');
    assert.equal(await filter().getByRole('button',{name:'Apply',exact:true}).isDisabled(),true);
    assert.ok(await filter().getByRole('alert').isVisible());
    await screenshot('filter-invalid');
    await filter().getByLabel('Start date').fill('2026-10-10');
    await page.evaluate(()=>{
      window.expenseLoadingSnapshots=[];
      new MutationObserver(()=>{
        if(!document.querySelector('.date-range-filter-wrapper[aria-busy="true"]'))return;
        window.expenseLoadingSnapshots.push({
          popup:!!document.querySelector('[role="dialog"][aria-modal="true"]'),
          skeletons:[...document.querySelectorAll('.date-range-filter-skeleton')].filter(el=>el.getClientRects().length).length,
          formHidden:getComputedStyle(document.querySelector('.expenses-responsive-formBody')).display==='none',
          mainBusy:document.querySelector('main').getAttribute('aria-busy'),
        });
      }).observe(document.querySelector('main'),{subtree:true,attributes:true,attributeFilter:['aria-busy']});
    });
    await filter().getByRole('button',{name:'Apply',exact:true}).click();
    assert.equal(await filter().count(),0);
    const loading=await page.evaluate(()=>window.expenseLoadingSnapshots);
    assert.ok(loading.some(state=>!state.popup&&state.skeletons===1&&!state.formHidden&&!state.mainBusy),'valid Apply closes popup and scopes loading to affected content');
    assert.match(await page.locator('main').innerText(),/No expenses match/);
    await button('Expense overview').click();
    assert.match(await overview().locator('.expenses-responsive-doughnut').innerText(),/\$21.25/);
    await overview().getByRole('combobox',{name:'Filter expenses by branch'}).selectOption('branch-b');
    assert.match(await overview().locator('.expenses-responsive-doughnut').innerText(),/\$900.00/);
    await page.keyboard.press('Escape');check('filter drafts, invalid validation, valid close, branch isolation and selected-period totals');

    await load();await button('Add expense').click();
    await add().getByRole('button',{name:'Save Expense',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.expenseFixture.calls.length),0,'required fields prevent Save');
    await add().locator('[name=category]').selectOption('Rent');
    await add().locator('[name=description]').fill('Fixture only');
    await add().locator('[name=amount]').fill('0');
    await add().getByRole('button',{name:'Save Expense',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.expenseFixture.calls.length),0,'invalid amount prevents Save');
    await add().locator('[name=amount]').fill('21.25');
    await add().locator('summary').click();
    await add().locator('[name=payee]').fill('Fixture vendor');
    await add().locator('[name=reference]').fill('TEST-RECEIPT');
    await add().locator('summary').click();
    const receipt=add().locator('[name=receipt]');
    assert.equal(await receipt.getAttribute('accept'),'image/jpeg,image/png,application/pdf');
    await receipt.setInputFiles({name:'large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(5*1024*1024+1)});
    assert.match(await receipt.evaluate(el=>el.validationMessage),/5 MB/);
    await add().getByRole('button',{name:'Save Expense',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.expenseFixture.calls.length),0,'oversize upload prevents Save');
    for(const [name,mimeType] of [['receipt.jpg','image/jpeg'],['receipt.png','image/png'],['receipt.pdf','application/pdf']]) {
      await receipt.setInputFiles({name,mimeType,buffer:Buffer.from('isolated UI fixture')});
      assert.equal(await receipt.evaluate(el=>el.validity.valid),true);
    }
    await receipt.setInputFiles({name:'limit.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(5*1024*1024)});
    assert.equal(await receipt.evaluate(el=>el.validity.valid),true,'exact 5 MB accepted');
    await receipt.setInputFiles([]);
    await page.evaluate(()=>{window.expenseFixture.hold=true;window.expenseFixture.fail=true;});
    await add().getByRole('button',{name:'Save Expense',exact:true}).click();
    await page.waitForFunction(()=>window.expenseFixture.calls.length===1);
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries([...window.expenseFixture.calls[0].entries()].filter(([name])=>name!=='receipt'))),{
      locationId:'branch-a',category:'Rent',description:'Fixture only',amount:'21.25',expenseDate:'2026-10-10',paymentMethod:'cash',payee:'Fixture vendor',reference:'TEST-RECEIPT',
    },'collapsed optional fields preserve the existing save payload');
    assert.equal(await add().getByRole('button',{name:'Please wait…',exact:true}).isDisabled(),true);
    assert.equal(await add().getByRole('button',{name:'Close add expense',exact:true}).isDisabled(),true);
    await page.keyboard.press('Escape');assert.equal(await add().count(),1,'pending Save stays open');
    await footerVisible(844);await screenshot('save-loading');
    await page.evaluate(()=>window.expenseFixture.release());
    await add().getByRole('alert').waitFor();
    assert.match(await add().getByRole('alert').innerText(),/Unable to save/);
    assert.equal(await add().locator('[name=description]').inputValue(),'Fixture only');
    await footerVisible(844);await screenshot('save-error');
    await page.evaluate(()=>{window.expenseFixture.hold=false;window.expenseFixture.fail=false;});
    await add().getByRole('button',{name:'Save Expense',exact:true}).click();
    await page.waitForFunction(()=>window.expenseFixture.calls.length===2);
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"][aria-label="Add expense"][aria-modal="true"]'));
    check('required validation, amount validation, receipt types/5 MB, Save loading, error retention and mock success');

    await load();await button('Add expense').click();
    await page.evaluate(()=>{
      const viewport=window.visualViewport;
      Object.defineProperty(viewport,'height',{configurable:true,value:340});
      Object.defineProperty(viewport,'offsetTop',{configurable:true,value:100});
      viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));
    });
    const save=await add().locator('.expenses-responsive-saveArea').boundingBox();
    assert.ok(save.y>=100 && save.y+save.height<=441,'Save follows visual viewport keyboard resize and pan');
    await add().locator('summary').click();await add().locator('[name=reference]').focus();
    const reference=await add().locator('[name=reference]').boundingBox();
    assert.ok(reference.y+reference.height <= save.y+1,'focused field scrolls above Save');
    await screenshot('keyboard-simulated');
    await add().locator('button[aria-label="Close add expense"]').focus();await page.keyboard.press('Shift+Tab');
    assert.match(await page.evaluate(()=>document.activeElement.textContent),/Save Expense/);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Close add expense');
    check('simulated visual viewport keyboard, focused field visibility and focus trap');

    for(const [name,width,height] of [['khmer-phone',390,844],['khmer-tablet',768,1024],['khmer-landscape',1024,768]]) {
      await page.setViewportSize({width,height});await load('km');
      await page.locator('.expenses-responsive-launchers button').last().click();
      await noOverflow(name);await footerVisible(height);
      assert.equal(await add().locator('summary').innerText(), 'ព័ត៌មានបន្ថែម (មិនបាច់បំពេញ)');
      const color=await add().locator('button[type=submit]').evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(color,'rgb(162, 28, 175)','Save uses configured accent');
      await screenshot(name+'-add');await page.keyboard.press('Escape');
      await page.locator('.expenses-responsive-launchers button').first().click();
      await noOverflow(name+' overview');await screenshot(name+'-overview');
      check(name+': translations, long branch text and Settings accent');
    }
    await page.setViewportSize({width:390,height:844});await load('en','&empty=1');
    await button('Expense overview').click();assert.match(await overview().innerText(),/No expenses in this period/);await noOverflow('empty overview');
    await page.keyboard.press('Escape');await load('en','&inactive=1');
    assert.equal(await button('Add expense').count(),0);check('empty overview and inactive branch restriction');
    await page.setViewportSize({width:1440,height:1000});await load();
    assert.equal(await page.locator('.expenses-responsive-compactToolbar').isVisible(),false);
    assert.equal(await page.locator('[name=payee]').isVisible(),true);
    assert.equal(await page.locator('[name=reference]').isVisible(),true);
    assert.equal(await page.locator('.expenses-responsive-popup').first().evaluate(el=>getComputedStyle(el).display),'contents');
    await screenshot('desktop-preserved');check('desktop inline layout and optional fields preserved');
    const touchPage=await browser.newPage({viewport:{width:1366,height:1024},hasTouch:true});
    await touchPage.goto(url);await touchPage.locator('main').waitFor();
    assert.equal(await touchPage.locator('.expenses-responsive-compactToolbar').isVisible(),true);
    await touchPage.getByRole('button',{name:'Add expense',exact:true}).click();
    const touchSave=await touchPage.locator('.expenses-responsive-saveArea').boundingBox();
    assert.ok(touchSave.y+touchSave.height<=1024,'large touch tablet footer visible');
    await touchPage.screenshot({path:path.join(output,'large-touch-tablet.png')});
    await touchPage.close();check('1366px touch tablet uses compact layout');
    assert.deepEqual(errors,[]);
  } finally {if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
