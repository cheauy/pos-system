'use server';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRolePermissions } from '@/lib/auth/effective-permissions';
import { permissions, normalizePermissionSelection, type Permission } from '@/lib/auth/permissions';
import type { BusinessRole } from '@/lib/business/types';
import { revalidatePath } from 'next/cache';
import { getBranchContext } from '@/lib/branches/context';

async function owner(businessId:string) {
 const business=await requirePermission('users.view');
 if(business.id!==businessId || business.role!=='owner')throw new Error('Only the Owner can customize user permissions.');
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)throw new Error('Sign in again.');return user;
}
export async function loadMemberPermissions(businessId:string,memberId:string) {
 await owner(businessId);
 const branchId=(await getBranchContext()).branchId;
 const {data:m,error}=await supabaseAdmin.from('business_members').select('id,role,team_revision,default_location_id').eq('id',memberId).eq('business_id',businessId).eq('default_location_id',branchId).maybeSingle();
 if(error||!m)throw new Error('User not found.');
 const baseline=await getRolePermissions(businessId,m.role as BusinessRole,branchId);
 const result=await supabaseAdmin.from('business_member_permissions').select('permission,enabled').eq('member_id',memberId);
 if(result.error)throw new Error('Unable to load permissions. Apply the user-permissions migration.');
 const overrides=new Map<string,boolean>((result.data??[]).map(r=>[r.permission,r.enabled]));
 return {revision:m.team_revision as number,role:m.role as BusinessRole,custom:overrides.size>0,baseline,
  selected:m.role==='owner'?[...permissions]:permissions.filter(p=>overrides.has(p)?overrides.get(p):baseline.includes(p))};
}
export async function saveMemberPermissions(businessId:string,memberId:string,revision:number,selected:Permission[]|null) {
 const user=await owner(businessId);
 await loadMemberPermissions(businessId,memberId);
 if(selected!==null && (!Array.isArray(selected)||selected.some(p=>!permissions.includes(p))))throw new Error('Invalid permission selection.');
 const normalized=selected===null?null:normalizePermissionSelection(selected);
 const {error}=await supabaseAdmin.rpc('tenh_save_member_permissions',{p_business:businessId,p_actor:user.id,p_member:memberId,p_revision:revision,p_selected:normalized});
 if(error)throw new Error(error.message);
 revalidatePath('/dashboard','layout');
 return loadMemberPermissions(businessId,memberId);
}
