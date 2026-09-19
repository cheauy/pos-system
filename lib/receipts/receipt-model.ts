import type { SaleReceipt } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';
export type ReceiptTemplate = 'classic' | 'compact' | 'minimal';
export type ReceiptAppearance = {
  template: ReceiptTemplate; paperSize: '58mm' | '80mm'; logoUrl: string | null;
  header: string; footer: string; returnPolicy: string;
  showLogo: boolean; showPhone: boolean; showAddress: boolean; showCustomer: boolean;
  showDiscount: boolean; showPayment: boolean; showFulfillment: boolean; showNotes: boolean;
  showOrderNumber: boolean; showLoyalty: boolean; showCashier: boolean;
};
export type ReceiptContext = { appearance: ReceiptAppearance; store: { name: string; phone: string; address: string }; };
export const DEFAULT_RECEIPT: ReceiptAppearance = {
  template:'classic',paperSize:'80mm',logoUrl:null,header:'',footer:'Thank you for shopping with us.',returnPolicy:'',
  showLogo:true,showPhone:true,showAddress:true,showCustomer:true,showDiscount:true,showPayment:true,
  showFulfillment:true,showNotes:false,showOrderNumber:true,showLoyalty:true,showCashier:true,
};
export function receiptLogoUrl(value: unknown): string | null {
  if(typeof value!=='string' || value.length>2048) return null;
  const v=value.trim();
  if(v.startsWith('/') && !v.startsWith('//') && !/[\\\u0000-\u001f]/.test(v)) return v;
  try {const u=new URL(v);return u.protocol==='https:' && !u.username && !u.password ? u.href : null;}catch{return null;}
}
export function receiptAppearance(row: Record<string,unknown> | null, fallbackLogo?: string | null): ReceiptAppearance {
  const r=row || {};const flag=(key:string)=>typeof r[key]==='boolean'?r[key] as boolean:true;
  return {
    template:['classic','compact','minimal'].includes(String(r.receipt_template))?r.receipt_template as ReceiptTemplate:'classic',
    paperSize:r.paper_size==='58mm'?'58mm':'80mm',
    logoUrl:receiptLogoUrl(Object.prototype.hasOwnProperty.call(r,'receipt_logo_url') ? r.receipt_logo_url : fallbackLogo),
    header:String(r.header_text || ''),footer:r.footer_text==null?DEFAULT_RECEIPT.footer:String(r.footer_text),returnPolicy:String(r.return_policy || ''),
    showLogo:flag('show_logo'),showPhone:flag('show_phone'),showAddress:flag('show_address'),showCustomer:flag('show_customer'),
    showDiscount:flag('show_discount'),showPayment:flag('show_payment'),showFulfillment:flag('show_fulfillment'),
    showNotes:r.show_notes===true,showOrderNumber:flag('show_order_number'),showLoyalty:flag('show_loyalty'),showCashier:flag('show_cashier'),
  };
}
export function receiptSettingsIssue(a: ReceiptAppearance): string | null {
  if(!a || !['classic','compact','minimal'].includes(a.template) || !['58mm','80mm'].includes(a.paperSize)) return 'Choose a valid template and paper width.';
  for(const k of ['header','footer','returnPolicy'] as const) if(typeof a[k]!=='string' || a[k].length>500) return 'Receipt text must be 500 characters or fewer.';
  for(const k of ['showLogo','showPhone','showAddress','showCustomer','showDiscount','showPayment','showFulfillment','showNotes','showOrderNumber','showLoyalty','showCashier'] as const) if(typeof a[k]!=='boolean') return 'Invalid receipt visibility setting.';
  if(a.logoUrl!=null && !receiptLogoUrl(a.logoUrl)) return 'Use an HTTPS image URL or a local public image path.';
  return null;
}
export function receiptSample(name:string): SaleReceipt {
 return {orderId:'preview',orderNumber:'SAMPLE-001',createdAt:'2026-09-19T09:00:00Z',businessName:name,branchName:'Main branch',customerName:'Sample customer',currency:'USD',subtotal:30,manualDiscount:3,discount:3,deliveryFee:2,taxRate:0,taxAmount:0,total:29,amountPaid:30,change:1,remaining:0,pointsRedeemed:0,pointsEarned:0,note:'Preview only — not a saved order.',tenders:[{method:'cash',amount:30,reference:''}],shipping:{method:'delivery',recipientName:'Sample customer',phone:'012 345 678',address:'Sample delivery address',carrier:'grab'},lines:[{name:'Sample product',variant:'White / M',quantity:2,unitPrice:15,subtotal:30,options:[]}]};
}
