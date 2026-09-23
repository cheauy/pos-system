export type StaffSale = {
 id:string;order_number:string;staff_user_id:string|null;staff_name:string|null;order_source:string|null;
 status:string;total:number;discount:number;created_at:string;
 order_items:{quantity:number}[];
 returns:{refund_amount:number;status:string;return_items:{quantity:number}[]}[];
};
export function staffKpis(orders:StaffSale[],members:{userId:string;name:string}[]=[]) {
 const rows=new Map<string,{id:string;name:string;orders:number;sales:number;units:number;discount:number;refunds:number;cancelled:number;completed:number}>();
 const get=(id:string,name:string)=>{if(!rows.has(id))rows.set(id,{id,name,orders:0,sales:0,units:0,discount:0,refunds:0,cancelled:0,completed:0});return rows.get(id)!;};
 members.forEach(m=>get(m.userId,m.name));
 const eligible=orders.filter(o=>!o.order_source||['pos','manual'].includes(o.order_source));
 for(const o of eligible){
  const row=get(o.staff_user_id??'unassigned',o.staff_name||'Unassigned');
  if(o.status==='cancelled'){row.cancelled++;continue;}
  row.orders++;row.sales+=Math.round(Number(o.total||0)*100);row.discount+=Math.round(Number(o.discount||0)*100);
  if(o.status==='completed')row.completed++;
  const refunds=(o.returns??[]).filter(r=>r.status==='refunded');
  row.refunds+=refunds.reduce((sum,r)=>sum+Math.round(Number(r.refund_amount||0)*100),0);
  row.units+=Math.max(0,(o.order_items??[]).reduce((sum,i)=>sum+Number(i.quantity),0)-refunds.reduce((sum,r)=>sum+(r.return_items??[]).reduce((n,i)=>n+Number(i.quantity),0),0));
 }
 const ranked=[...rows.values()].sort((a,b)=>b.sales-a.sales||b.orders-a.orders||a.name.localeCompare(b.name));
 return {ranked,topOrders:eligible.filter(o=>o.status!=='cancelled').sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,5),
  sales:ranked.reduce((n,r)=>n+r.sales,0),orders:ranked.reduce((n,r)=>n+r.orders,0),units:ranked.reduce((n,r)=>n+r.units,0),
  unassigned:eligible.filter(o=>!o.staff_user_id).length};
}
export function staffReportDates(range='yesterday',from?:string,to?:string,now=new Date()) {
 const today=new Date(now.getTime()+7*3600000).toISOString().slice(0,10);
 const day=(offset:number)=>new Date(Date.parse(`${today}T00:00:00Z`)+offset*86400000).toISOString().slice(0,10);
 let start=range==='today'?today:range==='7days'?day(-6):range==='30days'?day(-29):day(-1);
 let end=range==='yesterday'||!['today','7days','30days','custom'].includes(range)?day(-1):today;
 if(range==='custom'){
  if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new Error('Choose a valid date range.');
  for(const date of [from,to])if(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Choose valid dates.');
  if(from>to||Date.parse(to)-Date.parse(from)>365*86400000)throw new Error('Choose a date range of up to one year.');
  start=from;end=to;
 }
 return {from:start,to:end,start:`${start}T00:00:00+07:00`,end:`${end}T23:59:59.999+07:00`};
}
