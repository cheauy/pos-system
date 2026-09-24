'use server';

import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { validateAlert, type AlertHistory } from '@/lib/update-alerts';

export async function loadAlertHistory(offset = 0) {
  await requireSuperAdmin();
  const db = await createClient();
  const { data, error } = await db.rpc('tenh_update_alert_history', { p_offset: offset });
  return error ? { error: 'Unable to load alert history. Please try again.', alerts: [] as AlertHistory[] } : { alerts: (data ?? []) as AlertHistory[], error: null };
}

export async function publishAlert(id: string, input: Parameters<typeof validateAlert>[0]) {
  await requireSuperAdmin();
  const invalid = validateAlert(input);
  if (invalid) return { error: invalid };
  const db = await createClient();
  const { error } = await db.rpc('tenh_publish_update_alert', { p_id: id, p_input: input });
  if (error) {
    console.error('Update alert publish failed:', error.code);
    return { error: 'Unable to publish. Check the fields and end time, then try again.' };
  }
  return { error: null };
}

export async function endAlert(id: string) {
  await requireSuperAdmin();
  const db = await createClient();
  const { error } = await db.rpc('tenh_end_update_alert', { p_id: id });
  return { error: error ? 'Unable to end the alert. Please try again.' : null };
}
