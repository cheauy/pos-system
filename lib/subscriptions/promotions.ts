import { getTermDiscount, type SubscriptionPlanKey, type SubscriptionTermMonths } from './plans';

export type Promotion = {
  id: string; name: string; plan_key: SubscriptionPlanKey | null; term_months: SubscriptionTermMonths | null;
  discount_percent: number; starts_on: string; ends_on: string; apply_new: boolean; apply_existing: boolean; enabled: boolean;
};
// The server sends only currently eligible rules; SQL rechecks eligibility at checkout.
export function promotionDiscount(rules: Promotion[], plan: SubscriptionPlanKey, months: SubscriptionTermMonths) {
  return Math.max(getTermDiscount(months), ...rules.filter(rule =>
    rule.enabled && (!rule.plan_key || rule.plan_key === plan) && (!rule.term_months || rule.term_months === months)
  ).map(rule => Number(rule.discount_percent)));
}
export function promotionPrice<T extends {subtotal:number; discountPercent:number; discountAmount:number; total:number}>(price:T, rules:Promotion[], plan:SubscriptionPlanKey, months:SubscriptionTermMonths):T {
  const discountPercent=promotionDiscount(rules,plan,months);
  const total=Number((price.subtotal*(1-discountPercent/100)).toFixed(2));
  return {...price,discountPercent,total,discountAmount:Number((price.subtotal-total).toFixed(2))};
}
export function validatePromotion(input: Omit<Promotion,'id'>):string|null {
  if(!input.name.trim()||input.name.trim().length>80)return 'Enter a discount name (up to 80 characters).';
  if(input.plan_key!==null&&!['solo','small_team','growth','custom'].includes(input.plan_key))return 'Choose a valid plan.';
  if(input.term_months!==null&&![1,3,6,12].includes(input.term_months))return 'Choose a valid billing term.';
  if(!Number.isFinite(input.discount_percent)||input.discount_percent<1||input.discount_percent>90||Math.abs(input.discount_percent*100-Math.round(input.discount_percent*100))>0.000001)return 'Enter a discount from 1% to 90% (up to two decimals).';
  for(const date of [input.starts_on,input.ends_on]) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return 'Choose valid start and end dates.';
  }
  if(input.ends_on<input.starts_on)return 'End date must be on or after the start date.';
  if(!input.apply_new&&!input.apply_existing)return 'Choose at least one customer group.';
  return null;
}
