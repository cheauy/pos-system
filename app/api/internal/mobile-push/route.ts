import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 const received=request.headers.get('authorization')||'';
 if(!secret||Buffer.byteLength(received)!==Buffer.byteLength(`Bearer ${secret}`)||!timingSafeEqual(Buffer.from(received),Buffer.from(`Bearer ${secret}`))) return Response.json({error:'Unauthorized'},{status:401});
 if(process.env.MOBILE_PUSH_ENABLED!=='true') return Response.json({enabled:false});
 const headers={'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})};
 // A claim is attempted once: uncertain provider/network outcomes must not cause duplicate alerts.
 const claimed=await supabaseAdmin.rpc('tenh_mobile_claim_push');
 if(claimed.error)return Response.json({error:'Unable to prepare notifications.'},{status:503});
 const rows=(claimed.data||[]) as {device_id:string;notification_id:string;token:string}[];
 try{
  if(rows.length){
   const sent=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,body:JSON.stringify(rows.map(r=>({to:r.token,title:'TENH POS',body:'Your workspace has a new alert. Open TENH POS to view it.',data:{screen:'Alerts'},sound:'default',channelId:'workspace'}))),signal:AbortSignal.timeout(15000)});
   if(!sent.ok)throw new Error('Push provider unavailable.');
   const payload=await sent.json();
   if(!Array.isArray(payload.data)||payload.data.length!==rows.length)throw new Error('Unexpected push response.');
   for(let i=0;i<rows.length;i++){
    const ticket=payload.data[i],r=rows[i];
    if(ticket.details?.error==='DeviceNotRegistered'){const removed=await supabaseAdmin.from('mobile_push_devices').delete().eq('device_id',r.device_id).eq('token',r.token);if(removed.error)throw new Error('Unable to remove expired registration.');}
    else {const saved=await supabaseAdmin.from('mobile_push_deliveries').update({ticket_id:ticket.status==='ok'&&typeof ticket.id==='string'?ticket.id:null,receipt_status:ticket.status==='ok'?null:'rejected'}).eq('device_id',r.device_id).eq('notification_id',r.notification_id);if(saved.error)throw new Error('Unable to record push status.');}
   }
  }
  const pending=await supabaseAdmin.from('mobile_push_deliveries').select('device_id,notification_id,ticket_id,push_token').is('receipt_status',null).not('ticket_id','is',null).lt('claimed_at',new Date(Date.now()-15*60000).toISOString()).gt('claimed_at',new Date(Date.now()-24*3600000).toISOString()).limit(100);
  if(pending.error)throw new Error('Unable to check delivery status.');
  if(pending.data?.length){
   const check=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers,body:JSON.stringify({ids:pending.data.map(r=>r.ticket_id)}),signal:AbortSignal.timeout(15000)});
   if(!check.ok)throw new Error('Receipt service unavailable.');
   const receipts=(await check.json()).data||{};
   for(const r of pending.data){const receipt=receipts[r.ticket_id];if(!receipt)continue;
    if(receipt.details?.error==='DeviceNotRegistered'){const removed=await supabaseAdmin.from('mobile_push_devices').delete().eq('device_id',r.device_id).eq('token',r.push_token);if(removed.error)throw new Error('Unable to remove expired registration.');}
    else {const saved=await supabaseAdmin.from('mobile_push_deliveries').update({receipt_status:receipt.status==='ok'?'delivered':'rejected'}).eq('device_id',r.device_id).eq('notification_id',r.notification_id);if(saved.error)throw new Error('Unable to save receipt status.');}
   }
  }
  return Response.json({attempted:rows.length});
 }catch{return Response.json({error:'Notification delivery needs another health check. Claimed alerts will not be duplicated.'},{status:503});}
}
