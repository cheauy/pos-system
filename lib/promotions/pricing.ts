export type Campaign = {
  id: string; code: string; is_active: boolean; is_automatic: boolean;
  apply_pos: boolean; apply_online: boolean; product_ids: string[] | null;
  discount_type: 'percentage' | 'fixed'; discount_value: number;
  minimum_order: number; max_discount: number | null;
  starts_at: string | null; ends_at: string | null;
  usage_limit: number | null; usage_count: number; per_customer_limit: number | null;
};
export function campaignActive(c:Campaign,channel:'pos'|'online',now=Date.now()) {
  return c.is_active && (channel==='pos'?c.apply_pos:c.apply_online)
    && (!c.starts_at||Date.parse(c.starts_at)<=now) && (!c.ends_at||Date.parse(c.ends_at)>=now);
}
export function campaignDiscount(c:Campaign,amount:number) {
  if (!Number.isFinite(amount) || !Number.isFinite(Number(c.discount_value)) || amount <= 0 || Number(c.discount_value) <= 0) return 0;
  const cents=Math.max(0,Math.round(amount*100));
  const value=Math.round(Number(c.discount_value)*100);
  const discount=c.discount_type==='percentage'?Number((BigInt(cents)*BigInt(value)+BigInt(5000))/BigInt(10000)):value;
  return Math.min(cents,discount,c.max_discount===null?cents:Math.round(Number(c.max_discount)*100))/100;
}
export function promotionalPrice(id:string,price:number,campaigns:Campaign[],channel:'pos'|'online',now=Date.now()) {
  const discounts=campaigns.filter(c=>c.is_automatic&&campaignActive(c,channel,now)&&(!c.product_ids||c.product_ids.includes(id)))
    .map(c=>campaignDiscount(c,price));
  return Math.max(0,Math.round((price-Math.max(0,...discounts))*100)/100);
}
export function couponPreview(c:Campaign|undefined,lines:{productId:string;unitPrice:number;quantity:number}[],channel:'pos'|'online') {
  if(!c||c.is_automatic||!campaignActive(c,channel))return {discount:0,error:'This coupon is unavailable for this channel.'};
  const subtotal=lines.reduce((sum,l)=>sum+Math.round(l.unitPrice*100)*l.quantity,0)/100;
  if(subtotal<Number(c.minimum_order))return {discount:0,error:`Minimum order: ${c.minimum_order}.`};
  if(c.usage_limit!==null&&c.usage_count>=c.usage_limit)return {discount:0,error:'This coupon has reached its usage limit.'};
  const eligible=lines.filter(l=>!c.product_ids||c.product_ids.includes(l.productId)).reduce((sum,l)=>sum+Math.round(l.unitPrice*100)*l.quantity,0)/100;
  if(eligible<=0)return {discount:0,error:'Add an eligible product to use this coupon.'};
  return {discount:campaignDiscount(c,eligible),error:null};
}
