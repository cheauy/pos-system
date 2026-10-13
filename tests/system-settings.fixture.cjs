/* eslint-disable @typescript-eslint/no-require-imports -- Local UI fixture, with every service replaced. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {webpack}=require('next/dist/compiled/webpack/webpack');
const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tenh-system-ui-'));
const settings='app/(dashboard)/dashboard/settings',system=settings+'/system';
const absolute=file=>path.join(root,file).replaceAll('\\','/');
const write=(name,content)=>{const file=path.join(temp,name);fs.writeFileSync(file,content);return file;};
const mocks=write('mocks.tsx',`
import React from 'react';
const params=new URLSearchParams(location.search),events=[];
const record=(action,data)=>{events.push({action,data});document.getElementById('fixture-result').textContent=JSON.stringify(events);};
async function save(action,data){record(action,data);if(params.has('hold'))await new Promise(resolve=>setTimeout(resolve,3000));if(params.has('fail'))throw Error('Fixture save failed; draft retained.');}
export async function getCurrentBusiness(){return {id:'fixture-business',role:params.has('viewer')?'staff':'owner'};}
export async function businessHasPermission(){return !params.has('viewer');}
export async function getBranchContext(){return {branchId:'fixture-branch',branches:[{id:'fixture-branch',name:params.get('lang')==='km'?'សាខាសម្រាប់ធ្វើតេស្តឈ្មោះវែងដោយសុវត្ថិភាព':'Fixture branch'}]};}
export async function getCustomerFieldSettings(){return {emailEnabled:true,birthdayEnabled:false,genderEnabled:false};}
export async function createClient(){return {from(){return this},select(){return this},eq(){return this},async maybeSingle(){return {data:params.has('unset')?null:{require_open_register:params.has('on')},error:params.has('load-error')?{message:'Fixture load failure'}:null};}};}
export async function saveRegisterRequirement(businessId,branchId,required){await save('register',{businessId,branchId,required});}
export async function updateCustomerFieldSettings(data){await save('customer-fields',Object.fromEntries(data));}
export default function Link({children,...props}){return <a {...props} onClick={event=>{event.preventDefault();record('navigation',props.href)}}>{children}</a>;}
`);
const loader=write('loader.cjs',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath,'.module.css');return 'module.exports='+JSON.stringify(Object.fromEntries([...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m=>[m[1],prefix+'-'+m[1]])));}return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
const snapshotFiles=[system+'/page.tsx',system+'/appearance-form.tsx',system+'/customer-fields.tsx',settings+'/register-setting.tsx'];
async function build(name,base){
 const replacements={};
 if(base)for(const file of snapshotFiles){const source=fs.readFileSync(path.join(base,file),'utf8').replace(/from (["'])(\.[^"'\n]+)\1/g,(_,quote,target)=>'from '+JSON.stringify(absolute(path.join(path.dirname(file),target))));replacements[absolute(file).replace(/\.tsx$/,'')]=write(file.replaceAll('/','-'),source);}
 const entry=write(name+'.tsx',`
import React from 'react';import {createRoot} from 'react-dom/client';import {Toaster} from 'sonner';
import Page from ${JSON.stringify(absolute(system+'/page'))};
import LanguageProvider from ${JSON.stringify(absolute('components/providers/language-provider'))};
import ThemeProvider from ${JSON.stringify(absolute('components/providers/theme-provider'))};
const params=new URLSearchParams(location.search),km=params.get('lang')==='km';
localStorage.removeItem('tenh-appearance');
if(params.has('dark'))localStorage.setItem('tenh-appearance',JSON.stringify({theme:'dark',accent:'teal'}));
const shell=node=><LanguageProvider initialLanguage={km?'km':'en'}><ThemeProvider><div className="workspace-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white"><header className="sticky top-0 z-30 border-b bg-white p-4 dark:bg-slate-900">☰　Fixture Business　·　Settings　·　Main Branch</header><div className="general-settings-layout p-4 sm:p-6">{node}</div><output id="fixture-result" className="break-words text-xs"/><Toaster/></div></ThemeProvider></LanguageProvider>;
const root=createRoot(document.getElementById('root'));Page().then(node=>root.render(shell(node))).catch(error=>root.render(shell(<p role="alert">{error.message}</p>)));
`);
 await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,context:root,entry,output:{path:temp,filename:name+'.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@':root,'next/link$':mocks}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),new webpack.NormalModuleReplacementPlugin(/./,resource=>{
 if(resource.request.includes('lib/supabase/')||resource.request.includes('lib/business/get-current-business')||resource.request.includes('lib/branches/context')||resource.request.includes('lib/auth/effective-permissions')||resource.request.includes('lib/customers/get-customer-field-settings')||resource.request.endsWith('register-setting-actions')||resource.request.endsWith('customers/actions'))resource.request=mocks;
 if(replacements[resource.request])resource.request=replacements[resource.request];
 })],performance:{hints:false}});compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error||Error(stats.toString({all:false,errors:true})));else resolve();});});
}
function moduleCss(file,base=root){const prefix=path.basename(file,'.module.css'),globals=[];return fs.readFileSync(path.join(base,file),'utf8').replace(/:global\(([^)]+)\)/g,(_,selector)=>{globals.push(selector);return '__GLOBAL'+(globals.length-1)+'__';}).replace(/\.([a-zA-Z][\w-]*)/g,'.'+prefix+'-$1').replace(/__GLOBAL(\d+)__/g,(_,index)=>globals[index]);}
async function main(){
 const base=process.env.TENH_SYSTEM_BASELINE;
 await build('current');if(base)await build('baseline',base);
 const globals=fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./(dashboard)/dashboard/settings/system";\n@source "./(dashboard)/dashboard/settings/register-setting.tsx";');
 const css=await postcss([tailwind()]).process(globals+'\n@source '+JSON.stringify(temp.replaceAll('\\','/'))+';',{from:path.join(root,'app/globals.css')});
 const shared=fs.readFileSync(path.join(root,settings+'/settings-layout.css'),'utf8');
 const current=css.css+'\n'+shared+'\n'+moduleCss(settings+'/settings-touch.module.css')+'\n'+moduleCss(system+'/system-responsive.module.css');
 write('style.css',current);
 // Viewport controls do not emulate touch input; this explicitly exercises the coarse-pointer query.
 write('tablet.css',current.replaceAll('(pointer: coarse)','(min-width: 0px)'));
 if(base)write('baseline.css',css.css+'\n'+fs.readFileSync(path.join(base,settings+'/settings-layout.css'),'utf8')+'\n'+moduleCss(settings+'/settings-touch.module.css',base));
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=url.pathname.slice(1);if(['current.js','baseline.js','style.css','tablet.css','baseline.css'].includes(file)){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(temp,file)));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/'+(url.searchParams.has('baseline')?'baseline':url.searchParams.has('tablet')?'tablet':'style')+'.css"></head><body><div id="root"></div><script src="/'+(url.searchParams.has('baseline')?'baseline':'current')+'.js"></script></body></html>');});
 server.listen(3042,'127.0.0.1',()=>console.log('System Settings safe fixture: http://127.0.0.1:3042; '+temp));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
