// Isolated real-component browser checks. No Next server, credentials, SQL, or financial requests.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node fixture harness uses CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const sharp = require('sharp');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.env.TENH_BROWSER_MODULES || path.join(path.dirname(__dirname), 'node_modules')],
}));
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures/fashion-responsive.tsx');
const output = path.join(root, 'docs/evidence/fashion-responsive-20261010');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-fashion-fixture-'));
const checks = [];
function check(name) { checks.push(name); console.log('PASS ' + name); }
const baseline=process.argv.includes('--baseline');
const baselineDirectory=process.env.TENH_FASHION_BASELINE;
const loader = path.join(temp, 'loader.cjs');
fs.writeFileSync(loader, `
const ts = require(${JSON.stringify(require.resolve('typescript'))});
module.exports = function(source) {
  if (${baseline} && ['variant-product-form.tsx','add-product-modal.tsx','add-clothing-style-modal.tsx'].includes(require('node:path').basename(this.resourcePath))) source=require('node:fs').readFileSync(require('node:path').join(${JSON.stringify(baselineDirectory)},require('node:path').basename(this.resourcePath)),'utf8');
  if (this.resourcePath.endsWith('.css')) {
    const names = [...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m => m[1]);
    return 'module.exports = ' + JSON.stringify(Object.fromEntries(names.map(n => [n, require('node:path').basename(this.resourcePath,'.module.css') + '-' + n])));
  }
  return ts.transpileModule(source, {fileName:this.resourcePath,compilerOptions:{
    target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX
  }}).outputText;
};
`);
const dynamic=path.join(temp,'dynamic.js');
fs.writeFileSync(dynamic, `const React=require(${JSON.stringify(require.resolve('react'))});module.exports=(load,options)=>{const Component=React.lazy(load);return props=>React.createElement(React.Suspense,{fallback:React.createElement(options.loading)},React.createElement(Component,props));};`);
async function build() {
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development', devtool: false, context: root, entry: fixture,
      output: { path: temp, filename: 'fixture.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root, 'next/navigation$': fixture, 'sonner$': fixture, 'next/dynamic$': dynamic } },
      module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] },
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) }), new webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
        if (resource.context.endsWith(path.join('dashboard', 'products'))) resource.request = fixture;
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
  const cssFiles = ['components/date-range-filter.module.css', 'app/(dashboard)/dashboard/products/fashion-responsive.module.css', 'app/(dashboard)/dashboard/products/quick-fashion.module.css'].filter(file => fs.existsSync(path.join(root,file)));
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
    const button=name=>page.getByRole('button',{name,exact:true}).filter({visible:true});
    const modal=()=>page.getByRole('dialog');
    const form=()=>modal().locator('form');
    const footer=()=>form().locator('.fashion-responsive-footer');
    async function load(extra='') {await page.goto(url+'/?'+extra);await page.locator('.workspace-content > button').click();await form().locator('[name=variants]').waitFor({state:'attached'});}
    const screenshot=async name=>page.screenshot({path:path.join(output,name+'.png')});
    for(const mode of ['fashion','shoes','general']) {
      await page.setViewportSize({width:1440,height:1000});await load('mode='+mode);
      await screenshot((baseline?'baseline-':'')+'desktop-'+mode);
    }
    if(baseline)return;
    for(const mode of ['fashion','shoes','general']) {
      const original=path.join(output,'baseline-desktop-'+mode+'.png');
      if(fs.existsSync(original)) assert.deepEqual(await sharp(path.join(output,'desktop-'+mode+'.png')).raw().toBuffer(),await sharp(original).raw().toBuffer(),mode+': desktop pixels preserved');
    }
    check('desktop snapshots match Fashion, Shoes and General before edits');
    const editor=()=>form().locator('.fashion-responsive-variantEditor').filter({visible:true});
    const rows=()=>form().locator('.fashion-responsive-variantRow');
    const draft=async()=>JSON.parse(await form().locator('[name=variants]').inputValue());
    const tab=async name=>{const node=page.getByRole('tab',{name,exact:true});if(await node.isVisible())await node.click();};
    async function noOverflow(label) {
      const bounds=await modal().boundingBox();
      const result=await form().evaluate(node=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...node.querySelectorAll('button,input:not([type=hidden]):not([type=file]),select,textarea')].filter(el=>el.getClientRects().length).map(el=>({text:el.outerHTML.slice(0,90),left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,height:el.getBoundingClientRect().height}))}));
      assert.ok(result.scroll<=result.width,label+': page overflow');
      assert.deepEqual(result.controls.filter(control=>control.left<bounds.x-1||control.right>bounds.x+bounds.width+1),[],label+': clipped controls');
      assert.deepEqual(result.controls.filter(control=>control.height<43),[],label+': touch targets');
    }
    async function reservedFooter(height) {
      const save=await footer().boundingBox(),body=await form().locator('.fashion-responsive-formBody').boundingBox();
      assert.ok(save&&save.y>=0&&save.y+save.height<=height+1,'footer inside visible viewport');
      assert.ok(body.y+body.height<=save.y+1,'body reserves footer space');
    }
    async function quickRun(sizes=['S','M','L','XL','XXL']) {
      await tab('Variants');
      if(await button('Quick fashion size run').getAttribute('aria-expanded')!=='true')await button('Quick fashion size run').click();
      const quick=form().locator('.fashion-responsive-quickFields');
      for(const [name,value] of [['Colour','Navy'],['SKU prefix','QA TEE'],['Cost price','2.25'],['Selling price','7.50'],['Initial stock per size','4']]) await quick.getByLabel(name,{exact:true}).fill(value);
      for(const size of sizes)await form().locator('#fashion-size-chips').getByRole('button',{name:size,exact:true}).click();
      assert.equal(await page.evaluate(()=>window.fashionFixture.calls.length),0,'Quick Add never saves');
      assert.match(await form().locator('.fashion-responsive-selectedUnits').innerText(),new RegExp(sizes.length+' sizes selected · '+sizes.length*4+' units'));
      await button('Add '+sizes.length+' sizes').click();
    }
    const image=await sharp({create:{width:32,height:48,channels:3,background:'#8b5cf6'}}).png().toBuffer();
    const upload=(name='fixture.png')=>({name,mimeType:'image/png',buffer:image});
    for(const [name,width,height] of [['phone',390,844],['phone-landscape',844,390],['tablet',768,1024],['tablet-landscape',1024,768],['small-phone',320,568]]) {
      await page.setViewportSize({width,height});await load();await noOverflow(name+' Details');await reservedFooter(height);
      await form().locator('[name=name]').fill('Fixture Style');await form().locator('[name=categoryId]').selectOption('fixture-category');await form().locator('[name=description]').fill('Draft description retained');
      await tab('Photos');await noOverflow(name+' Photos');await tab('Variants');
      await button('Quick fashion size run').click();await noOverflow(name+' Quick Add');
      if(name==='phone')await screenshot('phone-quick');
      assert.equal((await draft()).length,1);
      await quickRun();assert.equal((await draft()).length,5);
      if(width<768||height<=500)assert.ok(Math.abs((await form().locator('.fashion-responsive-variants').boundingBox()).width-(await form().locator('.fashion-responsive-quickRun').boundingBox()).width)<2,'phone cards fill the form width');
      assert.deepEqual((await draft()).map(row=>row.sku),['QA-TEE-NAVY-S','QA-TEE-NAVY-M','QA-TEE-NAVY-L','QA-TEE-NAVY-XL','QA-TEE-NAVY-XXL']);
      await reservedFooter(height);await noOverflow(name+' five variants');await screenshot(name+'-five-variants');
      await editor().locator('[data-field=sellingPrice]').fill('9.25');await rows().nth(1).locator(':scope > button').click();await rows().first().locator(':scope > button').click();
      assert.equal(await editor().locator('[data-field=sellingPrice]').inputValue(),'9.25');
      await rows().first().locator(':scope > button').click();await rows().first().locator(':scope > button').click();
      assert.equal(await editor().locator('[data-field=sellingPrice]').inputValue(),'9.25','collapse retains edits');
      await tab('Details');assert.equal(await form().locator('[name=name]').inputValue(),'Fixture Style');assert.equal(await form().locator('[name=description]').inputValue(),'Draft description retained');assert.equal(await form().locator('[name=categoryId]').inputValue(),'fixture-category');
      if(width>=768&&height>500){const list=await form().locator('.fashion-responsive-variantList').boundingBox(),detail=await editor().boundingBox();assert.ok(detail.x>list.x,'tablet list left/editor right');}
      check(name+': tabs, five variants, edits, collapse, footer, inputs and overflow');
    }
    await page.setViewportSize({width:390,height:844});await load();await tab('Variants');await button('Quick fashion size run').click();
    await form().locator('#fashion-size-chips').getByRole('button',{name:'S',exact:true}).click();assert.equal((await draft()).length,1,'size chips alone do not add');
    await page.getByRole('tab',{name:'Women 24 – 32',exact:true}).click();assert.equal((await draft()).length,1);assert.equal(await button('Add 0 sizes').isDisabled(),true);
    await page.getByRole('tab',{name:'XS – XXL',exact:true}).click();
    await form().locator('[name=runImage_initial-run]').setInputFiles(upload('run.png'));
    await quickRun();
    const shared=(await draft())[0].imageSlot;assert.ok((await draft()).every(row=>row.imageSlot===shared));
    await editor().locator('input[type=file]').setInputFiles(upload('single-size.png'));
    const changed=(await draft())[0].imageSlot;assert.notEqual(changed,shared);assert.ok((await draft()).slice(1).every(row=>row.imageSlot===shared));
    await editor().locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
    assert.equal((await draft())[0].imageSlot,changed);
    await editor().locator('input[type=file]').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});
    assert.equal((await draft())[0].imageSlot,changed);
    await button('Add Size').click();assert.equal((await draft()).length,6);
    for(const [field,value] of [['size','3XL'],['color','Navy'],['sku','QA-TEE-NAVY-3XL'],['barcode','000123456789'],['costPrice','2.25'],['sellingPrice','7.50'],['stockQuantity','4'],['lowStockQuantity','3']])await editor().locator('[data-field='+field+']').fill(value);
    await button('Actions').click();await button('Generate missing barcodes').click();
    assert.equal((await draft())[5].barcode,'000123456789');assert.ok((await draft()).slice(0,5).every(row=>row.barcode));
    await rows().first().locator(':scope > button').click();await editor().getByRole('button',{name:'Remove variant',exact:true}).click();assert.equal((await draft()).length,5);
    await button('Actions').click();page.once('dialog',dialog=>dialog.dismiss());await button('Delete All').click();assert.equal((await draft()).length,5,'Delete All cancel preserves draft');
    await button('Actions').click();page.once('dialog',dialog=>dialog.accept());await button('Delete All').click();assert.equal((await draft()).length,0);assert.equal(await button('Create Style & Inventory').isDisabled(),true);
    await button('Add Size').click();assert.equal(await editor().getByRole('button',{name:'Remove variant',exact:true}).isDisabled(),true);
    check('presets, explicit Add, shared/individual images, types/5 MB, six variants, barcodes and removal safeguards');

    await load();await tab('Photos');
    const gallery=()=>form().locator('[data-section=photos]');
    const addPhotos=()=>gallery().locator('label').filter({hasText:'Add photos'}).locator('input[type=file]');
    await addPhotos().setInputFiles(Array.from({length:9},(_,i)=>upload('too-many-'+i+'.png')));assert.equal(await gallery().locator('img').count(),0);
    await addPhotos().setInputFiles(Array.from({length:8},(_,i)=>upload('gallery-'+i+'.png')));await page.waitForFunction(()=>document.querySelectorAll('[data-section=photos] img').length===8);
    const beforeGallery=JSON.parse(await form().locator('[name=productGallery]').inputValue());
    await gallery().getByRole('button',{name:'Make cover',exact:true}).first().click();
    assert.equal(JSON.parse(await form().locator('[name=productGallery]').inputValue())[0].slot,beforeGallery[1].slot,'first-photo cover order preserved');
    await gallery().getByRole('button',{name:'Remove image',exact:true}).last().click();assert.equal(await gallery().locator('img').count(),7);
    await gallery().locator('label[title="Replace image"]').first().locator('input').setInputFiles(upload('replace-cover.png'));
    await page.waitForFunction(()=>document.querySelectorAll('[data-section=photos] img').length===7&&!document.querySelector('[data-section=photos] fieldset').disabled);
    await noOverflow('seven photos');await screenshot('phone-gallery');
    await tab('Details');await form().locator('[name=name]').fill('Fixture Complete Style');await form().locator('[name=locationId]').selectOption('fixture-other');await form().locator('[name=categoryId]').selectOption('fixture-category');await form().locator('[name=description]').fill('Fixture description survives save failure');
    await quickRun();await tab('Photos');assert.equal(await gallery().locator('img').count(),7);await tab('Details');
    const invalid=(await draft())[3];await tab('Variants');await rows().nth(3).locator(':scope > button').click();await editor().locator('[data-field=sku]').fill('');await tab('Details');
    await button('Create Style & Inventory').click();assert.equal(await page.evaluate(()=>window.fashionFixture.calls.length),0);
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-field')==='sku');assert.equal(await editor().getAttribute('data-editor-id'),(await draft())[3]&&(await rows().nth(3).locator('[data-editor-id]').getAttribute('data-editor-id')));
    assert.ok(await form().getByRole('alert').isVisible());assert.equal(await page.getByRole('tab',{name:'Variants',exact:true}).getAttribute('aria-selected'),'true');
    await editor().locator('[data-field=sku]').fill(invalid.sku);await page.waitForTimeout(100);assert.equal((await draft())[3].sku,invalid.sku,'SKU repaired after validation');await tab('Details');await form().locator('[name=name]').fill('');await tab('Variants');
    await button('Create Style & Inventory').click();await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='name');assert.equal(await page.getByRole('tab',{name:'Details',exact:true}).getAttribute('aria-selected'),'true');
    await form().locator('[name=name]').fill('Fixture Complete Style');await page.waitForTimeout(100);assert.equal(await form().locator('[name=name]').inputValue(),'Fixture Complete Style','name repaired after validation');
    await page.evaluate(()=>{window.fashionFixture.hold=true;window.fashionFixture.message='SKU QA-TEE-NAVY-L is already in use.';});
    assert.deepEqual(await form().evaluate(node=>Array.from(node.elements).filter(field=>field.willValidate&&!field.validity.valid).map(field=>({name:field.name,field:field.dataset.field,value:field.value,message:field.validationMessage}))),[], 'complete draft is valid');
    await button('Create Style & Inventory').click();await page.waitForFunction(()=>window.fashionFixture.calls.length===1);
    assert.equal(await button('Creating...').isDisabled(),true);assert.equal(await form().locator('.fashion-responsive-formBody').getAttribute('inert'),'');await reservedFooter(844);await screenshot('save-loading');
    const payload=await page.evaluate(()=>{const data=window.fashionFixture.calls[0];return {name:data.get('name'),branch:data.get('locationId'),category:data.get('categoryId'),description:data.get('description'),variants:JSON.parse(data.get('variants')),gallery:JSON.parse(data.get('productGallery')),files:[...data.values()].filter(value=>value instanceof File&&value.size>0).length};});
    assert.equal(payload.variants.length,5);assert.equal(payload.gallery.length,7);assert.equal(payload.files,7);assert.equal(payload.branch,'fixture-other');assert.equal(payload.category,'fixture-category');assert.equal(payload.description,'Fixture description survives save failure');
    await page.evaluate(()=>window.fashionFixture.release());await form().getByRole('alert').waitFor();await screenshot('save-error');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-field')==='sku');
    assert.equal(await editor().locator('[data-field=sku]').inputValue(),'QA-TEE-NAVY-L');assert.equal(await form().locator('[name=description]').inputValue(),'Fixture description survives save failure');assert.equal(await form().locator('[name=categoryId]').inputValue(),'fixture-category');assert.equal(await form().locator('[name=locationId]').inputValue(),'fixture-other');await screenshot('save-error');
    await page.evaluate(()=>{window.fashionFixture.hold=false;window.fashionFixture.message='';});await button('Create Style & Inventory').click();await page.waitForFunction(()=>window.fashionFixture.refreshes===1);assert.equal(await modal().count(),0);
    check('gallery limit/cover/replace, mounted draft images, validation tab/row/focus, complete payload, pending, failure retention and mock success');

    for(const [name,width,height] of [['khmer-phone',390,844],['khmer-tablet',768,1024],['khmer-landscape',1024,768]]) {
      await page.setViewportSize({width,height});await page.goto(url+'/?lang=km');await page.locator('.workspace-content > button').click();await form().locator('[name=variants]').waitFor({state:'attached'});
      const variantTab=page.locator('#fashion-tab-variants');if(await variantTab.isVisible())await variantTab.click();
      await form().locator('.fashion-responsive-quickToggle').click();await noOverflow(name+' Quick');
      assert.equal(await form().locator('button[type=submit]').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(162, 28, 175)');
      await form().locator('#fashion-size-chips button').nth(1).click();await form().locator('.fashion-responsive-quickSummary button').click();await noOverflow(name+' editor');await reservedFooter(height);await screenshot(name);
      check(name+': Khmer, paired fields and Settings accent');
    }
    for(const [name,width,height,visibleHeight] of [['keyboard-phone',390,844,360],['keyboard-landscape',844,390,220],['keyboard-khmer',390,844,300]]) {
      await page.setViewportSize({width,height});await load(name==='keyboard-khmer'?'lang=km':'');
      if(name==='keyboard-khmer') {await page.locator('#fashion-tab-variants').click();await form().locator('.fashion-responsive-quickToggle').click();await form().locator('#fashion-size-chips button').nth(1).click();await form().locator('.fashion-responsive-quickSummary button').click();} else await quickRun();
      await page.evaluate(visibleHeight=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:visibleHeight});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:60});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));},visibleHeight);
      await editor().locator('[data-field=sku]').focus();
      const save=await footer().boundingBox(),field=await editor().locator('[data-field=sku]').boundingBox();
      assert.ok(save.y+save.height<=visibleHeight+61,name+': Save follows keyboard viewport');assert.ok(field.y>=72&&field.y+field.height<=save.y+1,name+': focused field above Save');await screenshot(name);check(name+': simulated keyboard resize/pan and focus');
    }
    await page.setViewportSize({width:768,height:1024});await load('legacy=1');await quickRun();await noOverflow('legacy Fashion modal');await reservedFooter(1024);check('alternate Fashion modal uses the same responsive draft');
    const touch=await page.context().newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await page.setViewportSize({width:1366,height:1024});await load();assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true);
    await quickRun();await noOverflow('large touch tablet');await reservedFooter(1024);assert.equal(await form().locator('.fashion-responsive-compactVariants').isVisible(),true);await screenshot('large-touch-tablet');check('1366 px touch tablet keeps the responsive list/editor');await touch.detach();
    assert.deepEqual(errors,[]);
  } finally {if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
