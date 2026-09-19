import Link from 'next/link';
import PosClient from './pos-client';
import { loadPosWorkspace } from './pos-workspace-actions';

export default async function PosPage() {
  const result = await loadPosWorkspace();
  if (!result.success) return (
    <main className="rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
      <p role="alert" className="my-4 max-w-2xl text-slate-600">{result.message}</p>
      <Link href="/dashboard/pos" className="inline-flex rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Reload POS</Link>
    </main>
  );
  return <PosClient key={`${result.data.businessId}:${result.data.userId}`} initialData={result.data} />;
}
