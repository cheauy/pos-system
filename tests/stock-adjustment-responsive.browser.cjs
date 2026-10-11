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
const fixture = path.join(__dirname, 'fixtures/stock-adjustment-responsive.tsx');
const output = path.join(root, 'docs/evidence/stock-adjustment-responsive-20261010');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-stock-fixture-'));
const checks = [];
const desktopComparisons = [];
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
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/navigation$': fixture, [path.join(root, 'app/(dashboard)/dashboard/workspace-branch-provider.tsx')]: fixture } },
      module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] },
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }), new webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
        if (resource.context.endsWith(path.join('inventory', 'adjustments'))) resource.request = fixture;
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
  const cssFiles = ['components/date-range-filter.module.css', 'app/(dashboard)/dashboard/inventory/adjustments/stock-adjustment-responsive.module.css'].filter(file => fs.existsSync(path.join(root,file)));
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
    const get = name => page.getByRole('button', { name, exact: true });
    async function load(state = 'multiple', lang = 'en') {
      await page.goto(url + '/?selection=' + state + '&lang=' + lang);
      await page.locator('main').waitFor();
    }
    async function calls() { return page.evaluate(() => window.stockFixture.calls); }
    async function screenshot(name, fullPage = true) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage }); }
    async function noOverflow(label) {
      const measurements = await page.evaluate(() => {
        const width = innerWidth;
        const visible = [...document.querySelectorAll('main button, main input, main select, main textarea, main summary')].filter(el => el.getClientRects().length);
        return {
          viewport: width, document: document.documentElement.scrollWidth,
          clipped: visible.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > width + 1; }).map(el => ({html:el.outerHTML.slice(0,120),rect:el.getBoundingClientRect().toJSON()})),
          smallTargets: visible.filter(el => el.getBoundingClientRect().height < 43).map(el => el.outerHTML.slice(0, 120)),
        };
      });
      assert.ok(measurements.document <= measurements.viewport, label + ' horizontal overflow');
      assert.deepEqual(measurements.clipped, [], label + ' clipped controls');
      assert.deepEqual(measurements.smallTargets, [], label + ' touch targets');
      return measurements;
    }
    for (const width of [1280,1440]) {
      await page.setViewportSize({width,height:1000});
      for (const state of ['multiple','single']) {
        await load(state);await page.waitForTimeout(200);const name='desktop-'+width+'-'+state;await screenshot(name);
        const before=await sharp(path.join(output,'baseline-'+name+'.png')).raw().toBuffer({resolveWithObject:true});
        const after=await sharp(path.join(output,name+'.png')).raw().toBuffer({resolveWithObject:true});
        assert.deepEqual(after.info,before.info);
        let changedPixels=0,maxRgbDifference=0;
        for(let pixel=0;pixel<after.data.length;pixel+=3){let changed=false;for(let channel=0;channel<3;channel++){const difference=Math.abs(after.data[pixel+channel]-before.data[pixel+channel]);maxRgbDifference=Math.max(maxRgbDifference,difference);changed ||= difference>0;}if(changed)changedPixels++;}
        // Chromium occasionally rounds a few shadow pixels by one RGB level.
        assert.ok(maxRgbDifference<=1 && changedPixels<=Math.ceil(after.info.width*after.info.height*.0001),name+' must retain the desktop baseline');
        desktopComparisons.push({name,changedPixels,maxRgbDifference});
        check(name+' unchanged');
      }
    }
    const ui='stock-adjustment-responsive-';
    const save=()=>page.locator('.'+ui+'actionBar button');
    const draft=()=>page.locator('[name=items]').inputValue().then(JSON.parse);
    const bulk=()=>page.getByRole('spinbutton',{name:'Quantity for all rows',exact:true});
    const apply=()=>page.getByRole('button',{name:/^Apply to selected/});
    const productRows=()=>page.locator('.'+ui+'selectedRows article');
    const optional=()=>get('Reference & notes (optional)');
    for (const [name,width,height] of [['mobile-portrait',390,844],['mobile-landscape',844,390],['tablet-portrait',820,1180],['tablet-landscape',1180,820]]) {
      await page.setViewportSize({width,height});await load();await page.waitForTimeout(100);
      await noOverflow(name);
      assert.equal(await page.locator('button[type=submit]:visible').count(),1);
      assert.equal(await page.locator('[name=reason]').isVisible(),true);
      assert.equal(await page.locator('[name=reference]').isVisible(),false);
      const panel=await page.locator('.'+ui+'productsPanel').boundingBox(), controls=await page.locator('.'+ui+'bulk').boundingBox();
      assert.ok(height<520||width<760 ? controls.y>=panel.y+panel.height : controls.x>=panel.x+panel.width,name+' stacking/columns');
      assert.ok((await page.locator('.'+ui+'actionBar').boundingBox()).y >= (await page.locator('form').boundingBox()).y + (await page.locator('form').boundingBox()).height,name+' action bar reserves space');
      await screenshot(name);
      for(const [mode,quantity,expected] of [['Increase','5',[52,23]],['Decrease','3',[44,15]],['Set exact','0',[0,0]]]) {
        await get(mode).click();await bulk().fill(quantity);
        const before=await draft();await apply().click();const after=await draft();
        assert.equal((await calls()).length,0,'Apply must never save');
        assert.notDeepEqual(after,before);
        assert.deepEqual(after.map(row=>row.mode==='set'?row.quantity:row.mode==='increase'?row.expectedQuantity+row.quantity:row.expectedQuantity-row.quantity),expected);
        assert.equal(await save().isDisabled(),false);
      }
      for(const value of ['', '1.5', '-1', '2147483648']){await bulk().fill(value);assert.equal(await apply().isDisabled(),true);}
      await get('Decrease').click();await bulk().fill('99');await apply().click();assert.equal(await save().isDisabled(),true);
      await get('Increase').click();await bulk().fill('5');await apply().click();
      await productRows().first().locator('summary').click();
      const qty=productRows().first().getByRole('spinbutton');
      for(const value of ['', '1.5', '-1', '2147483648']){await qty.fill(value);assert.equal(await save().isDisabled(),true);}
      await productRows().first().getByRole('combobox').selectOption('set');await qty.fill('9');
      assert.deepEqual((await draft()).map(row=>[row.mode,row.quantity]),[['set',9],['increase',5]]);
      await productRows().first().locator('summary').click();await productRows().first().locator('summary').click();assert.equal(await qty.inputValue(),'9');
      await productRows().last().locator('summary').click();await productRows().last().getByRole('combobox').selectOption('decrease');await productRows().last().getByRole('spinbutton').fill('3');await productRows().last().locator('summary').click();
      await optional().click();await page.locator('[name=reference]').fill('FIXTURE-REF');await page.locator('[name=notes]').fill('Counted shelf A');
      await optional().click();await optional().click();assert.equal(await page.locator('[name=reference]').inputValue(),'FIXTURE-REF');assert.equal(await page.locator('[name=notes]').inputValue(),'Counted shelf A');
      await page.locator('.'+ui+'pickerTrigger').click();const search=page.getByPlaceholder('Search by category, product name, colour, size, or SKU…');await noOverflow(name+' product picker');await search.fill('BAG-NAT');await search.press('Enter');await search.press('Escape');
      assert.equal((await draft()).length,3);assert.deepEqual((await draft()).slice(0,2).map(row=>[row.mode,row.quantity]),[['set',9],['decrease',3]]);
      await productRows().last().getByRole('button',{name:/^Remove/}).click();assert.equal((await draft()).length,2);
      await noOverflow(name+' expanded');await screenshot(name+'-editing');
      await page.evaluate(()=>{window.stockFixture.fail=true;});await save().click();await page.getByText('Fixture validation rejected',{exact:true}).waitFor();
      assert.equal((await draft())[0].quantity,9);assert.equal(await page.locator('[name=notes]').inputValue(),'Counted shelf A');
      await page.evaluate(()=>{window.stockFixture.hold=true;});
      await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
      await page.waitForFunction(()=>window.stockFixture.calls.length>=2);assert.equal((await calls()).length,2,'duplicate submission must be blocked');
      await page.evaluate(()=>{window.stockFixture.hold=false;window.stockFixture.release();});await page.getByText('Fixture batch saved',{exact:true}).waitFor();
      await page.waitForFunction(()=>JSON.parse(document.querySelector('[name=items]').value).length===0);
      assert.equal((await calls()).length,2);assert.equal(await page.locator('[name=notes]').inputValue(),'');assert.equal(await save().isDisabled(),true);
      const saved=(await calls())[1];assert.deepEqual(JSON.parse(saved.items).map(row=>[row.mode,row.quantity]),[['set',9],['decrease',3]]);assert.equal(saved.reference,'FIXTURE-REF');assert.equal(saved.notes,'Counted shelf A');
      check(name+' modes, individual drafts, selection, optional fields, validation, failed save and single batch saving');
    }
    await page.setViewportSize({width:390,height:844});await load();await optional().click();await page.locator('[name=notes]').fill('Keyboard draft');
    await page.setViewportSize({width:390,height:360});await page.locator('[name=notes]').focus();await page.locator('[name=notes]').scrollIntoViewIfNeeded();
    const keyboardField=await page.locator('[name=notes]').boundingBox(),bar=await page.locator('.'+ui+'actionBar').boundingBox();
    assert.ok(keyboardField.y>=0&&keyboardField.y+keyboardField.height<=360);assert.ok(bar.y>=keyboardField.y+keyboardField.height);await noOverflow('keyboard viewport');await screenshot('mobile-keyboard',false);
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('[name=notes]').inputValue(),'Keyboard draft');check('reduced keyboard viewport keeps focused notes clear and preserves draft');
    await page.evaluate(()=>{window.stockFixture.uncertain=true;});await save().click();await page.getByText('Save result could not be confirmed. Retry this same adjustment to check it safely.',{exact:true}).waitFor();
    const interrupted=(await calls())[0];assert.equal(await bulk().isDisabled(),true);await page.reload();await get('Retry / Check Adjustment').waitFor();assert.equal(await page.locator('[name=notes]').inputValue(),'Keyboard draft');assert.equal(await page.locator('[name=notes]').isVisible(),true);
    await get('Retry / Check Adjustment').click();await page.getByText('Fixture batch saved',{exact:true}).waitFor();assert.deepEqual((await calls())[0],interrupted);check('interrupted response survives reload and retries exact request identity/payload');
    for(const [width,height] of [[390,844],[820,1180],[1180,820]]) {
      await page.setViewportSize({width,height});await load();await get('Recent Adjustments').click();await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByRole('button',{name:'Close recent adjustments'}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true);
      await screenshot('recent-'+width);await noOverflow('history '+width);assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.equal(await get('Recent Adjustments').evaluate(el=>el===document.activeElement),true);
    }
    check('phone/tablet Recent Adjustments sheet scroll lock, controls and Escape');
    await page.setViewportSize({width:820,height:1180});await load('many');assert.equal((await draft()).length,21);
    const manyBulk=await page.locator('.'+ui+'bulk').boundingBox(),manyReason=await page.locator('.'+ui+'reasonFields').boundingBox();assert.ok(manyReason.y-manyBulk.y-manyBulk.height<=20,'many products cannot stretch control spacing');
    await productRows().last().locator('summary').click();await productRows().last().getByRole('spinbutton').fill('2');assert.equal((await draft()).at(-1).quantity,2);
    const focusedQty=await productRows().last().getByRole('spinbutton').boundingBox(),scrollArea=await page.locator('.'+ui+'selectedRows').boundingBox();assert.ok(focusedQty.y>=scrollArea.y&&focusedQty.y+focusedQty.height<=scrollArea.y+scrollArea.height,'focused item quantity cannot be clipped by the selection scroll area');
    await noOverflow('many selected items');await screenshot('tablet-many-selected');check('21 selected items scroll independently while controls remain compact');
    for(const [width,height] of [[320,568],[768,1024],[1024,768]]){await page.setViewportSize({width,height});await load();await noOverflow('edge width '+width);}
    for(const [width,height] of [[390,844],[820,1180]]){await page.setViewportSize({width,height});await load('multiple','km');await noOverflow('Khmer '+width);assert.ok((await page.locator('main').innerText()).includes('រក្សាទុក'));await screenshot('khmer-'+width);}
    await page.setViewportSize({width:390,height:844});await page.goto(url+'/?theme=dark');await page.locator('main').waitFor();await noOverflow('dark');await screenshot('mobile-dark');check('edge widths, Khmer translations and dark theme');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({checks,desktopComparisons,externalRequests:0,browserErrors:errors},null,2));
  } finally {if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
