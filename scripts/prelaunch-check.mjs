import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const root=process.cwd(), errors=[], warnings=[];
const sourceOnly=process.argv.includes('--source-only');
const requiredMigrations=[
  '20260915_tenant_subdomains.sql',
  '20260915_online_storefront_phase2.sql',
  '20260915_online_ordering_phase34.sql',
  '20260915_online_storefront_phase5.sql',
  '20260915_promotions_loyalty_phase6.sql',
  '20260915_pos_configurable_checkout_phase6.sql',
  '20260915_phase6_commerce_operations_expansion.sql',
  '20260915_phase6_operations_finance_expansion.sql',
  '20260915_phase6_launch_prep.sql',
  '20260920_subscription_branch_limits.sql',
  '20260920150000_custom_plan_direct_pricing.sql',
  '20260920160000_printer_paper_and_receipt_qr.sql',
  '20260921090000_register_pos_accounting.sql',
  '20260921100000_operating_branches.sql',
  '20260921110000_operating_branch_completion.sql',
];
function present(name){return Boolean(process.env[name]?.trim());}
if(!sourceOnly){
  try{const req=createRequire(path.join(root,'package.json'));req('@next/env').loadEnvConfig(root,false);}catch{warnings.push('Next environment loader unavailable; checking exported environment variables only. Install the existing project dependencies before a full launch check.');}
  if(!present('NEXT_PUBLIC_SUPABASE_URL'))errors.push('Missing NEXT_PUBLIC_SUPABASE_URL');
  if(!present('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')&&!present('NEXT_PUBLIC_SUPABASE_ANON_KEY'))errors.push('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  if(!present('SUPABASE_SERVICE_ROLE_KEY'))warnings.push('SUPABASE_SERVICE_ROLE_KEY is missing; server-only administration may fail.');
  if(!present('NEXT_PUBLIC_ROOT_DOMAIN'))warnings.push('Production root domain is not explicitly configured.');
  if(!present('NEXT_PUBLIC_SITE_URL'))warnings.push('Production auth/redirect site URL is not explicitly configured.');
}
for(const migration of requiredMigrations){
  if(!fs.existsSync(path.join(root,'supabase','migrations',migration)))(sourceOnly?warnings:errors).push(`Missing migration source: ${migration}`);
}
const opsFile=path.join(root,'supabase','migrations','20260915_phase6_operations_finance_expansion.sql');
if(fs.existsSync(opsFile)){
  const ops=fs.readFileSync(opsFile,'utf8');
  if(ops.includes('p.low_stock_threshold'))errors.push('Operations migration still references removed products.low_stock_threshold.');
  if(!ops.includes('p.low_stock_quantity'))warnings.push('Operations migration does not seed branch thresholds from products.low_stock_quantity.');
}
const pkgFile=path.join(root,'package.json');
try{const pkg=JSON.parse(fs.readFileSync(pkgFile,'utf8'));for(const script of ['build','start'])if(!pkg.scripts?.[script])errors.push(`package.json missing ${script} script`);}catch{errors.push('package.json could not be read.');}
if(!fs.existsSync(path.join(root,'tsconfig.json')))(sourceOnly?warnings:errors).push('tsconfig.json is absent from this source copy. Preserve the configuration in your actual project; do not overwrite it with a guessed config.');
console.log(`TENH POS prelaunch ${sourceOnly?'SOURCE-ONLY':'FULL LOCAL CONFIGURATION'} check`);
console.log('This read-only script does not connect to the database or establish migration application status.');
for(const w of warnings)console.log(`WARN  ${w}`);
for(const e of errors)console.log(`ERROR ${e}`);
if([...warnings,...errors].some(s=>s.startsWith('Missing migration source:')))console.log('NOTE  A partial archive is not a fresh-database installer. Verify the real migration history. Do not replay older patches over newer database functions to satisfy this file check.');
if(errors.length)process.exitCode=1;
else console.log(sourceOnly?'PASS  Source-only check completed; warnings still need review before deployment.':'PASS  Local static checks completed. Build, database and browser acceptance tests are still required.');
