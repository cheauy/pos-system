// Executes the real payload/snapshot/action code with explicit DB/cache doubles.
// SQL assertions below are structural only; integration test is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as helpers from '../lib/inventory/stock-adjustment.ts';
import {storefrontFormSnapshot} from '../lib/storefront/form-snapshot.ts';
const require=createRequire(import.meta.url),{loadTs}=require('./helpers/load-ts.cjs');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const row=(n=11,mode='increase',quantity=1,expectedQuantity=8)=>({productId:id(n),mode,quantity,expectedQuantity});
const parse=value=>helpers.parseStockAdjustmentItems(JSON.stringify(value));

test('batch parser accepts different per-item operations and sorts IDs',()=>assert.deepEqual(parse([row(12,'set',0,4),row(11,'decrease',2)]),[row(11,'decrease',2),row(12,'set',0,4)]));
for(const [label,value] of Object.entries({empty:[],object:{},null:null,tooMany:Array.from({length:501},(_,i)=>row(i+10)),duplicate:[row(),row()],badId:[{...row(),productId:'other'}],badMode:[row(11,'remove')],fraction:[row(11,'increase',1.2)],negative:[row(11,'set',-1)],zeroIncrease:[row(11,'increase',0)],zeroDecrease:[row(11,'decrease',0)],stringQty:[row(11,'increase','2')],overflow:[row(11,'set',2147483648)],negativeExpected:[row(11,'increase',1,-1)],missing:[{}]})) test(`reject malformed batch: ${label}`,()=>assert.throws(()=>parse(value)));
test('cannot sneak duplicate IDs using UUID case',()=>{const a={...row(),productId:'abcdef01-abcd-abcd-abcd-abcdefabcdef'};assert.throws(()=>parse([a,{...a,productId:a.productId.toUpperCase()}]));});
test('parser rejects oversized or broken JSON',()=>{assert.throws(()=>helpers.parseStockAdjustmentItems('x'.repeat(160001)));assert.throws(()=>helpers.parseStockAdjustmentItems('['));});
test('500-item batch is supported without remote loops',()=>assert.equal(parse(Array.from({length:500},(_,i)=>row(i+10))).length,500));
test('negative preview is visible, not clamped to zero',()=>{assert.equal(helpers.stockAfter(3,'decrease',4),-1);assert.equal(helpers.stockAfter(3,'set',0),0);assert.equal(helpers.stockAfter(3,'increase',2),5);});
test('small stock link carries branch and deduplicated product IDs',()=>{const url=new URL(helpers.stockAdjustmentLink([id(11),id(12),id(11)],id(2)),'https://test');assert.equal(url.searchParams.get('products'),[id(11),id(12)].join(','));assert.equal(url.searchParams.get('branch'),id(2));});
test('large stock selection uses tab storage instead of a very long URL',()=>{let stored;const url=new URL(helpers.stockAdjustmentLink(Array.from({length:60},(_,i)=>id(i+10)),id(2),{setItem:(key,value)=>stored={key,value}}),'https://test');assert.ok(url.searchParams.get('selection'));assert.equal(url.searchParams.get('products'),null);assert.equal(stored.key,helpers.STOCK_SELECTION_PREFIX+url.searchParams.get('selection'));assert.equal(helpers.readStockSelection(stored.value,id(2)).length,60);});
for(const [label,ids,branch] of [['empty',[],id(2)],['invalid',[id(11),'bad'],id(2)],['branch',[id(11)],'bad'],['limit',Array.from({length:501},(_,i)=>id(i+10)),id(2)]]) test(`stock link rejects ${label}`,()=>assert.throws(()=>helpers.stockAdjustmentLink(ids,branch)));
test('large stock selection fails clearly when storage is unavailable',()=>assert.throws(()=>helpers.stockAdjustmentLink(Array.from({length:31},(_,i)=>id(i+10)),id(2)),/storage/));
for(const [label,change] of Object.entries({branch:{branchId:id(3)},expired:{createdAt:0},future:{createdAt:10000000},ids:{productIds:['bad']}})) test(`selection recovery rejects ${label}`,()=>assert.throws(()=>helpers.readStockSelection(JSON.stringify({branchId:id(2),productIds:[id(11)],createdAt:4000000,...change}),id(2),4000000)));
test('form snapshot ignores field insertion order but tracks changed and removed fields',()=>{const a=new FormData(),b=new FormData();a.set('name','Shop');a.set('language','en');b.set('language','en');b.set('name','Shop');assert.equal(storefrontFormSnapshot(a),storefrontFormSnapshot(b));b.set('language','km');assert.notEqual(storefrontFormSnapshot(a),storefrontFormSnapshot(b));b.set('language','en');assert.equal(storefrontFormSnapshot(a),storefrontFormSnapshot(b));b.delete('language');assert.notEqual(storefrontFormSnapshot(a),storefrontFormSnapshot(b));});
test('snapshot detects image replacement and remove toggle',()=>{const a=new FormData();a.set('image',new File(['one'],'image.jpg',{type:'image/jpeg',lastModified:1}));const baseline=storefrontFormSnapshot(a);a.set('image',new File(['two'],'image.jpg',{type:'image/jpeg',lastModified:2}));assert.notEqual(baseline,storefrontFormSnapshot(a));a.set('remove-image','on');assert.notEqual(baseline,storefrontFormSnapshot(a));});

function fixture(options={}){
 const calls=[],permissions=[],paths=[];
 const api=loadTs('app/(dashboard)/dashboard/inventory/adjustments/actions.ts',{
  '@/lib/inventory/stock-adjustment':helpers,
  '@/lib/subscriptions/branch-limits':{assertBranchOperation:async()=>{if(options.inactive)throw Error('Inactive branch');}},
  '@/lib/branches/context':{assertOperatingBranch:async branch=>{if(branch!==id(2))throw Error('Wrong branch');}},
  '@/lib/auth/require-permission':{requirePermission:async permission=>{permissions.push(permission);if(options.denied)throw Error('Denied');return {id:id(1),slug:'shop'};}},
  '@/lib/supabase/branch-server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});if(options.throwRpc)throw Error('Connection interrupted');return {data:{items:[]},error:options.error??null};}})},
  'next/cache':{revalidatePath:path=>{paths.push(path);if(options.cacheFailure)throw Error('Cache error');}},
  './state':{initialStockAdjustmentState:{success:false,message:''}},
 });
 const form=new FormData();for(const [key,value] of Object.entries({locationId:id(2),requestId:id(80),items:JSON.stringify([row(12,'set',0),row(11,'increase',2)]),reason:'Stock count correction',notes:'Checked two shelves',reference:'COUNT-01'}))form.set(key,value);
 return {save:()=>api.submitStockAdjustmentBatch({},form),form,calls,permissions,paths};
}
test('server sends one batch RPC with branch scope, stable identity and audit reason',async()=>{const f=fixture(),result=await f.save();assert.equal(result.success,true);assert.deepEqual(f.permissions,['products.stock_adjust']);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'tenh_adjust_branch_stock_batch');assert.equal(f.calls[0].args.p_items.length,2);assert.equal(f.calls[0].args.p_request_id,id(80));assert.equal(f.calls[0].args.p_location_id,id(2));assert.match(f.calls[0].args.p_reason,/Checked two shelves/);assert.ok(f.paths.includes('/dashboard/inventory/adjustments'));});
for(const option of ['denied','inactive'])test(`server blocks ${option} before RPC`,async()=>{const f=fixture({[option]:true});assert.equal((await f.save()).success,false);assert.equal(f.calls.length,0);});
for(const [field,value] of [['locationId',id(3)],['requestId','bad'],['items','[]'],['reason','x'],['notes','x'.repeat(501)],['reference','x'.repeat(201)]]) test(`server rejects invalid ${field} before RPC`,async()=>{const f=fixture();f.form.set(field,value);assert.equal((await f.save()).success,false);assert.equal(f.calls.length,0);});
test('missing migration gives actionable message and is not uncertain',async()=>{const f=fixture({error:{code:'PGRST202',message:'missing'}}),r=await f.save();assert.equal(r.success,false);assert.equal(r.uncertain,false);assert.match(r.message,/20260929001000/);});
test('SQL validation failure is a confirmed failure, not an unsafe retry',async()=>{const r=await fixture({error:{code:'P0001',message:'Not enough stock'}}).save();assert.equal(r.uncertain,false);assert.match(r.message,/Not enough/);});
test('network interruption preserves uncertain status for identity-safe retry',async()=>assert.equal((await fixture({throwRpc:true}).save()).uncertain,true));
test('post-commit cache errors never turn successful stock save into failure',async()=>assert.equal((await fixture({cacheFailure:true}).save()).success,true));

const migration=readFileSync('supabase/migrations/20260929001000_product_delete_and_batch_stock.sql','utf8');
test('migration keeps the original update branch of product trigger byte-for-byte',()=>{const original=readFileSync('supabase/migrations/20260924012000_branch_product_details.sql','utf8');const tail=s=>s.slice(s.indexOf(' if new.id is distinct'),s.indexOf('end$$;',s.indexOf(' if new.id is distinct')));assert.equal(tail(migration),tail(original));});
test('migration structurally contains locked current-branch zeroing, ledger, archive and history-safe identity',()=>{const deletion=migration.slice(0,migration.indexOf('-- One RPC'));assert.match(deletion,/products.disable/);assert.match(deletion,/for update/);assert.match(deletion,/product_location_stock set quantity=0/);assert.match(deletion,/stock_adjustments/);assert.match(deletion,/branch_archived=true/);assert.doesNotMatch(deletion,/delete from public\.products|Set branch stock to zero/);});
test('batch SQL includes permission, retry payload, duplicate and per-item validation without exception-swallowing',()=>{const batch=migration.slice(migration.indexOf('-- One RPC'));assert.match(batch,/products.stock_adjust/);assert.match(batch,/v_saved.payload is distinct from v_payload/);assert.match(batch,/having count\(\*\)>1/);assert.match(batch,/tenh_adjust_branch_stock\(/);assert.doesNotMatch(batch,/exception\s+when/i);assert.match(batch,/revoke all.*from public,anon/);});
test('storefront fills images, header has save target and public-store button is secondary',()=>{const css=readFileSync('app/_sites/[slug]/storefront.css','utf8');assert.match(css,/\.product-photo>img\s*\{[^}]*object-fit:\s*cover/s);const page=readFileSync('app/(dashboard)/dashboard/online-store/online-store-page.tsx','utf8');assert.match(page,/id="storefront-save-slot"/);const label=page.indexOf('Open Public Store');const button=page.slice(page.lastIndexOf('<a',label),label);assert.match(button,/bg-white/);assert.doesNotMatch(button,/bg-blue-600/);});
