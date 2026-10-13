/* eslint-disable @typescript-eslint/no-require-imports -- Offline source-action fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');
const code=loadTs('lib/barcode/code128.ts'),catalog=loadTs('lib/exports/catalog.ts'),imports=loadTs('lib/exports/import-catalog.ts',{'./catalog':catalog});
const files=loadTs('lib/exports/import-files.ts',{'./import-catalog':imports}),backup=loadTs('lib/exports/import-backup.ts',{'./catalog':catalog});
const importPolicy=loadTs('lib/barcode/import-policy.ts',{'./code128':code});
function fixture(flag,ready=true){
 const calls=[],lookups=[];const saved=[{id:'p',sku:'SKU1',barcode:'LEGACY_001'}];
 const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='tenh_barcode_contract_v2_ready')return ready?{data:true,error:null}:{data:null,error:{code:'PGRST202'}};assert.equal(name,'tenh_import_business_safe');return {data:{inserted:1,updated:0,skipped:0,fingerprint:'fixture'},error:null};},from:table=>{lookups.push(table);const q={};for(const key of ['select','eq','in','or'])q[key]=()=>q;q.then=(ok,fail)=>Promise.resolve({data:saved,error:null}).then(ok,fail);return q;}};
 db.auth={getUser:async()=>({data:{user:{id:'fixture-user'}},error:null})};
 const productQuery=db.from;db.from=table=>table==='data_transfer_jobs'?{insert:async()=>({error:null})}:productQuery(table);
 const compiled=ts.transpileModule(fs.readFileSync('lib/barcode/require-contract.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const contract={};new Function('process','exports',compiled)({env:flag?{TENH_BARCODE_PRESERVATION:'1'}:{}},contract);
 const deps={'@/lib/exports/import-files':files,'@/lib/barcode/code128':code,'@/lib/barcode/require-contract':contract,'@/lib/barcode/import-policy':importPolicy,'@/lib/exports/import-catalog':imports,'@/lib/exports/catalog':catalog,'./full-export-actions':{exportBusinessData(){throw Error('Exports forbidden in this test');}},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('Unexpected redirect');}},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role:'owner'})},'@/lib/supabase/branch-server':{createClient:async()=>db},'@/lib/branches/context':{getBranchContext:async()=>({branchId:'branch'})}};
 const api=loadTs('app/(dashboard)/dashboard/exports/actions.ts',deps);
 const restore=loadTs('app/(dashboard)/dashboard/exports/import-actions.ts',{...deps,'@/lib/exports/import-backup':backup,'@/lib/exports/import-columns':loadTs('lib/exports/import-columns.ts')});
 return{api,restore,calls,lookups};
}
const csv=(sku,barcode)=>`name,sku,barcode,selling_price\nFixture,${sku},${barcode},5\n`;
test('enabled but unavailable never submits legacy CSV or backup identifier writes',async()=>{
 const f=fixture(true,false);const preview=await f.api.previewCsvImport('products',csv('NEW','ABC123'));assert.equal(preview.ok,false);assert.match(preview.message,/verification is unavailable/);
 const commit=await f.api.commitCsvImport('products','insert',csv('NEW',''),'fixture.csv',{fingerprint:'fixture',requestId:'request'});assert.equal(commit.ok,false);assert.match(commit.message,/verification is unavailable/);
 await assert.rejects(f.restore.importBackup(JSON.stringify({version:2,businessId:'business',tables:{products:1},data:{products:[{id:'p',barcode:'LEGACY_001'}]}}),['products']),/verification is unavailable/);
 assert.ok(!f.calls.some(call=>call.name==='tenh_import_business_safe'));assert.deepEqual(f.lookups,[]);
});
test('default-off and schema-absent product CSV preview/commit retain existing writes and SKU fallback',async()=>{
 for(const [flag,ready] of [[false,false],[false,true]]){
  const f=fixture(flag,ready);assert.equal((await f.api.previewCsvImport('products',csv('NEW',''))).ok,true);
  assert.equal((await f.api.commitCsvImport('products','insert',csv('NEW',''),'synthetic.csv',{fingerprint:'fixture',requestId:'request'})).ok,true);
  const writes=f.calls.filter(call=>call.name==='tenh_import_business_safe');assert.equal(writes.length,2);for(const call of writes)assert.equal(call.args.p_payload[0].barcode,'NEW');assert.deepEqual(f.lookups,[]);
  if(!flag)assert.ok(!f.calls.some(call=>call.name==='tenh_barcode_contract_v2_ready'));
 }
});
test('enabled CSV imports allow unchanged legacy codes and numeric new codes, rejecting alphanumeric replacements',async()=>{
 for(const [sku,barcode,ok] of [['SKU1','LEGACY_001',true],['NEW','000000123456789',true],['SKU1','REPLACEMENT',false],['NEW','LEGACY_001',false]]){
  const f=fixture(true);const result=await f.api.previewCsvImport('products',csv(sku,barcode));assert.equal(result.ok,ok,result.message);
  const writes=f.calls.filter(call=>call.name==='tenh_import_business_safe');assert.equal(writes.length,ok?1:0);if(ok)assert.equal(writes[0].args.p_payload[0].barcode,barcode);else assert.match(result.message,/numeric strings/);
 }
 const f=fixture(true);assert.equal((await f.api.previewCsvImport('products',csv('NEW',''))).ok,true);assert.ok(!Object.hasOwn(f.calls.find(call=>call.name==='tenh_import_business_safe').args.p_payload[0],'barcode'));
});
test('default-off/schema-absent backup import keeps legacy strings without new lookups; enabled replacement is numeric',async()=>{
 const text=barcode=>JSON.stringify({version:2,businessId:'business',tables:{products:1},data:{products:[{id:'p',business_id:'business',sku:'SKU1',barcode}]}});
 for(const [flag,ready] of [[false,false],[false,true]]){const f=fixture(flag,ready);await f.restore.importBackup(text('LEGACY_001'),['products']);assert.deepEqual(f.lookups,[]);assert.equal(f.calls.find(call=>call.name==='tenh_import_business_safe').args.p_payload.products[0].barcode,'LEGACY_001');}
 const f=fixture(true);await f.restore.importBackup(text('LEGACY_001'),['products']);await assert.rejects(f.restore.importBackup(text('REPLACED'),['products']),/numeric strings/);
});
