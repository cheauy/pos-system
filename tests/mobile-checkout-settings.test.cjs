const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const ts=require('typescript');
const fs=require('node:fs');

test('customer retries retain request identity and close only after confirmed save',async()=>{
  const source=ts.createSourceFile('entry-form.tsx',fs.readFileSync('mobile/src/entry-form.tsx','utf8'),ts.ScriptTarget.Latest,ts.ScriptKind.TSX);
  const form=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='EntryForm');
  const submit=form.body.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='submit');
  let values={id:'original',name:'Customer',phone:'123',address:'Street'},attempted=false,error='',saved=0;let fail=true;
  const context={scope:{},working:{current:false},online:true,kind:'customer',customerFields:{},values,savedAny:{current:false},Crypto:{randomUUID:()=> 'next'},
    setBusy(){},setProgress(){},setNotice(){},setError:value=>error=value,setAttempted:value=>attempted=value,setValues:value=>values=value,
    api:async()=>{if(fail)throw Error('Connection lost');},saved:()=>saved++};
  const js=ts.transpileModule(submit.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const run=new Function(...Object.keys(context),`${js}; return submit;`)(...Object.values(context));
  await run();assert.equal(saved,0);assert.equal(values.id,'original');assert.equal(attempted,true);assert.match(error,/Retry this form/);
  fail=false;await run();assert.equal(values.id,'original');assert.equal(saved,1);
});

test('fee and discount typing accepts at most two decimal places without silently changing amounts',()=>{
  const {decimalInput}=loadTs('mobile/src/decimal-input.ts');
  for(const value of ['', '0', '12', '12.', '12.34', '.5'])assert.equal(decimalInput(value,'1'),value);
  for(const value of ['-1','1.234','1..2','1e2','abc','1,23'])assert.equal(decimalInput(value,'1'),'1');
});

test('tax saves only one branch field, with owner, branch and numeric validation',async()=>{
  const {validTaxRate}=loadTs('lib/pos/tax-rate.ts');
  for(const value of [0,0.29,7.25,100])assert.equal(validTaxRate(value),true);
  for(const value of [NaN,Infinity,-1,100.01,1.234,'5',null])assert.equal(validTaxRate(value),false);
  const log=[];let role='owner';let branch='branch';let fail=false;
  const {saveTaxRate}=loadTs('app/(dashboard)/dashboard/settings/pos-currency/tax-actions.ts',{
    'next/cache':{revalidatePath(){}},
    '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role})},
    '@/lib/branches/context':{assertOperatingBranch:async id=>{if(id!==branch)throw Error('Branch changed');},getBranchContext:async()=>({branchId:branch})},
    '@/lib/supabase/branch-server':{createClient:async()=>({from:table=>queryDouble(table,{error:fail?{message:'Database unavailable'}:null},log)})},
    '@/lib/pos/tax-rate':{validTaxRate},
  });
  await saveTaxRate('business','branch',7.25);
  assert.equal(log[0].table,'branch_pos_settings');
  assert.deepEqual(log[0].steps.filter(step=>step[0]==='update'||step[0]==='eq'),[['update',{pos_tax_rate:7.25}],['eq','business_id','business'],['eq','location_id','branch']]);
  await assert.rejects(saveTaxRate('business','branch',100.01),/Tax %/);
  await assert.rejects(saveTaxRate('other','branch',5),/owner/);
  role='staff';await assert.rejects(saveTaxRate('business','branch',5),/owner/);
  role='owner';branch='different';await assert.rejects(saveTaxRate('business','branch',5),/Branch changed/);
  assert.equal(log.length,1);
  branch='branch';fail=true;await assert.rejects(saveTaxRate('business','branch',5),/Unable to save/);
});
