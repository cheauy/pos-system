/* eslint-disable @typescript-eslint/no-require-imports -- Opt-in disposable PostgreSQL subprocesses only. */
// No connection URL, app environment file, credentials, or existing server is used.
// TENH_TEST_PG_BIN must point to ALREADY INSTALLED initdb/pg_ctl/psql binaries.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn}=require('node:child_process');
const bin=process.env.TENH_TEST_PG_BIN;
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
function executable(name){return path.join(bin,name+(process.platform==='win32'?'.exe':''));}
function command(name,args){return new Promise((resolve,reject)=>{
 const p=spawn(executable(name),args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let out='';
 p.stdout.on('data',x=>{out+=x;});p.stderr.on('data',x=>{out+=x;});p.on('error',reject);
 p.on('exit',code=>code===0?resolve(out):reject(new Error(name+' exited '+code+': '+out)));
});}
async function freePort(){const s=net.createServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;}
function session(port,label){
 const p=spawn(executable('psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres'],{windowsHide:true,shell:false});
 let buffer='',errors='',pending=null,seq=0;
 p.stdout.on('data',chunk=>{buffer=(buffer+chunk).replace(/\r\n/g,'\n');if(pending){const at=buffer.indexOf(pending.marker+'\n');if(at>=0){const output=buffer.slice(0,at).trim();buffer=buffer.slice(at+pending.marker.length+1);const job=pending;pending=null;clearTimeout(job.timer);job.resolve(output);}}});
 p.stderr.on('data',chunk=>{errors+=chunk;});
 const failed=error=>{if(pending){const job=pending;pending=null;clearTimeout(job.timer);job.reject(error);}};
 p.on('error',failed);p.on('exit',code=>failed(new Error(label+' psql exited '+code+': '+errors)));
 return {run(sql){assert.equal(pending,null,'One command per session at a time');return new Promise((resolve,reject)=>{const marker='TENH_DONE_'+label+'_'+(++seq);const timer=setTimeout(()=>{failed(new Error(label+' command exceeded 10s'));p.kill();},10000);pending={marker,resolve,reject,timer};p.stdin.write(sql+'\n\\echo '+marker+'\n');});},close(){p.stdin.end('\\q\n');},kill(){p.kill();}};
}
test('real sessions: A import scope permits B sale, blocks A sale, and sorts bulk scopes',{
 skip:!bin?'UNVERIFIED: set TENH_TEST_PG_BIN to existing binaries; no infrastructure is installed.':false,timeout:60000
},async()=>{
 for(const name of ['initdb','pg_ctl','psql'])assert.ok(fs.existsSync(executable(name)),name+' must already be installed');
 const tempBase=path.resolve(process.env.TEMP||os.tmpdir()),root=fs.mkdtempSync(path.join(tempBase,'tenh-tenant-concurrent-')),data=path.join(root,'data');
 const port=await freePort();let started=false;const clients=[];
 try{
  await command('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);
  await command('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
  const observer=session(port,'observer'),holder=session(port,'holder'),saleB=session(port,'saleB'),saleA=session(port,'saleA');clients.push(observer,holder,saleB,saleA);
  const proposal=fs.readFileSync('docs/proposed/20261012_barcode_tenant_coordinator_v3.PROPOSED.sql','utf8');
  const core=proposal.split('-- BEGIN TESTABLE COORDINATOR CORE')[1].split('-- END TESTABLE COORDINATOR CORE')[0];
  await observer.run(`create role anon;create role authenticated;create role service_role;create table businesses(id uuid primary key);insert into businesses values('${A}'),('${B}');${core}
   create table synthetic_sales(id integer primary key,business_id uuid references businesses,order_code text unique);
   create trigger scope_statement before insert or update or delete on synthetic_sales for each statement execute function tenh_barcode_v3_private.require_statement_scope();
   create trigger scope_row before insert or update or delete on synthetic_sales for each row execute function tenh_barcode_v3_private.require_row_scope();`);
  const aPid=Number(await saleA.run('select pg_backend_pid();'));
  await holder.run(`begin;select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[]);`);
  await saleB.run(`begin;select tenh_barcode_v3_private.enter_scope(array['${B}']::uuid[]);insert into synthetic_sales values(2,'${B}','100000000002');commit;`);
  assert.equal(await observer.run('select count(*) from synthetic_sales;'),'1'); // Holder A has not committed.
  let settled=false;
  const waiting=saleA.run(`begin;select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[]);insert into synthetic_sales values(1,'${A}','100000000001');commit;`).finally(()=>{settled=true;});
  // Attach a rejection handler immediately so a timeout cannot be unhandled.
  waiting.catch(()=>{});
  const deadline=Date.now()+4000;let blocked=false;
  while(Date.now()<deadline){if(await observer.run(`select coalesce((select wait_event_type='Lock' from pg_stat_activity where pid=${aPid}),false);`)==='t'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
  assert.equal(blocked,true,'A sale must wait on the held tenant mutex');assert.equal(settled,false);
  await holder.run('commit;');await waiting;
  assert.equal(await observer.run('select string_agg(order_code,\',\' order by id) from synthetic_sales;'),'100000000001,100000000002');
  // Opposite input orders cannot cause opposite lock acquisition orders.
  await holder.run(`begin;select tenh_barcode_v3_private.enter_scope(array['${B}','${A}']::uuid[]);`);
  const bulk=saleA.run(`begin;select tenh_barcode_v3_private.enter_scope(array['${A}','${B}']::uuid[]);commit;`);bulk.catch(()=>{});
  blocked=false;const bulkDeadline=Date.now()+4000;
  while(Date.now()<bulkDeadline){if(await observer.run(`select coalesce((select wait_event_type='Lock' from pg_stat_activity where pid=${aPid}),false);`)==='t'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
  assert.equal(blocked,true);await holder.run('commit;');await bulk;
  assert.equal(await observer.run('select tenh_barcode_contract_v3_ready();'),'f');
 }finally{
  for(const client of clients)client.kill();
  if(started)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  // Verify the resolved deletion target stays inside the intended temp parent.
  const resolved=path.resolve(root),relative=path.relative(tempBase,resolved);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(resolved).startsWith('tenh-tenant-concurrent-'));
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
