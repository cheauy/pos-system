import { businessListStatus, type BusinessListRow } from "./business-list";
export type DashboardBusiness = BusinessListRow & {
  subscription_status: string | null; trial_expires_at: string | null;
  subscription_monthly_price: number | string | null; subscription_discount_percent: number | string | null;
  subscription_cycle_value: number | string | null; subscription_months: number | null;
};
export type DashboardPayment = { id: string; business_id: string; status: string; total_amount: number | string | null; currency: string | null; approved_at: string | null; reviewed_at: string | null; payway_verified_at: string | null };
export function paymentDate(p: DashboardPayment) { return p.approved_at || p.payway_verified_at || p.reviewed_at; }
export function dashboardMetrics(businesses: DashboardBusiness[], payments: DashboardPayment[], now: Date) {
  const timestamp = now.getTime();
  const active = businesses.filter(b => businessListStatus(b,timestamp) === "active");
  const approved = payments.filter(p => p.status === "approved" && p.currency === "USD" && Number.isFinite(Number(p.total_amount)) && Number(p.total_amount) >= 0);
  const months = Array.from({length:6},(_,i)=>{
    const date = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5+i,1));
    const key = date.toISOString().slice(0,7);
    const orders = approved.filter(p => paymentDate(p)?.startsWith(key) && Date.parse(paymentDate(p)!) <= timestamp);
    return {key,label:date.toLocaleDateString("en-US",{month:"short",timeZone:"UTC"}),businesses:businesses.filter(b=>b.created_at.startsWith(key)&&Date.parse(b.created_at)<=timestamp).length,revenue:orders.reduce((sum,p)=>sum+Number(p.total_amount),0),subscriptions:orders.length};
  });
  let mrr=0, unpriced=0;
  for(const b of active.filter(b=>b.subscription_status==="active" && b.subscription_plan_key!=="trial")) {
    const cycle=b.subscription_cycle_value===null?NaN:Number(b.subscription_cycle_value);
    const monthly=b.subscription_monthly_price===null?NaN:Number(b.subscription_monthly_price);
    if(Number.isFinite(cycle)&&cycle>=0&&Number(b.subscription_months)>0)mrr+=cycle/Number(b.subscription_months);
    else if(Number.isFinite(monthly)&&monthly>=0)mrr+=monthly*(1-Math.min(100,Math.max(0,Number(b.subscription_discount_percent)||0))/100);
    else unpriced++;
  }
  const plans = new Map<string,number>();
  for(const b of businesses){const key=b.subscription_plan_key || (b.subscription_status==="trialing"?"trial":"legacy");plans.set(key,(plans.get(key)||0)+1);}
  return {
    active:active.length, expired:businesses.filter(b=>businessListStatus(b,timestamp)==="expired").length,
    restricted:businesses.filter(b=>["suspended","inactive"].includes(businessListStatus(b,timestamp))).length,
    trialsEnding:businesses.filter(b=>b.subscription_status==="trialing"&&b.trial_expires_at&&Date.parse(b.trial_expires_at)>timestamp&&Date.parse(b.trial_expires_at)<=timestamp+7*86400000).length,
    pending:payments.filter(p=>["payment_submitted","quote_requested"].includes(p.status)).length,
    approvedValue:approved.reduce((sum,p)=>sum+Number(p.total_amount),0),
    undatedApprovals:approved.filter(p=>!paymentDate(p)||!Number.isFinite(Date.parse(paymentDate(p)!))).length,
    mrr,unpriced,months,plans:[...plans].map(([key,value])=>({key,value})).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key)),
  };
}
