/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PGlite: live-captured function bodies and table shapes (no rows), synthetic data only.
// Never connects to Supabase. FKs are kept only between captured tables.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('./helpers/pglite.cjs');

const fixture=JSON.parse(fs.readFileSync('tests/fixtures/variant-settings-live-20261008.json','utf8'));
const MIGRATION='supabase/migrations/20261008150000_variants_settings_client_lockdown.sql';
const q=s=>'"'+s.replaceAll('"','""')+'"';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const A=id(1),B=id(2),LA=id(11),LB=id(12),OA=id(21),OB=id(22),SA=id(23),PA=id(31),PB=id(32),VA=id(41),VB=id(42);
const rel=name=>fixture.relations.find(r=>r.name===name);

async function open(){
 const db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
  create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;set check_function_bodies=off;`);
 const tables=fixture.relations.filter(r=>r.kind==='r');
 for(const t of tables){
  const cols=t.columns.map(c=>`${q(c.name)} ${c.type}${c.generated==='s'?` generated always as (${c.default}) stored`:''}`);
  await db.exec(`create table public.${q(t.name)} (${cols.join(',')});`);
  for(const c of t.columns)if(c.default&&c.generated!=='s'){
   try{await db.exec(`alter table public.${q(t.name)} alter column ${q(c.name)} set default ${c.default};`);}catch{/* default needs an uncaptured function */}
  }
  for(const c of t.columns)if(c.notnull&&c.generated!=='s')await db.exec(`alter table public.${q(t.name)} alter column ${q(c.name)} set not null;`);
 }
 const names=new Set(tables.map(t=>t.name));
 for(const types of [['p','u','c'],['f']])for(const t of tables)for(const c of t.constraints||[]){
  if(!types.includes(c.type))continue;
  // Composite same-business FKs reference unique indexes that were not captured; single-column FKs to a PK are kept.
  if(c.type==='f'&&(!names.has(String(c.ref).replace(/^public\./,''))||/^FOREIGN KEY \([^)]*,/.test(c.definition)))continue;
  try{await db.exec(`alter table public.${q(t.name)} add constraint ${q(c.name)} ${c.definition};`);}catch(e){if(c.type!=='c')throw e;}
 }
 for(const f of [...fixture.functions].sort((a,b)=>(a.schema==='auth'?0:1)-(b.schema==='auth'?0:1)))await db.exec(f.definition);
 for(const v of fixture.relations.filter(r=>r.kind==='v'))await db.exec(`create view public.${q(v.name)} as ${v.view_definition}`);
 for(const f of fixture.functions){
  const sig=f.schema==='auth'?'auth.'+f.signature.replace(/^auth\./,''):'public.'+f.signature;
  await db.exec(`revoke all on function ${sig} from public;`);
  for(const role of ['anon','authenticated','service_role'])if(f.acl===null||new RegExp(`(?:\\{|,)${role}=X`).test(f.acl))await db.exec(`grant execute on function ${sig} to ${role};`);
 }
 // Production privileges and policies for the two tables under test (the "before" state).
 for(const name of ['product_variants','system_settings']){
  const t=rel(name);
  await db.exec(`alter table public.${q(name)} enable row level security;`);
  for(const g of t.grants||[]){const [role,priv]=g.split(':');await db.exec(`grant ${priv} on public.${q(name)} to ${role};`);}
  for(const p of t.policies||[]){
   const cmd={r:'select',a:'insert',w:'update',d:'delete','*':'all'}[p.cmd];
   await db.exec(`create policy ${q(p.name)} on public.${q(name)} as ${p.permissive?'permissive':'restrictive'} for ${cmd} to ${p.roles.join(',')}${p.using?` using (${p.using})`:''}${p.check?` with check (${p.check})`:''};`);
  }
 }
 await db.exec('set check_function_bodies=on;');
 return db;
}

const dummy=c=>{
 if(c.type==='uuid')return [`'${id(900+Math.floor(Math.random()*99))}'`];
 if(/^(text|character varying)/.test(c.type))return ["'x'"];
 if(/^(integer|bigint|smallint|numeric|real|double)/.test(c.type))return ['0'];
 if(c.type==='boolean')return ['false'];
 if(/^timestamp/.test(c.type))return ['now()'];
 if(c.type==='date')return ['current_date'];
 if(/^jsonb?$/.test(c.type))return ["'{}'"];
 if(c.type.endsWith('[]'))return ["'{}'"];
 return null;
};
async function insert(db,table,values){
 const t=rel(table),cols=Object.keys(values),exprs=cols.map((_,i)=>`$${i+1}`),params=Object.values(values);
 for(const c of t.columns)if(c.notnull&&!c.default&&c.generated!=='s'&&!(c.name in values)){const d=dummy(c);if(d){cols.push(c.name);exprs.push(d[0]);}}
 await db.query(`insert into public.${q(table)} (${cols.map(q).join(',')}) values (${exprs.join(',')})`,params);
}
async function seed(db){
 const future=new Date(Date.now()+30*864e5).toISOString();
 for(const [biz,owner,slug] of [[A,OA,'qa-a'],[B,OB,'qa-b']])await insert(db,'businesses',{id:biz,owner_id:owner,name:'Synthetic '+slug,slug,is_active:true,subscription_status:'active',subscription_plan_key:'custom',subscription_branch_limit:3,subscription_expires_at:future});
 await insert(db,'business_locations',{id:LA,business_id:A,name:'A main',code:'AM',is_active:true,is_default:true,plan_disable_pending:false});
 await insert(db,'business_locations',{id:LB,business_id:B,name:'B main',code:'BM',is_active:true,is_default:true,plan_disable_pending:false});
 for(const [uid] of [[OA],[OB],[SA]])await insert(db,'profiles',{id:uid,full_name:'Synthetic',is_active:true});
 await insert(db,'business_members',{id:id(51),business_id:A,user_id:OA,role:'owner',is_active:true,team_password_required:false,default_location_id:LA});
 await insert(db,'business_members',{id:id(52),business_id:B,user_id:OB,role:'owner',is_active:true,team_password_required:false,default_location_id:LB});
 await insert(db,'business_members',{id:id(53),business_id:A,user_id:SA,role:'staff',is_active:true,team_password_required:false,default_location_id:LA});
 for(const [pid,biz,loc,owner,sku] of [[PA,A,LA,OA,'SKU-A'],[PB,B,LB,OB,'SKU-B']]){
  await insert(db,'products',{id:pid,business_id:biz,owner_id:owner,name:'Tee '+sku,sku,selling_price:10,cost_price:4,is_active:true});
  await insert(db,'branch_product_details',{id:pid,business_id:biz,location_id:loc,owner_id:owner,name:'Tee '+sku,sku,selling_price:10,cost_price:4,is_active:true,branch_archived:false});
  await insert(db,'product_location_stock',{business_id:biz,location_id:loc,product_id:pid,quantity:5});
 }
 await insert(db,'product_variants',{id:VA,product_id:PA,size:'M',color:'Black',sku:'VA',price:10,stock_quantity:3});
 await insert(db,'product_variants',{id:VB,product_id:PB,size:'L',color:'White',sku:'VB',price:12,stock_quantity:4});
 await insert(db,'system_settings',{business_name:'Synthetic Store A',business_address:'Synthetic address'});
}
async function as(db,role,uid,branch,fn){
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[uid?JSON.stringify({sub:uid,role}):'',JSON.stringify(branch?{'x-tenh-branch-id':branch}:{})]);
 await db.exec(`set role ${role};`);
 try{return await fn();}finally{await db.exec('reset role;');await db.query("select set_config('request.jwt.claims','',false),set_config('request.headers','{}',false)");}
}
const denied=p=>assert.rejects(p,e=>e.code==='42501'||/permission denied/.test(e.message));
const count=async db=>Number((await db.query('select count(*)::int n from public.product_variants')).rows[0].n);

test('product_variants and system_settings lockdown with real caller bodies',async t=>{
 const db=await open();
 try{
  await seed(db);

  await t.test('before: authenticated user of business B can rewrite business A variants (the bug)',async()=>{
   await as(db,'authenticated',OB,null,async()=>{
    const r=await db.query('update public.product_variants set price=99 where id=$1 returning id',[VA]);
    assert.equal(r.rows.length,1);
    const settings=await db.query('select business_name from public.system_settings');
    assert.equal(settings.rows[0].business_name,'Synthetic Store A');
   });
   await db.query('update public.product_variants set price=10 where id=$1',[VA]);
  });

  await db.exec(fs.readFileSync(MIGRATION,'utf8'));

  await t.test('after: direct anon/authenticated access to both tables is denied; service_role still reads',async()=>{
   for(const [role,uid] of [['anon',null],['authenticated',OA],['authenticated',OB]])await as(db,role,uid,null,async()=>{
    await denied(db.query('select * from public.product_variants'));
    await denied(db.query(`insert into public.product_variants(product_id,price,stock_quantity) values('${PA}',1,1)`));
    await denied(db.query(`update public.product_variants set price=1 where id='${VA}'`));
    await denied(db.query(`delete from public.product_variants where id='${VA}'`));
    await denied(db.query('select * from public.system_settings'));
    await denied(db.query("update public.system_settings set business_name='x'"));
   });
   await as(db,'service_role',null,null,async()=>{
    assert.equal((await db.query('select count(*)::int n from public.product_variants')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.system_settings')).rows[0].n,1);
   });
   assert.equal(await count(db),2);
  });

  await t.test('owner all-branch export returns only own variants; other owners and staff are refused',async()=>{
   // Owners reach the private all-branch implementation only through tenh_export_business(..., true).
   await denied(as(db,'authenticated',OA,null,()=>db.query("select public.tenh_export_business_all_branches($1,array['product_variants'])",[A])));
   const own=await as(db,'authenticated',OA,LA,()=>db.query("select public.tenh_export_business($1,array['product_variants'],true) r",[A]));
   assert.deepEqual(own.rows[0].r.product_variants.map(v=>v.id),[VA]);
   const other=await as(db,'authenticated',OB,LB,()=>db.query("select public.tenh_export_business($1,array['product_variants'],true) r",[B]));
   assert.deepEqual(other.rows[0].r.product_variants.map(v=>v.id),[VB]);
   await assert.rejects(as(db,'authenticated',OB,LB,()=>db.query("select public.tenh_export_business($1,array['product_variants'],true)",[A])),/Only the business owner|not allowed|access/i);
   await assert.rejects(as(db,'authenticated',SA,LA,()=>db.query("select public.tenh_export_business($1,array['product_variants'],true)",[A])),/Only the business owner|not allowed|access/i);
  });

  await t.test('owner branch export (tenh_export_business, p_all_branches=false) is scoped to own products',async()=>{
   const r=await as(db,'authenticated',OA,LA,()=>db.query("select public.tenh_export_business($1,array['product_variants'],false) r",[A]));
   assert.deepEqual(r.rows[0].r.product_variants.map(v=>v.id),[VA]);
   await assert.rejects(as(db,'authenticated',OB,LA,()=>db.query("select public.tenh_export_business($1,array['product_variants'],false)",[A])));
  });

  await t.test('CSV typing accepts owner variant rows, refuses another business, and writes nothing',async()=>{
   const before=await count(db);
   const payload={product_variants:[{product_id:PA,size:'S',price:'11',stock_quantity:'2'}]};
   const r=await as(db,'authenticated',OA,LA,()=>db.query('select public.tenh_import_csv_types($1,$2) r',[A,payload]));
   assert.equal(r.rows[0].r.product_variants[0].price,11);
   await assert.rejects(as(db,'authenticated',OB,LB,()=>db.query('select public.tenh_import_csv_types($1,$2)',[A,payload])),/Only the business owner/);
   assert.equal(await count(db),before);
  });

  await t.test('backup import never writes variants and rejects foreign or changed variant rows',async()=>{
   const snapshot=(await db.query('select to_jsonb(v) r from public.product_variants v order by id')).rows.map(x=>x.r);
   const own=snapshot.find(v=>v.id===VA),foreign=snapshot.find(v=>v.id===VB);
   const run=(uid,biz,branch,rows)=>as(db,'authenticated',uid,branch,()=>db.query("select public.tenh_import_business_safe($1,'backup','merge',$2,$3,false) r",[biz,{product_variants:rows},branch]));
   const same=await run(OA,A,LA,[own]);
   assert.equal(same.rows[0].r.updated,0);assert.equal(same.rows[0].r.inserted,0);assert.equal(same.rows[0].r.skipped,1);
   await assert.rejects(run(OA,A,LA,[foreign]),/missing or foreign record/);
   await assert.rejects(run(OA,A,LA,[{...own,price:1}]),/changed protected data/);
   await assert.rejects(run(OB,A,LB,[own]));
   const after=(await db.query('select to_jsonb(v) r from public.product_variants v order by id')).rows.map(x=>x.r);
   assert.deepEqual(after,snapshot);
  });
 }finally{await db.close();}
});

test('no later migration reopens client access to product_variants or system_settings',()=>{
 const later=fs.readdirSync('supabase/migrations').filter(f=>f>'20261008150000').sort();
 for(const f of later){
  const sql=fs.readFileSync('supabase/migrations/'+f,'utf8').toLowerCase();
  for(const table of ['product_variants','system_settings']){
   assert.doesNotMatch(sql,new RegExp(`grant[^;]*on[^;]*${table}[^;]*to[^;]*(anon|authenticated|public)`),`${f} grants ${table} to a client role`);
   assert.doesNotMatch(sql,new RegExp(`create policy[^;]*on[^;]*${table}[^;]*using\\s*\\(\\s*true\\s*\\)`),`${f} adds an always-true ${table} policy`);
  }
 }
});
