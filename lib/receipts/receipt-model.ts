import type { SaleReceipt } from '@/app/(dashboard)/dashboard/pos/pos-workspace-types';
export type ReceiptTemplate = 'classic';
export function printTextScale(value:unknown){return value==='small'?0.85:value==='large'?1.2:1;}
export type ReceiptAppearance = {
  template: ReceiptTemplate; paperSize: '58mm' | '76mm' | '80mm'; logoUrl: string | null; qrUrl: string | null; showQr: boolean;
  header: string; footer: string; returnPolicy: string;
  fontSize: 'small' | 'medium' | 'large'; density: 'compact' | 'comfortable'; alignment: 'left' | 'center';
  showLogo: boolean; showPhone: boolean; showAddress: boolean; showCustomer: boolean;
  showDiscount: boolean; showPayment: boolean; showFulfillment: boolean; showNotes: boolean;
  showOrderNumber: boolean; showLoyalty: boolean; showCashier: boolean;
};
export type ReceiptContext = { branchId?: string; appearance: ReceiptAppearance; store: { name: string; phone: string; address: string }; };
export const DEFAULT_RECEIPT: ReceiptAppearance = {
  template:'classic',paperSize:'80mm',logoUrl:null,qrUrl:null,showQr:true,header:'',footer:'Thank you for shopping with us.',returnPolicy:'',
  fontSize:'medium',density:'comfortable',alignment:'center',
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
    template:'classic',
    fontSize:r.font_size==='small'?'small':r.font_size==='large'?'large':'medium',density:r.density==='compact'?'compact':'comfortable',alignment:r.receipt_alignment==='left'?'left':'center',
    paperSize:r.paper_size==='58mm'?'58mm':r.paper_size==='76mm'?'76mm':'80mm',
    qrUrl:receiptLogoUrl(r.receipt_qr_url),showQr:r.show_receipt_qr!==false,
    logoUrl:receiptLogoUrl(Object.prototype.hasOwnProperty.call(r,'receipt_logo_url') ? r.receipt_logo_url : fallbackLogo),
    header:String(r.header_text || ''),footer:r.footer_text==null?DEFAULT_RECEIPT.footer:String(r.footer_text),returnPolicy:String(r.return_policy || ''),
    showLogo:flag('show_logo'),showPhone:flag('show_phone'),showAddress:flag('show_address'),showCustomer:flag('show_customer'),
    showDiscount:flag('show_discount'),showPayment:flag('show_payment'),showFulfillment:flag('show_fulfillment'),
    showNotes:r.show_notes===true,showOrderNumber:flag('show_order_number'),showLoyalty:flag('show_loyalty'),showCashier:flag('show_cashier'),
  };
}
export function receiptSettingsIssue(a: ReceiptAppearance): string | null {
  if(!a || a.template!=='classic' || !['58mm','76mm','80mm'].includes(a.paperSize)) return 'Choose a valid template and paper width.';
  if(!['small','medium','large'].includes(a.fontSize)||!['compact','comfortable'].includes(a.density)||!['left','center'].includes(a.alignment))return 'Choose valid text size, spacing and alignment.';
  for(const k of ['header','footer','returnPolicy'] as const) if(typeof a[k]!=='string' || a[k].length>500) return 'Receipt text must be 500 characters or fewer.';
  for(const k of ['showLogo','showPhone','showAddress','showCustomer','showDiscount','showPayment','showFulfillment','showNotes','showOrderNumber','showLoyalty','showCashier'] as const) if(typeof a[k]!=='boolean') return 'Invalid receipt visibility setting.';
  if(a.qrUrl!=null && !receiptLogoUrl(a.qrUrl)) return 'Use a valid QR image URL.';
  if(typeof a.showQr!=='boolean') return 'Invalid QR visibility setting.';
  if(a.logoUrl!=null && !receiptLogoUrl(a.logoUrl)) return 'Use an HTTPS image URL or a local public image path.';
  return null;
}
export function receiptSample(name:string): SaleReceipt {
 return {orderId:'preview',orderNumber:'POS-20260919-001',createdAt:'2026-09-19T03:24:00Z',businessName:name,branchName:'Main branch',cashierName:'Sample cashier',customerName:'Walk-in',currency:'USD',subtotal:55,manualDiscount:5,discount:5,deliveryFee:0,taxRate:0,taxAmount:0,total:50,amountPaid:50,change:0,remaining:0,pointsRedeemed:0,pointsEarned:0,note:'Preview only — not a saved order.',tenders:[{method:'bank_transfer',amount:50,reference:''}],lines:[{name:'T-shirt',variant:'White / M',quantity:1,unitPrice:15,subtotal:15,options:[]},{name:'Hoodie',variant:'Black / L',quantity:1,unitPrice:28,subtotal:28,options:[]},{name:'Cap',variant:'Black',quantity:1,unitPrice:12,subtotal:12,options:[]}]};
}
