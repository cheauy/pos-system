export type Branch={id:string;name:string;code:string;is_active:boolean;plan_disable_pending?:boolean};
export type Shift={register_summary?:ReturnType<typeof totals>|null;id:string;status:string;opening_cash:number;closing_cash:number|null;expected_cash:number|null;variance:number|null;opened_at:string;closed_at:string|null;location_id:string;opened_by:string;opening_note:string|null;closing_note:string|null};
export type Movement={id:string;shift_id:string;movement_type:string;amount:number;reason:string;reference:string|null;created_at:string;created_by:string};
export type Order={id:string;order_number:string;register_shift_id:string;payment_method:string|null;total:number;amount_paid:number;change_amount:number;status:string;created_at:string;pos_checkout:{cashReceived?:number;receipt?:{amountPaid:number;change:number};tenders?:{method:string;amount:number}[]}|null};
export const money=(n:unknown)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n??0));
export const date=(s:string|null)=>s?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Phnom_Penh",dateStyle:"medium",timeStyle:"short"}).format(new Date(s)):"—";
export const cents=(n:unknown)=>Math.round(Number(n||0)*100);
function recordedCents(value: unknown, label: string): number {
 if (value === null || value === undefined || value === "") return 0;
 const n = Number(value);
 if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) {
  throw new Error(`Invalid recorded ${label}. Review this order before closing the register.`);
 }
 return Math.round(n * 100);
}
export function payments(o:Order){
 const meta=o.pos_checkout;
 const paid=recordedCents(meta?.receipt?.amountPaid??o.amount_paid,"payment");
 const change=recordedCents(meta?.receipt?.change??o.change_amount,"change");
 if(change>paid)throw new Error("Recorded change exceeds payment received.");
 const received=paid-change;
 if(meta?.cashReceived !== undefined && meta.cashReceived !== null){
  const cash=recordedCents(meta.cashReceived,"drawer cash");
  if(cash>received)throw new Error("Recorded drawer cash exceeds the payment. Review the order before closing.");
  return{cash,noncash:received-cash};
 }
 if(meta?.tenders?.length){
  let cash=0,noncash=0;
  for(const t of meta.tenders){const amount=recordedCents(t.amount,"tender");if(t.method==="cash")cash+=amount;else if(t.method!=="credit")noncash+=amount;}
  if(change>cash)throw new Error("Recorded cash change exceeds cash tenders.");
  cash-=change;
  if(cash+noncash!==received)throw new Error("Recorded tenders do not match payment received.");
  return{cash,noncash};
 }
 const cash=o.payment_method==="cod"||o.payment_method==="cash"?received:0;
 return{cash,noncash:received-cash};
}
export function totals(shift:Shift,movements:Movement[],orders:Order[]):{incoming:number;outgoing:number;cash:number;noncash:number;refunds:number;expected:number}{
 if(shift.status==="closed" && shift.register_summary)return shift.register_summary;
 let incoming=0,outgoing=0,cash=0,noncash=0,refunds=0;
 for(const m of movements.filter(m=>m.shift_id===shift.id)){if(m.movement_type==="cash_in")incoming+=cents(m.amount);if(m.movement_type==="cash_out"){outgoing+=cents(m.amount);if(m.reference?.startsWith("return:"))refunds+=cents(m.amount);}}
 for(const o of orders.filter(o=>o.register_shift_id===shift.id)){if(o.pos_checkout || !["cancelled","refunded"].includes(o.status)){const p=payments(o);cash+=p.cash;noncash+=p.noncash;}}
 return{incoming:incoming/100,outgoing:outgoing/100,cash:cash/100,noncash:noncash/100,refunds:refunds/100,expected:(cents(shift.opening_cash)+cash+incoming-outgoing)/100};
}
export function validCash(value:string,positive=false){const n=Number(value);return value.trim()!==""&&Number.isFinite(n)&&n>=(positive?0.01:0)&&n<=999999999.99&&Math.abs(n*100-Math.round(n*100))<0.0001;}
