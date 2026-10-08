/* eslint-disable @typescript-eslint/no-require-imports */
// Exact captured application/auth bodies, never substitutes for functions under test.
// Disposable column/default/PK/unique/check fixtures. FK, RLS and triggers are intentionally
// omitted: this tests function bodies, not the complete deployed database or concurrent sessions.
const fs=require('node:fs');
const {PGlite}=require('./pglite.cjs');
const snapshot=name=>JSON.parse(fs.readFileSync(`tests/fixtures/${name}-live-20261008.json`,'utf8'));
const functions=['order-safety','order-safety-dependencies','order-safety-callers'].flatMap(n=>snapshot(n).functions);
const schema=snapshot('order-safety-schema');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function open(){
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;set check_function_bodies=off;');
  for(const type of schema.enums)await db.exec(`create type ${quote(type.schema)}.${quote(type.name)} as enum (${type.labels.map(l=>"'"+l.replaceAll("'","''")+"'").join(',')});`);
  for(const table of schema.relations.filter(t=>t.kind==='r')){
   const columns=table.columns.map(c=>`${quote(c.name)} ${c.type}${c.generated==='s'?` generated always as (${c.default}) stored`:c.default?` default ${c.default}`:''}`);
   await db.exec(`create table ${quote(table.schema)}.${quote(table.name)} (${columns.join(',')});`);
  }
  for(const f of functions)await db.exec(f.definition);
  for(const v of schema.relations.filter(t=>t.kind==='v'))await db.exec(`create view ${quote(v.schema)}.${quote(v.name)} as ${v.view_definition};`);
  for(const t of schema.relations.filter(t=>t.kind==='r'))for(const c of t.constraints||[]){
   if(['p','u','c'].includes(c.type))await db.exec(`alter table ${quote(t.schema)}.${quote(t.name)} add constraint ${quote(c.name)} ${c.definition};`);
  }
  for(const f of functions){
   const signature=f.schema==='auth'?f.signature:'public.'+f.signature;
   await db.exec(`revoke all on function ${signature} from public;`);
   for(const role of ['anon','authenticated','service_role'])if(f.acl===null||new RegExp(`(?:\\{|,)${role}=X`).test(f.acl))await db.exec(`grant execute on function ${signature} to ${role};`);
  }
  await db.exec('grant usage on schema auth to authenticated,service_role;set check_function_bodies=on;');
  return db;
 }catch(e){await db.close();throw e;}
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const V='2026-10-01T00:00:00Z';
async function seed(db){
 await db.query("insert into public.businesses(id,owner_id,name,slug,is_active,subscription_status,subscription_plan_key,subscription_branch_limit,subscription_expires_at) values($1,$2,'Audit business','order-safety',true,'active','custom',5,'2099-01-01')",[id(1),id(99)]);
 await db.query("insert into public.business_locations(id,business_id,name,code,is_active,plan_disable_pending) values($1,$3,'A','A',true,false),($2,$3,'B','B',true,false)",[id(2),id(3),id(1)]);
 await db.query("insert into public.business_members(id,business_id,user_id,role,is_active,team_password_required,team_revision,default_location_id) values($1,$2,$3,'owner',true,false,1,$4),($5,$2,$6,'staff',true,false,1,$4)",[id(99),id(1),id(99),id(2),id(98),id(98)]);
 await db.query("insert into public.profiles(id,full_name,is_active) values($1,'Owner',true),($2,'Staff',true)",[id(99),id(98)]);
 await db.query("insert into public.products(id,business_id,owner_id,name,stock_quantity,is_active,product_type) values($1,$3,$4,'One',10,true,'standard'),($2,$3,$4,'Two',20,true,'standard')",[id(30),id(31),id(1),id(99)]);
 await db.query("insert into public.product_location_stock(business_id,location_id,product_id,quantity) values($1,$2,$3,10),($1,$2,$4,20)",[id(1),id(2),id(30),id(31)]);
 await db.query("insert into public.orders(id,business_id,owner_id,location_id,order_number,updated_at,order_source,status,online_status,subtotal,total,remaining_balance,amount_paid,change_amount,payment_method,payment_status,discount,delivery_fee) values($1,$2,$3,$4,'AUDIT-1',$5,'online','pending','new',30,30,30,0,0,'cod','unpaid',0,0)",[id(10),id(1),id(99),id(2),V]);
 await db.query("insert into public.order_items(id,order_id,product_id,product_name,quantity,unit_price,subtotal) values($1,$3,$4,'One',1,10,10),($2,$3,$5,'Two',1,20,20)",[id(20),id(21),id(10),id(30),id(31)]);
 await identity(db,id(99),id(2));
}
async function identity(db,user,branch){
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)",[user,JSON.stringify({sub:user,role:'authenticated'}),JSON.stringify({'x-tenh-business-id':id(1),'x-tenh-branch-id':branch})]);
}
module.exports={open,seed,identity,id,V,functions,schema,quote};
