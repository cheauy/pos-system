/* eslint-disable @typescript-eslint/no-require-imports -- Local fixture builder; all services are replaced. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const {webpack} = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-four-ui-'));
const printers = 'app/(dashboard)/dashboard/settings/printers', profile = 'app/(dashboard)/dashboard/settings/profile', notifications = 'app/(dashboard)/dashboard/notifications';
const write = (name, content) => {const file=path.join(temp,name); fs.writeFileSync(file,content); return file;};
const absolute = file => path.join(root,file).replaceAll('\\','/');
const mocks = write('mocks.tsx', `
import React from 'react';
const params=new URLSearchParams(location.search);
const record=(name,value)=>{const output=document.getElementById('fixture-result');output.textContent=JSON.stringify({name,value});};
const pause=async()=>{if(params.has('hold'))await new Promise(resolve=>setTimeout(resolve,3000));};
export const rows=Array.from({length:8},(_,i)=>({id:'fixture-'+i,notification_type:'low_stock',severity:i%2?'critical':'warning',title:i<2?'Low stock':params.get('lang')==='km'?'ស្តុកទាប':'Low stock',message:params.get('lang')==='km'?'ឈ្មោះផលិតផលសម្រាប់ធ្វើតេស្តអក្សរខ្មែរវែងដែលអាចអានបានច្បាស់នៅលើអេក្រង់ទូរសព្ទ':'Fixture product with a very long name and unique event '+i,href:'/dashboard/products?fixture='+i,occurred_at:i<4?'2026-10-11T03:00:00Z':'2026-10-10T03:00:00Z',is_active:i%3!==0}));
export function useRouter(){return {refresh(){record('refresh',null)},push(){}};}
export function usePathname(){return '/dashboard/settings/printers';}
export function redirect(){throw Error('Fixture redirect');}
export async function getCurrentBusiness(){return {id:'fixture-business'};}
export async function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'fixture-user',email:'fixture@example.test',user_metadata:{}}}})},rpc:async()=>({error:null}),from(table){const result={data:table==='profiles'?{full_name:params.get('lang')==='km'?'អ្នកប្រើប្រាស់សម្រាប់ធ្វើតេស្តអក្សរខ្មែរវែង':'Fixture Owner',role:'owner',is_active:!params.has('inactive'),updated_at:'2026-10-11T03:00:00Z'}:table==='business_notification_reads'?[{notification_id:'fixture-1'}]:params.has('empty')?[]:rows,error:params.has('error')?{message:'Safe fixture loading error'}:null};const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},single(){return Promise.resolve(result)},then(ok,bad){return Promise.resolve(result).then(ok,bad)}};return q;}};}
export async function updateProfile(_previous,data){record('profile-save',{name:data.get('full_name'),photo:data.get('photo')?.name||null});await pause();return params.has('fail')?{success:false,nameSaved:params.has('partial'),message:'Fixture save failed; draft retained.'}:{success:true,message:'Profile updated successfully.'};}
export async function markNotificationsRead(ids){record('mark-read',ids);if(params.has('fail'))throw Error('Fixture failure');}
export async function saveBarcodeLabelSettings(data){record('barcode-save',Object.fromEntries(data));await pause();if(params.has('fail'))throw Error('Fixture save failure');}
export async function saveShippingLabelSettings(data){record('shipping-save',Object.fromEntries(data));await pause();if(params.has('fail'))throw Error('Fixture save failure');}
export async function saveShippingCustomTemplate(data){record('template-save',Object.fromEntries(data));await pause();return {success:false,message:'Fixture template save failure'};}
export function ReceiptSettingsEditor(){return <p>Receipt editor outside this fixture.</p>;}
export default function Link({onClick,children,...props}){return <a {...props} onClick={event=>{event.preventDefault();onClick?.(event);record('navigation',props.href)}}>{children}</a>;}
`);
const loader=write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath,'.module.css');const names=[...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m=>m[1]);return 'module.exports='+JSON.stringify(Object.fromEntries(names.map(n=>[n,prefix+'-'+n])));}return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
function copied(file,base){let source=fs.readFileSync(path.join(base,file),'utf8');source=source.replace(/from (["'])(\.[^"'\n]+)\1/g,(_,quote,target)=>'from '+JSON.stringify(absolute(path.join(path.dirname(file),target))));return write(file.replaceAll('/','-'),source);}
async function build(name,base){
 const page=base?copied(profile+'/page.tsx',base):absolute(profile+'/page.tsx');
 const form=base?copied(profile+'/profile-form.tsx',base):null;
 const labels=base?copied(printers+'/label-settings.tsx',base):null;
 const notice=base?copied(notifications+'/page.tsx',base):absolute(notifications+'/page.tsx');
 const entry=write(name+'-entry.tsx',`
import React from 'react';import {createRoot} from 'react-dom/client';
import PrinterSettings from ${JSON.stringify(absolute(printers+'/printer-settings'))};
import ProfilePage from ${JSON.stringify(page)};import NotificationsPage from ${JSON.stringify(notice)};
import LanguageProvider, {useLanguage} from ${JSON.stringify(absolute('components/providers/language-provider'))};
import {DEFAULT_RECEIPT} from ${JSON.stringify(absolute('lib/receipts/receipt-model'))};
import {defaultShippingLayout} from ${JSON.stringify(absolute('lib/receipts/shipping-layout'))};
import Loading from ${JSON.stringify(absolute('app/(dashboard)/dashboard/loading'))};
const params=new URLSearchParams(location.search),km=params.get('lang')==='km',kind=params.get('page')||'printer';
function LocaleProbe(){const {language}=useLanguage();return <output id="fixture-language" hidden>{JSON.stringify({language,date:new Date('2026-10-11T03:00:00Z').toLocaleDateString('km-KH',{day:'numeric',month:'long',year:'numeric'})})}</output>;}
if(params.has('tablet')){const media=window.matchMedia.bind(window);window.matchMedia=query=>media(query.replaceAll('(pointer: coarse)','(min-width: 0px)'));}
window.print=()=>{throw Error('Real printing disabled in fixture');};
const shell=node=><LanguageProvider initialLanguage={km?'km':'en'}><div className="workspace-theme min-h-screen bg-slate-50 text-slate-900" style={{'--app-accent':'#a21caf'}}><header className="border-b bg-white p-4">☰　Fixture Business　·　{kind}　·　Main Branch</header><div className="workspace-content p-4 sm:p-6">{node}</div><LocaleProbe/><output id="fixture-result" style={{display:'block',overflowWrap:'anywhere',fontSize:12}}/></div></LanguageProvider>;
const root=createRoot(document.getElementById('root'));root.render(shell(<Loading/>));
const custom=JSON.stringify([{id:'fixture-custom',name:'Fixture custom',layout:defaultShippingLayout('100x150')}]);
const printer=<PrinterSettings businessId="fixture-business" context={{branchId:'fixture-branch',store:{name:km?'ហាងសម្រាប់ធ្វើតេស្តអក្សរខ្មែរវែង':'Fixture Store',phone:'012345678',address:'Fixture address'},appearance:{...DEFAULT_RECEIPT}}} settings={{shipping_custom_templates:custom}}/>;
if(!params.has('loading'))Promise.resolve(kind==='profile'?ProfilePage():kind==='notifications'?NotificationsPage():printer).then(node=>root.render(shell(node))).catch(error=>root.render(shell(<p role="alert">{error.message}</p>)));
`);
 await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,context:root,entry,output:{path:temp,filename:name+'.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@':root,'next/link$':mocks,'next/navigation$':mocks}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),new webpack.NormalModuleReplacementPlugin(/./,resource=>{
 if(resource.request.includes('lib/supabase/')||resource.request==='@/lib/business/get-current-business')resource.request=mocks;
 if(resource.request.endsWith('receipt-settings-editor'))resource.request=mocks;
 if(resource.request.endsWith('read-actions')||resource.request.endsWith('/receipts/actions')||resource.request.endsWith('/profile/actions')||resource.request==='./actions'&&resource.context.endsWith('profile'))resource.request=mocks;
 if(base&&resource.request===absolute(profile+'/profile-form'))resource.request=form;
 if(base&&resource.request==='./label-settings'&&resource.context.endsWith('printers'))resource.request=labels;
 })],performance:{hints:false}});compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error||Error(stats.toString({all:false,errors:true})));else resolve();});});
}
async function main(){
 await build('current');if(process.env.TENH_FOUR_UI_BASELINE)await build('baseline',process.env.TENH_FOUR_UI_BASELINE);
 const globals=fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./(dashboard)/dashboard/settings/printers";\n@source "./(dashboard)/dashboard/settings/profile";\n@source "./(dashboard)/dashboard/notifications";\n@source "./(dashboard)/dashboard/barcodes";\n@source "./(dashboard)/dashboard/loading.tsx";\n@source "../components/receipts";');
 const css=await postcss([tailwind()]).process(globals+'\n@source '+JSON.stringify(temp.replaceAll('\\','/'))+';',{from:path.join(root,'app/globals.css')});
 const locals=[printers+'/label-settings-responsive.module.css',printers+'/printer-settings.module.css',profile+'/profile-responsive.module.css',notifications+'/notifications-responsive.module.css'].map(file=>{const prefix=path.basename(file,'.module.css'),global=[];return fs.readFileSync(path.join(root,file),'utf8').replace(/:global\(([^)]+)\)/g,(_,selector)=>{global.push(selector);return '__GLOBAL'+(global.length-1)+'__';}).replace(/\.([a-zA-Z][\w-]*)/g,'.'+prefix+'-$1').replace(/__GLOBAL(\d+)__/g,(_,index)=>global[index]);}).join('\n');
 write('style.css',css.css+'\n'+locals);
 // The browser capability cannot set touch input: this explicitly exercises the coarse-pointer CSS branch.
 write('tablet.css',css.css+'\n'+locals.replaceAll('(pointer: coarse)','(min-width: 0px)'));
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=url.pathname.slice(1);if(['current.js','baseline.js','style.css','tablet.css'].includes(file)){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(temp,file)));return;}if(file==='icon.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#a21caf"/></svg>');return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/'+(url.searchParams.has('tablet')?'tablet':'style')+'.css?v='+process.pid+'"></head><body><div id="root"></div><script src="/'+(url.searchParams.has('baseline')?'baseline':'current')+'.js?v='+process.pid+'"></script></body></html>');});
 server.listen(3041,'127.0.0.1',()=>console.log('Four-screen fixture http://127.0.0.1:3041; '+temp));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
