import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/branch-server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import { PosReceipt } from '@/components/receipts/pos-receipt';
import PrintReceiptButton from '@/components/print-button';
import { loadDetailedOrder } from '../order-detail-data';
import { recordReceipt } from '../order-detail-model';
import OrderPrintEmbedStyles from '@/components/order-print-embed-styles';
export default async function OrderReceiptPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{preview?:string}>}) {
 const embedded=(await searchParams)?.preview==='1';
 const business=await requirePermission('orders.view');const {id}=await params;
 const order=await loadDetailedOrder(business.id,id);if(!order)notFound();
 const context=await loadReceiptContext(business.id,business.name,id);const db=await createClient();
 const store=await db.from('business_storefronts').select('currency').eq('business_id',business.id).maybeSingle();
 const branch=order.location_id?await supabaseAdmin.from('business_locations').select('name').eq('business_id',business.id).eq('id',order.location_id).maybeSingle():null;
 const receipt=recordReceipt(order,business.name,store.data?.currency || 'USD',branch?.data?.name || 'Unassigned');
 return <main id="order-print-preview" style={{maxWidth:680,margin:'auto',background:'white',padding:24,borderRadius:12}}>{embedded&&<OrderPrintEmbedStyles/>}<nav className="no-print" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><Link href={`/dashboard/orders/${id}`}>← View order</Link><PrintReceiptButton/></nav><p className="no-print" style={{fontSize:12,color:'#657e9f',margin:'18px 0'}}>{order.pos_checkout?.receipt?'Original checkout receipt. Later returns and balance changes are recorded separately.':'Current order receipt. No original POS snapshot is available.'} Current status: {order.status}.</p><p className="no-print" style={{fontSize:12,color:"#475569"}}>Select your installed receipt printer and {context.appearance.paperSize.replace("mm", " mm")} paper, use 100% scale, and turn off headers and footers in the print dialog.</p><div id="order-receipt-print-area"><PosReceipt receipt={receipt} context={context}/></div><style media="print">{`body *:has(#order-receipt-print-area){display:block!important;position:static!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important;transform:none!important}body *:not(:has(#order-receipt-print-area)):not(#order-receipt-print-area):not(#order-receipt-print-area *){display:none!important}#order-receipt-print-area .receipt{position:static!important}`}</style></main>;
}
