// Builds the real server-page presentation against safe, local-only subscription data.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone fixture builder. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const root = path.resolve(__dirname, '..');
const directory = 'app/(dashboard)/dashboard/settings/subscription';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tenh-subscription-'));
const write = (name, contents) => { const file = path.join(temp, name); fs.writeFileSync(file, contents); return file; };
const mocks = write('mocks.tsx', `
const params=new URLSearchParams(location.search);
const status=params.get('status')||'active';
const expiry=status==='expired'?'2026-09-01T00:00:00Z':status==='trialing'?new Date(Date.now()+7*86400000).toISOString():'2027-10-01T00:00:00Z';
export async function getCurrentBusinessForSubscription(){if(params.has('loading'))await new Promise(()=>{});return {id:'fixture-business',role:params.get('role')||'owner',subscriptionStatus:status,subscriptionExpiresAt:expiry,subscriptionLocked:status==='expired',deletionScheduledAt:'2027-03-01T00:00:00Z'};}
export async function getBranchEntitlement(){return {used:1,activeUsed:1,limit:2,configuredLimit:2};}
export async function expireStaleSubscriptionPaymentRequestsForBusiness(){}
export function getSubscriptionPaymentExpiryAt(order){return order.payment_expires_at;}
const subscription={subscription_plan_key:status==='trialing'?'trial':'custom',subscription_user_limit:10,subscription_months:12,subscription_started_at:status==='trialing'?new Date().toISOString():status==='expired'?'2026-08-01T00:00:00Z':'2026-10-01T00:00:00Z',subscription_expires_at:expiry,subscription_status:status,deletion_scheduled_at:'2027-03-01T00:00:00Z'};
const orders=['approved','pending_payment','payment_submitted','rejected','quote_requested'].map((status,index)=>({id:'fixture-'+status,plan_key:'custom',term_months:index===2?3:12,requested_user_limit:10,total_amount:index===4?null:123.45+index,status,payment_expires_at:status==='pending_payment'?new Date(Date.now()+3600000).toISOString():null,created_at:'2026-10-01T00:00:00Z'}));
const history=[{id:'history-1',action:'subscription_approved',months:12,previous_expiry:'2026-09-01T00:00:00Z',new_expiry:expiry,reason:'Safe fixture only',created_at:'2026-10-01T00:00:00Z'}];
export const supabaseAdmin={from(table){const value={data:table==='businesses'?subscription:params.has('empty')?[]:table==='subscription_history'?history:orders,count:1,error:params.get('error')===table?{message:'Fixture load error'}:null};const query={select(){return query},eq(){return query},neq(){return query},order(){return query},limit(){return query},maybeSingle(){return Promise.resolve(value)},then(resolve,reject){return Promise.resolve(value).then(resolve,reject)}};return query;}};
export function useRouter(){return {refresh(){},push(){}};}
export function usePathname(){return '/dashboard/settings/subscription';}
export async function reactivateCurrentSubscription(){if(params.has('hold'))await new Promise(resolve=>setTimeout(resolve,5000));return {error:'Fixture: payment opening blocked safely.'};}
export async function expireSubscriptionPaymentRequest(){throw new Error('Fixture: expiry writes blocked.');}
`);
const link = write('link.tsx', `export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
const scheduled = write('scheduled.tsx', `export default function Scheduled(){return null;}`);
const logout = write('logout.tsx', `export default function Logout(){return <button type="button">Logout</button>;}`);
const picker = write('picker.tsx', `export default function Picker(){return <p>Fixture plan selection destination</p>;}`);
const loader = write('loader.cjs', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css')){const names=[...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m=>m[1]);return 'module.exports='+JSON.stringify(Object.fromEntries(names.map(n=>[n,'subscription-responsive-'+n])));}return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
async function build(name, source) {
  const page = write(name+'-page.tsx', source.replace(/from "\.\/([^"\n]+)"/g, (_, file) => 'from '+JSON.stringify(path.join(root,directory,file).replaceAll('\\','/'))));
  const entry = write(name+'-entry.tsx', `
import {createRoot} from 'react-dom/client';
import Page from ${JSON.stringify(page.replaceAll('\\','/'))};
import LanguageProvider from ${JSON.stringify(path.join(root,'components/providers/language-provider').replaceAll('\\','/'))};
import Loading from ${JSON.stringify(path.join(root,'app/(dashboard)/dashboard/loading').replaceAll('\\','/'))};
import ErrorPage from ${JSON.stringify(path.join(root,'app/(dashboard)/dashboard/error').replaceAll('\\','/'))};
const khmer=new URLSearchParams(location.search).get('lang')==='km';
const container=createRoot(document.getElementById('root'));
const shell=(children)=><LanguageProvider initialLanguage={khmer?'km':'en'}><div className="workspace-theme min-h-screen bg-slate-50 text-slate-900" style={{'--app-accent':'#a21caf'}}><header className="border-b bg-white p-4">☰　Fixture Business　·　Subscription &amp; Plan　·　Main Branch</header><div className="md:pl-16"><div className="workspace-content p-4 sm:p-6">{children}</div></div></div></LanguageProvider>;
container.render(shell(<Loading/>));
Page({searchParams:Promise.resolve({})}).then(node=>container.render(shell(node))).catch(error=>container.render(shell(<ErrorPage error={error} retry={()=>location.reload()}/>)));
`);
  await new Promise((resolve,reject)=>{
    const compiler=webpack({mode:'development',devtool:false,context:root,entry,output:{path:temp,filename:name+'.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@':root,'next/link$':link,'next/navigation$':mocks}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},plugins:[new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),new webpack.NormalModuleReplacementPlugin(/./,resource=>{
      if(['@/lib/business/get-current-business','@/lib/supabase/admin','@/lib/subscriptions/branch-limits','@/lib/subscriptions/payment-expiry'].includes(resource.request))resource.request=mocks;
      if(resource.request.endsWith('scheduled-renewal-card'))resource.request=scheduled;
      if(resource.request.endsWith('subscription-plan-picker-page'))resource.request=picker;
      if(resource.request==='@/components/logout-button')resource.request=logout;
      if(resource.request==='./actions'&&resource.context.endsWith('subscription'))resource.request=mocks;
    })],performance:{hints:false}});
    compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error||new Error(stats.toString({all:false,errors:true})));else resolve();});
  });
}
async function main(){
  await build('current',fs.readFileSync(path.join(root,directory,'page.tsx'),'utf8'));
  if(process.env.TENH_SUBSCRIPTION_BASELINE)await build('baseline',fs.readFileSync(process.env.TENH_SUBSCRIPTION_BASELINE,'utf8'));
  const globals=fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./(dashboard)/dashboard/settings/subscription";\n@source "../components/mobile-list-card.tsx";');
  const css=await postcss([tailwind()]).process(globals+'\n@source '+JSON.stringify(temp.replaceAll('\\','/'))+';',{from:path.join(root,'app/globals.css')});
  const local=fs.readFileSync(path.join(root,directory,'subscription-responsive.module.css'),'utf8').replace(/\.([a-zA-Z][\w-]*)/g,'.subscription-responsive-$1');
  write('style.css',css.css+'\n'+local);
  let requests=0;
  const server=http.createServer((req,res)=>{
    requests++;
    if(req.url==='/requests'){res.end(String(requests));return;}
    const file=req.url.split('?')[0].slice(1);
    if(['current.js','baseline.js','style.css'].includes(file)){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(temp,file)));return;}
    res.setHeader('Content-Type','text/html');
    const baseline=new URL(req.url,'http://localhost').searchParams.has('baseline');
    res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/'+(baseline?'baseline':'current')+'.js"></script></body></html>');
  });
  server.listen(3040,'127.0.0.1',()=>console.log('Subscription fixture: http://127.0.0.1:3040; files: '+temp));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
