import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/require-permission';
import { loadPosWorkspace } from '../../pos/pos-workspace-actions';
import { PosCurrencySettings } from '../../pos/pos-currency-settings';
import {getBranchContext} from '@/lib/branches/context';

export default async function PosCurrencyPage() {
  const business=await requirePermission('pos.access');
  if(business.role !== 'owner')redirect('/dashboard/settings');
  const {branchId}=await getBranchContext();
  const result=await loadPosWorkspace(business.id,branchId,false);
  return <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
    <Link href="/dashboard/settings" className="text-sm font-medium text-slate-500 hover:text-blue-600">← Settings</Link>
    <header><h1 className="text-3xl font-bold tracking-tight">Currency Settings</h1><p className="mt-1 text-sm text-slate-500">Set your store currency, exchange rate and amount format.</p></header>
    {result.success ? <PosCurrencySettings key={branchId} businessId={business.id} branchId={branchId} settings={result.data.settings}/> : <p role="alert" className="text-sm text-red-600">{result.message}</p>}
  </main>;
}
