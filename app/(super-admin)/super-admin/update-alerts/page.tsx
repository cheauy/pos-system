import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { loadAlertHistory } from './actions';
import UpdateAlertsClient from './update-alerts-client';

export default async function UpdateAlertsPage() {
  await requireSuperAdmin();
  const history = await loadAlertHistory();
  return <main className="w-full pb-8">
    <UpdateAlertsClient initialAlerts={history.alerts} initialError={history.error} />
  </main>;
}
