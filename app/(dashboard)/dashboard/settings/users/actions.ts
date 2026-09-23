'use server';
import type { BusinessRole } from '@/lib/business/types';
import { createTeamUser, updateTeamUser } from './users-workspace-actions';
export type UserActionState = {success:boolean;message:string;updatedRole?:BusinessRole};
const stale='Reload Settings → User & Manage User before editing. This older form does not include the current user revision.';
export async function createBusinessUser(_state:UserActionState,form:FormData):Promise<UserActionState>{
 const businessId=String(form.get('businessId')||'');const requestId=String(form.get('requestId')||'');
 if(!businessId||!requestId)return {success:false,message:stale};
 return createTeamUser(businessId,{requestId,name:String(form.get('fullName')||''),email:String(form.get('email')||''),phone:String(form.get('phone')||''),role:String(form.get('role')) as BusinessRole,branchId:String(form.get('branchId')||''),password:String(form.get('password')||''),sendInvite:false,requirePasswordChange:true});
}
export async function updateBusinessUserRole(_state:UserActionState,_form:FormData):Promise<UserActionState>{return {success:false,message:stale};}
export async function toggleBusinessUserStatus(_state:UserActionState,_form:FormData):Promise<UserActionState>{return {success:false,message:stale};}
export async function deleteBusinessUser(form:FormData){
 if(!form.get('businessId')||!form.get('revision'))throw new Error(stale);
 const result=await updateTeamUser(String(form.get('businessId')),String(form.get('memberId')),Number(form.get('revision')),'remove',{confirmation:String(form.get('confirmation')||'')});
 if(!result.success)throw new Error(result.message);return {success:true};
}
export async function assignMemberBranch(_memberId:string,_branchId:string){return {success:false,message:stale};}
