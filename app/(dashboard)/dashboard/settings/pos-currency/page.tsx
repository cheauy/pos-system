import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/require-permission';
import { loadPosWorkspace } from '../../pos/pos-workspace-actions';
import { PosCurrencySettings } from '../../pos/pos-currency-settings';
import s from '../../pos/pos-workspace.module.css';

export default async function PosCurrencyPage() {
  const business=await requirePermission('pos.access');
  if(business.role !== 'owner')redirect('/dashboard/settings');
  const result=await loadPosWorkspace(business.id);
  return <main className={`${s.currencySettingsPage} ${s.dialogTheme}`}>
    <Link href="/dashboard/settings" className={s.textButton}>← Settings</Link>
    <h1>POS Currency</h1><p className={s.muted}>Manage the $ / ៛ switch and your store’s exchange rate.</p>
    {result.success ? <PosCurrencySettings businessId={business.id} settings={result.data.settings}/> : <p role="alert" className={s.orangeText}>{result.message}</p>}
    <Link className={s.textButton} href="/dashboard/pos">Open Point of Sale →</Link>
  </main>;
}
