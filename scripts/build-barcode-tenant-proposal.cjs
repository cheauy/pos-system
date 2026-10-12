/* eslint-disable @typescript-eslint/no-require-imports -- Local deterministic proposal builder; no database access. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const md5=value=>crypto.createHash('md5').update(value.replaceAll('\r','')).digest('hex');
function beginPosition(body){
 const tokens=/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\bbegin\b/gi;let match;
 while((match=tokens.exec(body)))if(/^begin$/i.test(match[0]))return match.index;
 throw new Error('No unquoted outer BEGIN');
}
const functions=new Map();
function collect(sql,file){
 const start=/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi;let hit;
 while((hit=start.exec(sql))){
  let i=start.lastIndex,depth=1,inQuote=false;
  for(;i<sql.length&&depth;i++){const ch=sql[i];if(ch==="'"){if(inQuote&&sql[i+1]==="'"){i++;continue;}inQuote=!inQuote;}if(!inQuote){if(ch==='(')depth++;if(ch===')')depth--;}}
  const args=sql.slice(start.lastIndex,i-1),tail=sql.slice(i),delimiter=/\bas\s+(\$\w*\$)/i.exec(tail);
  if(!delimiter)continue;
  const bodyStart=i+delimiter.index+delimiter[0].length,bodyEnd=sql.indexOf(delimiter[1],bodyStart);
  if(bodyEnd<0)throw new Error('Missing body delimiter: '+file+' '+hit[1]);
  const definition=sql.slice(hit.index,bodyEnd+delimiter[1].length),body=sql.slice(bodyStart,bodyEnd);
  // All selected writer signatures use scalar defaults. Parenthesized defaults
  // are split using depth/quote-aware scanning, rather than a naive comma split.
  const parts=[];let from=0,nesting=0,quoted=false;
  for(let n=0;n<=args.length;n++){const ch=args[n];if(ch==="'"){if(quoted&&args[n+1]==="'"){n++;continue;}quoted=!quoted;}if(!quoted){if(ch==='(')nesting++;if(ch===')')nesting--;if((ch===','&&nesting===0)||n===args.length){parts.push(args.slice(from,n).trim());from=n+1;}}}
  const params=parts.filter(Boolean).map(arg=>{const bare=arg.split(/\s+default\s+|\s+=\s+/i)[0].trim();const words=bare.split(/\s+/);return {name:words.shift(),type:words.join(' ')};});
  functions.set(hit[1],{name:hit[1],signature:'public.'+hit[1]+'('+params.map(x=>x.type).join(',')+')',params,body,definition,file,bodyOffset:bodyStart-hit.index,bodyEndOffset:bodyEnd-hit.index});
  start.lastIndex=bodyEnd+delimiter[1].length;
 }
}
function collectJson(value,file){if(Array.isArray(value)){for(const row of value)collectJson(row,file);}else if(value&&typeof value==='object'){for(const [key,item]of Object.entries(value)){if(key==='definition'&&typeof item==='string')collect(item,file);else if(typeof item==='object')collectJson(item,file);}}}
for(const file of ['branch-catalog-pos-functions.sql','branch-extra-functions.sql','branch-import-functions.sql','branch-purchase-functions.sql'])collect(read('tests/fixtures/'+file),'tests/fixtures/'+file);
for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())collect(read('supabase/migrations/'+file),'supabase/migrations/'+file);
for(const file of ['shared-storefront-checkout.json','packed-bundle-functions.json','order-safety-live-20261008.json','order-safety-callers-live-20261008.json','order-safety-dependencies-live-20261008.json'])collectJson(JSON.parse(read('tests/fixtures/'+file)),'tests/fixtures/'+file);
collect(read('docs/proposed/20261005_edit_product_rows_v2.PROPOSED.sql'),'docs/proposed/20261005_edit_product_rows_v2.PROPOSED.sql');
const selected=['tenh_edit_product_rows','tenh_import_business_safe','tenh_mobile_management','tenh_pos_checkout','tenh_pos_checkout_registered','tenh_pos_checkout_before_currency','checkout_order_with_options','tenh_pos_allocate_stock','tenh_pos_hold','place_branch_online_order','place_online_order','cancel_order','cancel_purchase','create_order_return','receive_purchase_order','tenh_create_order_return_accounted','tenh_run_branch_stock','tenh_cancel_order_item','tenh_manage_order','tenh_incoming_order_action','tenh_update_online_order_status','assign_pos_order_to_location','post_customer_credit','tenh_create_packed_bundle','tenh_pack_bundle','tenh_manage_bundle','tenh_edit_bundle_contents','import_branch_inventory_safe','tenh_create_packed_bundle_with_image','tenh_adjust_branch_stock','tenh_adjust_branch_stock_batch'];
const adapters=[];const unsupported=[];
for(const name of selected){
 const fn=functions.get(name);if(!fn){unsupported.push({name,reason:'No permitted source definition found'});continue;}
 if(!/language\s+plpgsql/i.test(fn.definition)){unsupported.push({name,file:fn.file,reason:'Non-PLpgSQL delegate; inherits scope from reviewed caller or fails guarded DML'});continue;}
 let body=fn.body;
 // The composed v2 stage modifies these bodies before the adapter stage.
 if(name==='tenh_edit_product_rows')body=body
  .replaceAll("barcode=case when vals ? 'barcode' then nullif(btrim(patch.barcode),'') else priors->row_id::text->>'barcode' end","barcode=case when vals ? 'barcode' and patch.barcode is not null and patch.barcode<>'' then patch.barcode else priors->row_id::text->>'barcode' end")
  .replaceAll("set sku='~tenh-edit-'||v.id::text, barcode=null","set sku='~tenh-edit-'||v.id::text, barcode=case when v.barcode='' then v.barcode else null end")
  .replaceAll("coalesce(nullif(btrim(value->'values'->>'barcode'),''), nullif(btrim(priors->(value->>'id')->>'barcode'),'')) b","lower(coalesce(nullif(value->'values'->>'barcode',''), nullif(priors->(value->>'id')->>'barcode',''))) b")
  .replaceAll("perform public.tenh_assert_effective_permission(p_business,'products.update');","perform public.tenh_assert_effective_permission(p_business,'products.update'); perform public.tenh_barcode_writer_lock(p_business);");
 if(name==='tenh_import_business_safe')body=body.replaceAll('perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));','perform public.tenh_barcode_writer_lock(p_business_id); perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));');
 if(name==='tenh_mobile_management')body=body.replaceAll("barcode=coalesce(nullif(item->>'barcode',''),item->>'sku')","barcode=case when item ? 'barcode' and item->>'barcode'<>'' then item->>'barcode' else product.barcode end")
  .replaceAll('perform public.tenh_assert_effective_permission(p_business_id,permission);',"perform public.tenh_assert_effective_permission(p_business_id,permission); if p_operation in ('product-create','product-edit','bundle-create','bundle-edit','bundle-toggle','bundle-delete') then perform public.tenh_barcode_writer_lock(p_business_id); end if;");
 const expected=md5(body);let changed=body.replaceAll('public.tenh_barcode_writer_lock(', 'public.tenh_barcode_enter_business_v3(');
 let entry;
 const business=fn.params.find(x=>/^p_business(?:_id)?$/.test(x.name));
 if(business)entry='perform public.tenh_barcode_enter_business_v3('+business.name+');';
 else if(name==='place_branch_online_order'||name==='place_online_order')entry="if coalesce(auth.role(),'')<>'service_role' then raise exception 'Online creation requires reviewed service entry.' using errcode='42501';end if; perform public.tenh_barcode_enter_business_v3((select id from public.businesses where slug=p_business_slug and is_active));";
 else{
  const entity=fn.params.find(x=>['p_order_id','p_purchase_id','p_purchase_order_id'].includes(x.name));
  if(entity){const table=entity.name==='p_order_id'?'orders':entity.name==='p_purchase_id'?'purchases':'purchase_orders';entry='perform public.tenh_barcode_enter_business_v3((select business_id from public.'+table+' where id='+entity.name+'));';}
 }
 if(!entry){unsupported.push({name,file:fn.file,reason:'No proven entry ownership parameter'});continue;}
 if(name==='tenh_import_business_safe'){
  const tableLoop="for t in select unnest(tables) order by 1 loop\r\n  execute format('lock table public.%I in share row exclusive mode',t);\r\n end loop;";
  const normalized=changed.replaceAll('\r','');const wanted=tableLoop.replaceAll('\r','');
  if(!normalized.includes(wanted))throw new Error('Import table lock loop drift');
  changed=normalized.replace(wanted,'-- Tenant snapshot protected by all guarded writer entries; no table lock.');
  const sharedLock='lock table public.branch_product_details,public.branch_receipt_settings,public.branch_customer_settings,public.branch_pos_settings in share row exclusive mode;';
  if(!changed.includes(sharedLock))throw new Error('Import shared table lock drift');
  changed=changed.replace(sharedLock,'-- Shared branch datasets inherit the verified tenant scope.').replace('perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));','-- Tenant mutex already held.');
 }
 if(name==='import_branch_inventory_safe')changed=changed.replace(/perform pg_advisory_xact_lock\(hashtextextended\(p_business_id::text,\s*9616\)\);/g,'-- Exact tenant mutex is already held; no legacy hash coordinator.');
 if(!/\bbegin\b/i.test(changed))throw new Error('No outer BEGIN: '+name);
 const begin=beginPosition(changed)+5;
 changed=changed.slice(0,begin)+'\n  '+entry+' -- v3 entry precedes original locks; original permissions/revisions remain.\n'+changed.slice(begin);
 adapters.push({...fn,expected,patchedBody:changed});
}
const evidence={protocol:3,activation:'BLOCKED',adapters:adapters.map(({name,signature,file,expected})=>({name,signature,file,expectedBodyMd5:expected})),unsupported};
const v2=read('docs/proposed/20261012_barcode_preservation_v2.PROPOSED.sql');
// Compose, rather than edit historical v2. Its temporary installation locks end
// with this transaction. The final installed writers contain no global mutex.
let sql='-- PROPOSED ONLY v3 successor. Generated locally; DO NOT APPLY without separate target review.\n-- Requires the reviewed batch editor; replaces v1/v2, never apply both.\n-- Both readiness probes end FALSE until missing target/real-session evidence is reviewed.\n'+v2.slice(0,v2.lastIndexOf("notify pgrst,'reload schema';"));
sql+='\n-- BEGIN V3 SUCCESSOR ADAPTER STAGE\n'+read('docs/proposed/20261012_barcode_tenant_v3_core.sql')+'\n';
for(const fn of adapters){
 sql+=`-- ${fn.name}: ${fn.file}\ndo $patch$ declare source text;body text;begin\n if to_regprocedure(${quote(fn.signature)}) is not null then\n  if not exists(select 1 from pg_catalog.pg_proc where oid=${quote(fn.signature)}::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: ${fn.name}';end if;\n  select prosrc into body from pg_catalog.pg_proc where oid=${quote(fn.signature)}::regprocedure;\n  if md5(replace(body,chr(13),''))<>${quote(fn.expected)} then raise exception 'Reviewed writer body differs: ${fn.name}';end if;\n  source:=pg_get_functiondef(${quote(fn.signature)}::regprocedure);\n  execute replace(source,body,${quote(fn.patchedBody)});\n end if;\nend $patch$;\n`;
}
// Replace private v2 global assertions with exact tenant checks, preserving
// every existing alias/preservation function's remaining reviewed body.
for(const [signature,tenant]of [['public.tenh_claim_product_identifier(uuid,uuid,uuid,text,text)','p_business'],['public.tenh_allocate_product_identifier(uuid)','p_business'],['public.tenh_preserve_product_barcode()','new.business_id'],['public.tenh_preserve_branch_barcode()','new.business_id'],['public.tenh_capture_product_identifiers()','new.business_id'],['public.tenh_capture_order_identifiers()','new.business_id']]){
 sql+=`do $patch$ declare source text;begin\n source:=pg_get_functiondef(${quote(signature)}::regprocedure);\n source:=replace(source,'perform public.tenh_barcode_lock_required();',${quote('perform tenh_barcode_v3_private.require_scope('+tenant+');')});\n source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\\(pg_catalog.hashtextextended\\(''tenh-(product|order)-identifiers:''\\|\\|[^;]+;','','g');\n execute source;\nend $patch$;\n`;
}
sql+=`create or replace function public.tenh_new_order_code() returns text language plpgsql volatile security definer set search_path='' as $$
declare candidate text;begin
 if not tenh_barcode_v3_private.scope_exists() then raise exception 'Order allocation requires verified tenant entry.' using errcode='42501';end if;
 loop candidate:=(100000000000+floor(random()*900000000000))::bigint::text;
  exit when not exists(select 1 from public.orders where order_code=candidate) and not exists(select 1 from public.tenh_order_identifiers where lookup_key=candidate);
 end loop;return candidate;
end $$;
revoke all on function public.tenh_new_order_code() from public,anon,authenticated,service_role;
-- True same-code races are rejected by the existing global unique index. Only
-- an unsaved idempotent request can be retried; saved identifiers never change.
`;
const tables=JSON.parse(read('tests/fixtures/branch-catalog-tables.json'));
const allowed=/allowed text\[\]:=array\[([^\]]+)\]/.exec(functions.get('tenh_import_business_safe').body)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1));
const parents={order_items:['orders','order_id'],product_variants:['products','product_id'],purchase_items:['purchases','purchase_id'],return_items:['returns','return_id']};
const ownership=[];
for(const name of [...new Set([...allowed,'business_import_requests','data_transfer_jobs'])]){
 const schema=tables.find(x=>x.name===name);let tenantField=name==='businesses'?'id':schema&&/(^|,)business_id uuid(,|$)/.test(schema.columns)?'business_id':null;
 if(['business_import_requests','data_transfer_jobs','branch_product_details','branch_receipt_settings','branch_customer_settings','branch_pos_settings','branch_bundle_recipes','branch_role_permissions','branch_notification_role_settings'].includes(name))tenantField='business_id';
 const parent=parents[name];if(!tenantField&&!parent){unsupported.push({name,reason:'Snapshot ownership absent from recorded schema; install requires explicit route review'});continue;}
 ownership.push({name,tenantField,parent:parent||null});
 sql+=`do $guard$ begin
 if to_regclass('public.${name}') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.${name}'::regclass and attname=${quote(tenantField||parent[1])} and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: ${name}';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.${name}'::regclass,${tenantField?quote(tenantField):'null'},${parent?quote('public.'+parent[0])+'::regclass':'null'},${parent?"'id'":'null'},${parent?quote(parent[1]):'null'});
  execute 'drop trigger if exists tenh_barcode_coordinator on public.${name}';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.${name}';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.${name} for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.${name} for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
`;
}
// INSTEAD OF view delegates already assert branch permissions; establish proof
// before the view handler locks underlying rows. Its rows have business_id.
sql+=`drop trigger tenh_barcode_coordinator on public.branch_products;
create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_products for each statement execute function tenh_barcode_v3_private.statement_entry();
drop function public.tenh_barcode_branch_lock_required();
drop function public.tenh_barcode_statement_lock();
drop function public.tenh_barcode_writer_lock(uuid);
drop function public.tenh_barcode_lock_required();
drop function public.tenh_barcode_catalog_lock();
create or replace function public.tenh_barcode_contract_v2_ready() returns boolean language sql security definer set search_path='' as $$select false$$;
create function public.tenh_barcode_contract_v3_ready() returns boolean language sql security definer set search_path='' as $$select false$$;
revoke all on function public.tenh_barcode_contract_v3_ready() from public,anon;
grant execute on function public.tenh_barcode_contract_v3_ready() to authenticated,service_role;
revoke all on all functions in schema tenh_barcode_v3_private from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
`;
evidence.ownership=ownership;evidence.unsupported=unsupported;
const output='docs/proposed/20261012_barcode_preservation_v3.PROPOSED.sql';
if(require.main===module){
 fs.writeFileSync(path.join(root,output),sql);
 fs.writeFileSync(path.join(root,'docs/proposed/20261012_barcode_v3_writer_manifest.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({output,adapters:adapters.length,ownership:ownership.length,unsupported:unsupported.map(x=>x.name)}));
}
module.exports={sql,evidence,adapters,functions,beginPosition};
