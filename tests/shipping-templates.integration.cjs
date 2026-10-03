// Disposable PostgreSQL-engine fixture. No Supabase connection or production SQL.
const {PGlite}=require(require('node:path').join(process.env.TEMP,'tenh-branch-sql-check/node_modules/@electric-sql/pglite'));
const fs=require('node:fs'),assert=require('node:assert/strict'),{loadTs}=require('./helpers/load-ts.cjs');
(async()=>{const db=new PGlite();try{
 const business='10000000-0000-4000-8000-000000000001',otherBusiness='10000000-0000-4000-8000-000000000002',branch='20000000-0000-4000-8000-000000000001',otherBranch='20000000-0000-4000-8000-000000000002',user='30000000-0000-4000-8000-000000000001';
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create table public.businesses(id uuid primary key);create table public.business_locations(id uuid primary key,business_id uuid,is_active boolean default true,plan_disable_pending boolean default false);
 insert into businesses values('${business}'),('${otherBusiness}');insert into business_locations(id,business_id) values('${branch}','${business}'),('${otherBranch}','${business}');
 create function public.tenh_request_branch(uuid) returns uuid language sql as $$select current_setting('test.branch')::uuid$$;
 create function public.tenh_assert_effective_permission(uuid,text) returns void language plpgsql as $$begin if current_setting('test.permission')<>'yes' or $1<>current_setting('test.business')::uuid or $2<>'business.update' then raise exception 'Permission denied';end if;end$$;
 create function public.tenh_assert_plan_branch(uuid,uuid) returns void language plpgsql as $$begin if current_setting('test.plan')<>'yes' then raise exception 'Plan branch unavailable';end if;end$$;
 create function public.tenh_branch_setting_visible(uuid,uuid) returns boolean language sql security definer set search_path='' as $$select auth.uid() is not null and $1=current_setting('test.business')::uuid and $2=current_setting('test.branch')::uuid and exists(select 1 from public.business_locations where id=$2 and business_id=$1 and is_active)$$;
 select set_config('test.user','${user}',false),set_config('test.business','${business}',false),set_config('test.branch','${branch}',false),set_config('test.permission','yes',false),set_config('test.plan','yes',false);`);
 const guard=fs.readFileSync('supabase/migrations/20260924011000_branch_settings.sql','utf8').match(/create or replace function public\.tenh_guard_branch_setting\(\)[\s\S]*?end\$\$;/)[0];await db.exec(guard);
 const migration=fs.readFileSync('supabase/migrations/20261003001000_shipping_custom_templates.sql','utf8');await db.exec(migration);await db.exec(migration);
 const layout=loadTs('lib/receipts/shipping-layout.ts').defaultShippingLayout('80x50'),entry=(id,name=id)=>({id,name,layout});
 const save=async(id,name,mode='create',revision=0,legacy=[])=>{const result=await db.query('select public.tenh_save_shipping_template($1,$2,$3,$4,$5,$6) as templates',[business,branch,mode,JSON.stringify(entry(id,name)),revision,JSON.stringify(legacy)]);return result.rows[0].templates;};
 const count=async()=>Number((await db.query('select jsonb_array_length(templates) as count from public.branch_shipping_templates')).rows[0].count);
 await db.exec('set role authenticated');
 const legacy=[entry('legacy')];await Promise.all([save('first','First','create',0,legacy),save('second','Second','create',0,[entry('ignored-seed')])]);
 assert.equal(await count(),3);let catalog=(await db.query('select templates from public.branch_shipping_templates')).rows[0].templates;
 assert.deepEqual(catalog.map(value=>value.id),['legacy','first','second']);assert.equal(catalog[0].revision,0);
 await Promise.all([save('first','First edited','update',1),save('second','Second edited','update',1)]);
 const edits=await Promise.allSettled([save('first','Winner A','update',2),save('first','Winner B','update',2)]);
 assert.equal(edits.filter(value=>value.status==='fulfilled').length,1);assert.match(edits.find(value=>value.status==='rejected').reason.message,/changed since/);
 const duplicates=await Promise.allSettled([save('third','Same name'),save('fourth','SAME NAME')]);assert.equal(duplicates.filter(value=>value.status==='fulfilled').length,1);assert.equal(await count(),4);
 const before=(await db.query('select templates from public.branch_shipping_templates')).rows[0].templates;
 await assert.rejects(save('first','Overwrite','create'),/identity already exists/);await assert.rejects(save('absent','Missing','update',0),/changed since/);
 await assert.rejects(db.query('update public.branch_shipping_templates set templates=$1',[JSON.stringify([])]),/permission denied/);
 await db.exec("select set_config('test.permission','no',false)");await assert.rejects(save('denied','Denied'),/Permission denied/);await db.exec("select set_config('test.permission','yes',false)");
 await assert.rejects(db.query('select public.tenh_save_shipping_template($1,$2,$3,$4,$5,$6)',[business,otherBranch,'create',JSON.stringify(entry('cross','Cross')),0,'[]']),/another branch/);
 await db.exec("select set_config('test.plan','no',false)");await assert.rejects(save('plan','Plan'),/Plan branch unavailable/);await db.exec("select set_config('test.plan','yes',false)");
 const invalid={...entry('invalid','Invalid'),layout:{...layout,elements:[{...layout.elements[0],field:'customerName',richText:[{text:''}]}]}};
 await assert.rejects(db.query('select public.tenh_save_shipping_template($1,$2,$3,$4,$5,$6)',[business,branch,'create',JSON.stringify(invalid),0,'[]']),/protected placeholders/);
 for(const badLayout of [{...layout,size:null},{...layout,elements:[{...layout.elements[0],x:100}]},{...layout,elements:[{...layout.elements[0],text:'😀'.repeat(151)}]}]){
  await assert.rejects(db.query('select public.tenh_save_shipping_template($1,$2,$3,$4,$5,$6)',[business,branch,'create',JSON.stringify({...entry('invalid','Invalid'),layout:badLayout}),0,'[]']));
 }
 assert.deepEqual((await db.query('select templates from public.branch_shipping_templates')).rows[0].templates,before);
 await db.exec(`select set_config('test.branch','${otherBranch}',false)`);assert.equal((await db.query('select * from public.branch_shipping_templates')).rows.length,0);
 await db.query('select public.tenh_save_shipping_template($1,$2,$3,$4,$5,$6)',[business,otherBranch,'create',JSON.stringify(entry('first','Winner A')),0,'[]']);assert.equal((await db.query('select * from public.branch_shipping_templates')).rows.length,1);
 await db.exec(`select set_config('test.branch','${branch}',false);reset role;update business_locations set plan_disable_pending=true where id='${branch}';set role authenticated`);
 await assert.rejects(save('closing','Closing'),/closing after a plan change/);
 await db.exec("select set_config('test.user','',false)");await assert.rejects(save('anonymous','Anonymous'),/sign in again/);
 console.log('PASS: repeatable additive migration, legacy import once, two queued creates/independent edits, conflicting revision CAS, unique branch names, denied direct writes, RLS/branch/permission/plan/anonymous guards, bounded layouts and rollback on failures.');
 console.log('LIMIT: PGlite serializes submitted queries in one local engine; independent PostgreSQL sessions/network lock contention were not exercised.');
 }finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
