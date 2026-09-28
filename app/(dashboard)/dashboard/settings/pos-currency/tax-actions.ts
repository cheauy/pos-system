'use server';

import {revalidatePath} from 'next/cache';
import {requirePermission} from '@/lib/auth/require-permission';
import {getBranchContext,assertOperatingBranch} from '@/lib/branches/context';
import {createClient} from '@/lib/supabase/branch-server';
import {validTaxRate} from '@/lib/pos/tax-rate';

export async function saveTaxRate(businessId:string,branchId:string,taxRate:number) {
  const business=await requirePermission('pos.access');
  if(business.id!==businessId||business.role!=='owner')throw new Error('Only the owner can change this branch’s tax rate.');
  if(!validTaxRate(taxRate))throw new Error('Enter Tax % from 0 to 100 with up to two decimal places.');
  await assertOperatingBranch(branchId);
  const scope=await getBranchContext();
  const db=await createClient();
  const {error}=await db.from('branch_pos_settings').update({pos_tax_rate:taxRate}).eq('business_id',business.id).eq('location_id',scope.branchId).select('location_id').single();
  if(error)throw new Error('Unable to save tax. Refresh the settings before retrying.');
  revalidatePath('/dashboard/settings/pos-currency');
  revalidatePath('/dashboard/pos');
  return {success:true};
}
