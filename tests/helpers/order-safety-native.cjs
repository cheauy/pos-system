/* eslint-disable @typescript-eslint/no-require-imports */
// Creates and stops only its own fresh local cluster. Never accepts a database URL.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawnSync}=require('node:child_process');
const {functions,schema,quote,seed,identity,id}=require('./order-safety-db.cjs');
const enforcement=JSON.parse(fs.readFileSync('tests/fixtures/order-safety-enforcement-live-20261008.json','utf8'));
const relations=[...schema.relations,...enforcement.relations];
async function openNative(){
 const bin=process.env.TENH_POSTGRES_BIN;
 if(!bin)throw new Error('BLOCKED: set TENH_POSTGRES_BIN to local PostgreSQL binaries; no database URL is accepted.');
 const suffix=process.platform==='win32'?'.exe':'';
 for(const name of ['initdb','pg_ctl','postgres'])if(!fs.existsSync(path.join(bin,name+suffix)))throw new Error('BLOCKED: missing '+name);
 const pgPath=process.env.TENH_PG_PATH;
 if(!pgPath)throw new Error('BLOCKED: set TENH_PG_PATH to a test-only pg driver directory.');
 const {Client}=require(pgPath);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tenh-order-safety-native-'));
 const data=path.join(directory,'data');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.toUpperCase().startsWith('PG')));
 const run=(name,args)=>{
  fs.appendFileSync(path.join(directory,'lifecycle.log'),name+'\n');
  const output=fs.openSync(path.join(directory,'lifecycle.log'),'a');
  let r;
  try{r=spawnSync(path.join(bin,name+suffix),args,{env,stdio:['ignore',output,output],windowsHide:true,timeout:60000});}
  finally{fs.closeSync(output);}
  if(r.error||r.status!==0)throw r.error||new Error(name+' failed; see '+directory);
 };
 const probe=net.createServer();
 await new Promise((ok,fail)=>probe.once('error',fail).listen(0,'127.0.0.1',ok));
 const port=probe.address().port;
 await new Promise(ok=>probe.close(ok));
 const clients=[];
 let started=false;
 const close=async()=>{
  for(const c of clients)await c.end().catch(()=>{});
  if(started){run('pg_ctl',['-D',data,'-w','stop','-m','fast']);started=false;}
 };
 try{
  run('initdb',['-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']);
  fs.appendFileSync(path.join(data,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport="+port+"\nmax_connections=10\n");
  // PostgreSQL startup on Windows needs a file-backed log, not inherited pipes.
  started=true;
  run('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-w','start']);
  const connect=async()=>{
   const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000});
   await c.connect();clients.push(c);
   await c.query("set statement_timeout='10s';set lock_timeout='8s';");
   c.exec=sql=>c.query(sql);
   return c;
  };
  const db=await connect();
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;set check_function_bodies=off');
  for(const t of schema.enums)await db.exec('create type '+quote(t.schema)+'.'+quote(t.name)+' as enum ('+t.labels.map(l=>"'"+l.replaceAll("'","''")+"'").join(',')+')');
  for(const t of relations.filter(t=>t.kind==='r')){
   const columns=t.columns.map(c=>quote(c.name)+' '+c.type+(c.generated==='s'?' generated always as ('+c.default+') stored':c.default?' default '+c.default:'')+(c.not_null?' not null':''));
   await db.exec('create table '+quote(t.schema)+'.'+quote(t.name)+' ('+columns.join(',')+')');
  }
  for(const f of [...functions,...enforcement.functions])await db.exec(f.definition);
  for(const v of schema.relations.filter(t=>t.kind==='v'))await db.exec('create view '+quote(v.schema)+'.'+quote(v.name)+' as '+v.view_definition);
  for(const constraintType of ['p','u','c'])for(const t of relations.filter(t=>t.kind==='r'))for(const c of (t.constraints||[]).filter(c=>c.type===constraintType)){
   await db.exec('alter table '+quote(t.schema)+'.'+quote(t.name)+' add constraint '+quote(c.name)+' '+c.definition);
  }
  for(const index of enforcement.indexes)await db.exec(index.definition);
  for(const c of enforcement.uniqueConstraints){
   if(relations.find(t=>t.name===c.table_name).constraints.some(k=>k.name===c.name))continue;
   await db.exec('alter table public.'+quote(c.table_name)+' add constraint '+quote(c.name)+' '+c.definition);
  }
  for(const t of relations.filter(t=>t.kind==='r'))for(const c of (t.constraints||[]).filter(c=>c.type==='f')){
   try{await db.exec('alter table '+quote(t.schema)+'.'+quote(t.name)+' add constraint '+quote(c.name)+' '+c.definition);}
   catch(e){throw new Error(t.name+'.'+c.name+': '+c.definition,{cause:e});}
  }
  for(const f of [...functions,...enforcement.functions]){
   const sig=f.schema==='auth'?f.signature:'public.'+f.signature.replace(/^public\./,'');
   await db.exec('revoke all on function '+sig+' from public');
   if(f.acl===null||/(?:\{|,)=X/.test(f.acl))await db.exec('grant execute on function '+sig+' to public');
   for(const role of ['anon','authenticated','service_role'])if(f.acl===null||new RegExp('(?:\\{|,)'+role+'=X').test(f.acl))await db.exec('grant execute on function '+sig+' to '+role);
  }
  await db.exec('grant usage on schema public,auth to authenticated,service_role;grant all on all tables in schema public to authenticated,service_role');
  for(const p of enforcement.policies){
   await db.exec('alter table public.'+quote(p.tablename)+' enable row level security');
   const roles=p.roles.replace(/[{}]/g,'').split(',').map(quote).join(',');
   await db.exec('create policy '+quote(p.policyname)+' on public.'+quote(p.tablename)+' as '+p.permissive+' for '+p.cmd+' to '+roles+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':''));
  }
  for(const t of enforcement.triggers){
   await db.exec(t.function);await db.exec(t.definition);
  }
  const reseed=async()=>{
   await db.exec('reset role');
   const tables=relations.filter(t=>t.kind==='r').map(t=>quote(t.schema)+'.'+quote(t.name));
   await db.exec('truncate '+tables.join(',')+' cascade');
   await identity(db,id(99),id(2));
   await db.query('insert into auth.users(id) values($1),($2),($3)',[id(99),id(98),id(77)]);
   await seed(db);
  };
  await reseed();
  console.log('LOCAL PostgreSQL cluster: '+directory+' (127.0.0.1:'+port+')');
  return {db,connect,reseed,close,directory};
 }catch(e){await close();throw e;}
}
module.exports={openNative};
