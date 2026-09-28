import type {SupabaseClient} from '@supabase/supabase-js';
import {loadUsersWorkspace} from '@/app/(dashboard)/dashboard/settings/users/users-workspace-actions';
import {getBranchEntitlement} from '@/lib/subscriptions/branch-limits';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {subscriptionPlans,type SubscriptionPlanKey} from '@/lib/subscriptions/plans';

export const accountAccess={'account-users':'users.view','account-branches':'locations.manage','account-categories':'categories.manage'} as const;
export async function mobileAccountRead(db:SupabaseClient,feature:string,business:{id:string;name:string;role:string},branchId:string,user:{id:string;email?:string;user_metadata?:Record<string,unknown>}){
 if(feature==='account-subscription'){
  const [planResult,members,branches]=await Promise.all([
   supabaseAdmin.from('businesses').select('*').eq('id',business.id).single(),
   supabaseAdmin.from('business_members').select('id',{count:'exact',head:true}).eq('business_id',business.id).eq('is_active',true),
   getBranchEntitlement(business.id),
  ]);
  if(planResult.error||!planResult.data||members.error)throw new Error('Unable to load subscription details.');
  const b=planResult.data,plan=subscriptionPlans[b.subscription_plan_key as SubscriptionPlanKey];
  return {rows:[{id:business.id,name:business.name,planName:plan?.name||(b.subscription_status==='trial'?'Trial':'Current plan'),description:plan?.description||'',status:b.subscription_status,expiresAt:b.subscription_expires_at,usersUsed:members.count??0,userLimit:Math.max(1,Number(b.subscription_user_limit)||1),branchesUsed:branches.used,branchLimit:branches.limit,teamEnabled:plan?.teamEnabled??Number(b.subscription_user_limit)>1}]};
 }
 if(feature==='account-profile'){
  const result=await db.from('profiles').select('full_name').eq('id',user.id).maybeSingle();
  if(result.error)throw new Error('Unable to load your profile.');
  return {rows:[{id:user.id,name:result.data?.full_name||user.email||'Profile',email:user.email,avatarUrl:typeof user.user_metadata?.avatar_url==='string'?user.user_metadata.avatar_url:null,business:business.name,role:business.role}]};
 }
 if(feature==='account-users'){
  const result=await loadUsersWorkspace(business.id);if(!result.success)throw new Error(result.message);
  return {rows:result.data.rows.map(row=>({...row,branch:result.data.branches.find(branch=>branch.id===row.branchId)?.name||'Unassigned'})),summary:`${result.data.seatsUsed} / ${result.data.seatLimit} users`};
 }
 if(feature==='account-branches'){
  let query=db.from('business_locations').select('id,name,code,phone,address,city,timezone,is_active,is_default,notes').eq('business_id',business.id);
  // Staff keep their assigned branch, including on these new management lists.
  if(business.role!=='owner')query=query.eq('id',branchId);
  const result=await query.order('name').limit(501);
  if(result.error)throw new Error('Unable to load branches.');
  if(result.data.length>500)throw new Error('Open the website to view this large branch list.');
  const entitlement=business.role==='owner'?await getBranchEntitlement(business.id):null;
  return {rows:result.data,summary:entitlement?`${entitlement.used} / ${entitlement.limit} active branches`:undefined};
 }
 if(feature==='account-categories'){
  const result=await db.from('categories').select('id,name,description,is_online,online_sort_order,branch_ids').eq('business_id',business.id).or(`branch_ids.is.null,branch_ids.cs.{${branchId}}`).order('online_sort_order').order('name').limit(501);
  if(result.error)throw new Error('Unable to load categories.');
  if(result.data.length>500)throw new Error('Open the website to view this large category list.');
  const products=new Map<string,Set<string>>();
  // ponytail: O(branch catalog size) identity scan; replace with a grouped database count if large catalogs make it slow.
  if(result.data.length)for(let offset=0;;offset+=1000){
   const batch=await db.from('branch_products').select('id,variant_group_id,category_id').eq('business_id',business.id).eq('location_id',branchId).order('id').range(offset,offset+999);
   if(batch.error)throw new Error('Unable to load category product counts.');
   for(const product of batch.data){if(!product.category_id)continue;const ids=products.get(product.category_id)||new Set<string>();ids.add(product.variant_group_id?`variant:${product.variant_group_id}`:product.id);products.set(product.category_id,ids);}
   if(batch.data.length<1000)break;
  }
  return {categoryStats:{total:result.data.length,visible:result.data.filter(row=>row.is_online).length,hidden:result.data.filter(row=>!row.is_online).length},rows:result.data.map(row=>({...row,productCount:products.get(row.id)?.size||0,branches:row.branch_ids===null?'All branches':`${row.branch_ids.length} selected branches`}))};
 }
 throw new Error('Unknown account menu.');
}
