import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/branch-server';
import PrintReceiptButton from '@/components/print-button';
import { ReceiptContent } from '../../pos-workspace-components';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import type { SaleReceipt } from '../../pos-workspace-types';
import s from '../../pos-workspace.module.css';

export default async function PosReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const business = await requirePermission('orders.view');
  const { id } = await params;
  const db = await createClient();
  const { data, error } = await db.from('orders').select('id,status,pos_checkout').eq('id', id).eq('business_id', business.id).maybeSingle();
  if (error) throw new Error('The receipt could not be loaded. Please retry.');
  const receipt = data?.pos_checkout?.receipt as SaleReceipt | undefined;
  if (!data || !receipt || receipt.orderId !== id) notFound();
  const context = await loadReceiptContext(business.id,business.name,id);
  return <main className={s.receiptPage}>
    <nav className="no-print"><Link href={`/dashboard/orders/${id}`}>← View order</Link><PrintReceiptButton /></nav>
    <p className={`${s.receiptDisclaimer} no-print`}>Original sale receipt. Current order status: <strong>{data.status}</strong>. Later returns, refunds and balance collections are recorded in the order history; this receipt preserves the original payment breakdown.</p>
    <ReceiptContent receipt={receipt} context={context} />
  </main>;
}
