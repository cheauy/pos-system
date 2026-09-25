'use server';
import { cookies } from 'next/headers';
import { getBranchContext } from '@/lib/branches/context';
import { businessHasPermission } from '@/lib/auth/effective-permissions';
import { posLockCookie } from '@/lib/pos/navigation-lock';

export async function readPosNavigationLock(businessId:string){
  const context=await getBranchContext();
  if(context.business.id!==businessId)throw new Error('Your workspace changed. Refresh before continuing.');
  const allowed=await businessHasPermission(context.business,'pos.access');
  return {locked:allowed&&(await cookies()).get(posLockCookie(businessId,context.userId))?.value==='1'};
}
export async function setPosNavigationLock(businessId:string,branchId:string,locked:boolean){
  const context=await getBranchContext();
  if(typeof locked!=='boolean'||context.business.id!==businessId||context.branchId!==branchId)throw new Error('Your branch or workspace changed. Refresh before continuing.');
  if(locked&&!(await businessHasPermission(context.business,'pos.access')))throw new Error('POS access is required.');
  (await cookies()).set(posLockCookie(businessId,context.userId),locked?'1':'0',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*30});
  return {locked};
}
