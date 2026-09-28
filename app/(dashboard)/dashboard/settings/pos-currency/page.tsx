import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/require-permission';
import { loadPosWorkspace } from '../../pos/pos-workspace-actions';
import { PosCurrencySettings } from '../../pos/pos-currency-settings';
import s from '../../pos/pos-workspace.module.css';
import {getBranchContext} from '@/lib/branches/context';
import {TaxForm} from './tax-form';

export default async function PosCurrencyPage() {
  const business=await requirePermission('pos.access');
  if(business.role !== 'owner')redirect('/dashboard/settings');
  const result=await loadPosWorkspace(business.id);
  const {branchId}=await getBranchContext();
  return <main className={`${s.currencySettingsPage} ${s.dialogTheme}`}>
    <Link href="/dashboard/settings" className={s.textButton}>← Settings</Link>
    <h1>Currency Settings</h1><p className={s.muted}>Set your store currency, exchange rate and amount format.</p>
    {result.success ? <PosCurrencySettings businessId={business.id} settings={result.data.settings}/> : <p role="alert" className={s.orangeText}>{result.message}</p>}
    {result.success&&<TaxForm key={branchId} businessId={business.id} branchId={branchId} taxRate={result.data.settings.taxRate}/>}
    <Link className={s.textButton} href="/dashboard/pos">Open Point of Sale →</Link>
  </main>;
}
