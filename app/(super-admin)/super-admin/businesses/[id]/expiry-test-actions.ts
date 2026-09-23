'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { expiryTestsEnabled } from '@/lib/subscriptions/expiry-test-controls';

export async function changeTestExpiry(businessId: string, operation: 'expire' | 'restore') {
  const actor = await requireSuperAdmin();
  if (!expiryTestsEnabled()) return { success: false, message: 'Expiry testing is disabled in this environment.' };
  if (operation !== 'expire' && operation !== 'restore') return { success: false, message: 'Invalid test operation.' };
  const { data, error } = await supabaseAdmin.rpc('tenh_test_subscription_expiry', {
    p_business: businessId, p_actor: actor.id, p_restore: operation === 'restore',
  });
  if (error) return { success: false, message: error.code === 'PGRST202' ? 'Apply the expiry test migration before using these controls.' : error.message };
  revalidatePath(`/super-admin/businesses/${businessId}`);
  revalidatePath('/super-admin/businesses');
  revalidatePath('/dashboard', 'layout');
  return { success: true, message: String(data) };
}
