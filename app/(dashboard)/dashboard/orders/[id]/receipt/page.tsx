import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/server';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import { PosReceipt } from '@/components/receipts/pos-receipt';
import PrintReceiptButton from '@/components/print-button';
import { loadDetailedOrder } from '../order-detail-data';
import { recordReceipt } from '../order-detail-model';
export default async function OrderReceiptPage({params}:{params:Promise<{id:string}>}) {
 const business=await requirePermission('orders.view');const {id}=await params;
 const order=await loadDetailedOrder(business.id,id);if(!order)notFound();
 const context=await loadReceiptContext(business.id,business.name);const db=await createClient();
 const store=await db.from('business_storefronts').select('currency').eq('business_id',business.id).maybeSingle();
 const branch=order.location_id?await db.from('business_locations').select('name').eq('business_id',business.id).eq('id',order.location_id).maybeSingle():null;
 const receipt=recordReceipt(order,business.name,store.data?.currency || 'USD',branch?.data?.name || 'Unassigned');
 return <main style={{maxWidth:680,margin:'auto',background:'white',padding:24,borderRadius:12}}><nav className="no-print" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><Link href={`/dashboard/orders/${id}`}>← View order</Link><PrintReceiptButton/></nav><p className="no-print" style={{fontSize:12,color:'#657e9f',margin:'18px 0'}}>{order.pos_checkout?.receipt?'Original checkout receipt. Later returns and balance changes are recorded separately.':'Current order receipt. No original POS snapshot is available.'} Current status: {order.status}.</p><PosReceipt receipt={receipt} context={context}/></main>;
}
