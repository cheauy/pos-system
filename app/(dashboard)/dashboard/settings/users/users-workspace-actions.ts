'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/require-permission';
import { businessHasPermission, getPermissionMatrix } from '@/lib/auth/effective-permissions';
import { permissions, editablePermissionRoles, normalizePermissionSelection, rolePermissions, type EditablePermissionRole, type Permission } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { createClient as createBranchClient } from '@/lib/supabase/branch-server';
import { getBranchContext } from '@/lib/branches/context';
import { assertSubscriptionCapacityChangeAllowed } from '@/lib/subscriptions/access-safety';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createIssue, editIssue, isId, NEW_USER_ROLES } from '@/lib/users/team-model';
import type { TeamWorkspace, TeamCreateInput, TeamEditInput, TeamActionResult } from '@/lib/users/team-model';
import type { BusinessRole } from '@/lib/business/types';

function message(error:unknown):string {
 const e=error as {code?:string;message?:string}|null;
 if(['email_exists','user_already_exists'].includes(e?.code||'') || /already (?:been )?registered|email.*already.*(?:exists|used)/i.test(e?.message||''))return 'This email is already registered. Use a different email address. Your entered details have been kept.';
 if(['42883','42703','42P01','PGRST202','PGRST204','PGRST205'].includes(e?.code||''))return 'Apply the latest User & Manage User migrations, then reload this page.';
 return e?.message || 'Unable to complete the request. Refresh User & Manage User before trying again.';
}

async function actor(expectedBusiness:string){
 const business=await requirePermission('users.view');
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error || !user || business.id!==expectedBusiness)throw new Error('Your account or selected business changed. Reload User & Manage User.');
 return {business,db,user};
}

async function actorBranchScope(businessId:string,userId:string,role:string){
 if(role==='owner')return (await getBranchContext()).branchId;
 const {data,error}=await supabaseAdmin.from('business_members')
  .select('default_location_id')
  .eq('business_id',businessId)
  .eq('user_id',userId)
  .eq('is_active',true)
  .maybeSingle();
 if(error)throw error;
 const branchId=data?.default_location_id as string|null|undefined;
 if(!branchId)throw new Error('Your account has no assigned branch. Ask the Owner to assign one before managing users.');
 return branchId;
}

async function managedMember(businessId:string,memberId:string,actorBranch:string|null){
 const {data,error}=await supabaseAdmin.from('business_members')
  .select('default_location_id,role,user_id')
  .eq('business_id',businessId)
  .eq('id',memberId)
  .maybeSingle();
 if(error)throw error;
 if(!data)throw new Error('User not found. Reload User & Manage User.');
 if(data.role==='owner')throw new Error('The business Owner cannot be modified here.');
 if(actorBranch && data.default_location_id!==actorBranch)throw new Error('You can manage users assigned to your branch only.');
 return data;
}

async function ensureTeamLineage(businessId:string,memberId:string,userId:string,createdBy:string){
 const {data:ownerMembership,error:ownerError}=await supabaseAdmin.from('business_members')
  .select('user_id').eq('business_id',businessId).eq('role','owner').order('created_at',{ascending:true}).limit(1).maybeSingle();
 if(ownerError)throw ownerError;
 if(!ownerMembership?.user_id)throw new Error('Business owner membership is missing. Workspace ownership could not be confirmed.');
 const {error}=await supabaseAdmin.from('business_members').update({
  team_owner_id:ownerMembership.user_id,
  team_created_by:createdBy,
 }).eq('id',memberId).eq('business_id',businessId).eq('user_id',userId);
 if(error)throw error;
}

function refresh(){
 try{
  revalidatePath('/dashboard/settings/users');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard','layout');
 }catch{/* Transaction already committed. */}
}

export async function loadUsersWorkspace(businessId:string):Promise<TeamActionResult<TeamWorkspace>>{
 try {
  if(!isId(businessId))throw new Error('Invalid business.');
  const {user,business}=await actor(businessId);
  const {data,error}=await supabaseAdmin.rpc('tenh_users_workspace',{p_business:businessId,p_actor:user.id});
  if(error)throw error;
  if(!data || data.businessId!==businessId || data.actorId!==user.id || !Array.isArray(data.rows)||!Array.isArray(data.branches))throw new Error('Incomplete user workspace response. Reload this screen.');
  const [effectiveRolePermissions,canCreateFull,canCreateLimited,canEditUsers,canDisableUsers]=await Promise.all([
   getPermissionMatrix(businessId),
   businessHasPermission(business,'users.create'),
   businessHasPermission(business,'users.create_limited'),
   businessHasPermission(business,'users.update_role'),
   businessHasPermission(business,'users.delete'),
  ]);
  const actorBranch=await actorBranchScope(businessId,user.id,business.role);
  const workspace=data as TeamWorkspace;
  const visibleBranches=business.role==='owner'?[...workspace.branches].sort((a,b)=>Number(b.id===actorBranch)-Number(a.id===actorBranch)):workspace.branches.filter(branch=>branch.id===actorBranch);
  const visibleRows=actorBranch?workspace.rows.filter(row=>row.role==='owner'||row.userId===user.id||row.branchId===actorBranch):workspace.rows;
  const assignableRoles = business.role==='owner' && canCreateFull
   ? [...NEW_USER_ROLES]
   : (canCreateFull || canCreateLimited) ? ['staff','cashier'] as const : [];
  return {
   success:true,
   data:{
    ...workspace,
    branches:visibleBranches,
    rows:visibleRows,
    effectiveRolePermissions,
    canManageRolePermissions:business.role==='owner',
    canCreateUsers:canCreateFull||canCreateLimited,
    canEditUsers,
    canDisableUsers,
    assignableRoles:[...assignableRoles],
   },
   message:'',
  };
 }catch(error){return {success:false,message:message(error)};}
}

export async function createTeamUser(businessId:string,input:TeamCreateInput):Promise<TeamActionResult<{memberId:string;userId:string}>>{
 let submitted=false;
 try {
  const {business,user}=await actor(businessId);
  await assertSubscriptionCapacityChangeAllowed(business.id);
  const canCreateFull=await businessHasPermission(business,'users.create');
  const canCreateLimited=await businessHasPermission(business,'users.create_limited');
  if(!canCreateFull && !canCreateLimited)return {success:false,message:'You do not have permission to create users.'};

  const normalized:TeamCreateInput={...input,sendInvite:false,requirePasswordChange:true};
  const allowedRoles:BusinessRole[]=business.role==='owner' && canCreateFull
   ? [...NEW_USER_ROLES]
   : (canCreateFull || canCreateLimited) ? ['staff','cashier'] : [];
  const issue=createIssue(normalized,business.role,allowedRoles);if(issue)return {success:false,message:issue};
  if(!allowedRoles.includes(normalized.role))return {success:false,message:'You cannot create this user role.'};
  const actorBranch=await actorBranchScope(business.id,user.id,business.role);
  if(actorBranch && normalized.branchId!==actorBranch)return {success:false,message:'You can create users for your assigned branch only.'};

  const payload={
   name:normalized.name.trim(),
   email:normalized.email.trim().toLowerCase(),
   phone:normalized.phone.trim(),
   role:normalized.role,
   branchId:normalized.branchId,
   sendInvite:false,
   requirePasswordChange:true,
  };
  const args={p_business:business.id,p_actor:user.id,p_request:normalized.requestId,p_payload:payload};
  submitted=true;
  const reservation=await supabaseAdmin.rpc('tenh_users_reserve',args);
  if(reservation.error)return {success:false,message:message(reservation.error),uncertain:!['P0001','42501'].includes(reservation.error.code)};
  if(reservation.data?.done){
   await ensureTeamLineage(business.id,reservation.data.memberId,reservation.data.userId,user.id);
   refresh();
   return {success:true,data:{memberId:reservation.data.memberId,userId:reservation.data.userId},message:'This create request was already saved. The user must sign in with the temporary password and create a new password.'};
  }

  let userId=reservation.data?.userId as string|undefined;
  if(!userId){
   const auth=await supabaseAdmin.auth.admin.createUser({
    email:payload.email,
    password:normalized.password,
    email_confirm:true,
    user_metadata:{full_name:payload.name,require_password_change:true},
    app_metadata:{
     tenh_team_request_id:normalized.requestId,
     tenh_team_business:business.id,
     tenh_team_created_by:user.id,
     tenh_team_branch:payload.branchId,
    },
   });
   if(auth.error||!auth.data.user){
    const retry=await supabaseAdmin.rpc('tenh_users_reserve',args);
    if(retry.error)throw retry.error;
    if(retry.data?.done){
     await ensureTeamLineage(business.id,retry.data.memberId,retry.data.userId,user.id);
     refresh();
     return {success:true,data:{memberId:retry.data.memberId,userId:retry.data.userId},message:'User was already created. Refresh User & Manage User.'};
    }
    userId=retry.data?.userId;
    if(!userId){
     if(['email_exists','user_already_exists','email_address_invalid','weak_password','validation_failed'].includes(auth.error?.code||'')){
      const released=await supabaseAdmin.rpc('tenh_users_cancel_empty_request',{p_business:business.id,p_actor:user.id,p_request:normalized.requestId});
      if(!released.error&&released.data===true)return {success:false,message:message(auth.error)};
     }
     return {success:false,uncertain:true,message:auth.error?message(auth.error):'Account creation result is unconfirmed. Keep this request and retry; do not create another copy.'};
    }
   }else userId=auth.data.user.id;
  }

  const attached=await supabaseAdmin.rpc('tenh_users_attach',{p_business:business.id,p_actor:user.id,p_request:normalized.requestId,p_user:userId});
  if(attached.error)throw attached.error;
  if(!attached.data?.memberId)throw new Error('Membership result is unconfirmed. Retry this same request.');
  await ensureTeamLineage(business.id,attached.data.memberId,userId!,user.id);
  refresh();
  return {
   success:true,
   data:{memberId:attached.data.memberId,userId:userId!},
   message:'User created. Email confirmation is skipped. They must sign in with the temporary password and create a new password before workspace access is activated.',
  };
 }catch(error){return {success:false,uncertain:submitted,message:message(error)};}
}

export async function updateTeamUser(
 businessId:string,
 memberId:string,
 revision:number,
 operation:'edit'|'enable'|'disable'|'remove',
 payload:Partial<TeamEditInput>&{confirmation?:string}={}
):Promise<TeamActionResult>{
 try {
  const {business,user}=await actor(businessId);
  if(!isId(memberId)||!Number.isInteger(revision)||revision<1||!['edit','enable','disable','remove'].includes(operation))throw new Error('Invalid user change. Refresh User & Manage User.');
  const actorBranch=await actorBranchScope(business.id,user.id,business.role);
  const target=await managedMember(business.id,memberId,actorBranch);
  if(operation==='remove' && business.role!=='owner')return {success:false,message:'Only the business Owner can delete user accounts.'};
  if(operation==='enable') await assertSubscriptionCapacityChangeAllowed(business.id);
  if(business.role!=='owner' && !['staff','cashier'].includes(target.role))return {success:false,message:'Only the business Owner can manage Manager accounts.'};

  if(operation==='edit'){
   if(!(await businessHasPermission(business,'users.update_role')))return {success:false,message:'You do not have permission to edit user roles or branch assignments.'};
   const allowedRoles:BusinessRole[]=business.role==='owner'?[...NEW_USER_ROLES]:['staff','cashier'];
   const issue=editIssue(payload as TeamEditInput,business.role,allowedRoles);if(issue)return {success:false,message:issue};
   if(business.role!=='owner' && actorBranch && (payload as TeamEditInput).branchId!==actorBranch)return {success:false,message:'You can assign users to your branch only.'};
  } else if(!(await businessHasPermission(business,'users.delete'))){
   return {success:false,message:'You do not have permission to enable, disable, or remove users.'};
  }

  const {data,error}=operation==='remove'
   ? await supabaseAdmin.rpc('tenh_users_delete_account',{p_business:business.id,p_actor:user.id,p_member:memberId,p_revision:revision,p_confirmation:payload.confirmation})
   : await supabaseAdmin.rpc('tenh_users_edit',{p_business:business.id,p_actor:user.id,p_member:memberId,p_revision:revision,p_operation:operation,p_payload:payload});
  if(error)throw error;
  refresh();return {success:true,data:undefined,message:data?.message || 'User updated.'};
 }catch(error){return {success:false,message:message(error)};}
}

function validRole(role:string):role is EditablePermissionRole{
 return editablePermissionRoles.includes(role as EditablePermissionRole);
}

export async function saveRolePermissions(
 businessId:string,
 role:string,
 selected:Permission[],
):Promise<TeamActionResult<{role:EditablePermissionRole;permissions:Permission[]}>>{
 try{
  const {business,user}=await actor(businessId);
  if(business.role!=='owner')return {success:false,message:'Only the business owner can change role permissions.'};
  if(!validRole(role))return {success:false,message:'Choose Manager, Staff, or Cashier.'};
  if(!Array.isArray(selected)||selected.some(value=>!permissions.includes(value)))return {success:false,message:'Invalid permission selection. Reload the page.'};

  const unique=normalizePermissionSelection(Array.from(new Set(selected)));
  const now=new Date().toISOString();
  const rows=permissions.map(permission=>({
   business_id:business.id,
   role,
   permission,
   enabled:unique.includes(permission),
   updated_by:user.id,
   updated_at:now,
  }));
  const branchId=(await getBranchContext()).branchId;
  const db=await createBranchClient();
  const {error}=await db.from('branch_role_permissions').upsert(rows.map(row=>({...row,location_id:branchId})),{onConflict:'business_id,location_id,role,permission'});
  if(error)throw error;
  const {error:auditError}=await supabaseAdmin.from('audit_logs').insert({
   business_id:business.id,user_id:user.id,action:'update',entity_type:'business',entity_id:business.id,
   description:`Updated ${role} role permissions`,metadata:{role,permissionCount:unique.length},
  });
  if(auditError)console.error('Permission audit log failed',auditError);
  refresh();
  return {success:true,data:{role,permissions:unique},message:`${role[0].toUpperCase()+role.slice(1)} permissions saved.`};
 }catch(error){return {success:false,message:message(error)};}
}

export async function resetRolePermissions(
 businessId:string,
 role:string,
):Promise<TeamActionResult<{role:EditablePermissionRole;permissions:Permission[]}>>{
 try{
  const {business,user}=await actor(businessId);
  if(business.role!=='owner')return {success:false,message:'Only the business owner can reset role permissions.'};
  if(!validRole(role))return {success:false,message:'Choose Manager, Staff, or Cashier.'};
  const branchId=(await getBranchContext()).branchId;
  const db=await createBranchClient();
  const {error}=await db.from('branch_role_permissions').delete().eq('business_id',business.id).eq('location_id',branchId).eq('role',role);
  if(error)throw error;
  await supabaseAdmin.from('audit_logs').insert({
   business_id:business.id,user_id:user.id,action:'update',entity_type:'business',entity_id:business.id,
   description:`Reset ${role} role permissions to TENH defaults`,metadata:{role},
  });
  refresh();
  return {success:true,data:{role,permissions:[...rolePermissions[role]]},message:`${role[0].toUpperCase()+role.slice(1)} permissions reset to default.`};
 }catch(error){return {success:false,message:message(error)};}
}
