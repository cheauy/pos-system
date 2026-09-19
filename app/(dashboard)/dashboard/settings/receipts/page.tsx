import Link from 'next/link';
import { requirePermission } from '@/lib/auth/require-permission';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import { ReceiptSettingsEditor } from './receipt-settings-editor';
export default async function ReceiptSettingsPage() {
 const business=await requirePermission('business.update');
 const context=await loadReceiptContext(business.id,business.name);
 return <main><Link href="/dashboard/settings">← Settings</Link><ReceiptSettingsEditor businessId={business.id} initial={context}/></main>;
}
