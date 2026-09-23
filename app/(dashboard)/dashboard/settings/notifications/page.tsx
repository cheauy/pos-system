import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusiness } from '@/lib/business/get-current-business';
import AlertRecipients from '../alert-recipients';

export default async function NotificationSettingsPage() {
  const business = await getCurrentBusiness();
  if (business.role !== 'owner') redirect('/dashboard/settings');
  return <main className="mx-auto max-w-5xl pb-8"><Link href="/dashboard/settings" className="text-sm font-semibold text-blue-600">← General Settings</Link><h1 className="mt-4 text-3xl font-bold">Notification Settings</h1><p className="mt-2 text-sm text-slate-500">Choose who receives each business alert.</p><AlertRecipients businessId={business.id}/></main>;
}
