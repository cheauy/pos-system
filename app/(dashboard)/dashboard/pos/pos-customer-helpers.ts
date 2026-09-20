import type { Customer, PaymentMethod } from './pos-workspace-types';

export type PickerCustomer = Customer & { created_at: string | null };
export type CustomerFieldFlags = { emailEnabled:boolean; birthdayEnabled:boolean };
export type CustomerPage = { items: PickerCustomer[]; hasMore: boolean; nextOffset: number; canCreate: boolean; fieldSettings?: CustomerFieldFlags };
export type CustomerInput = { branchId?: string; id: string; name: string; phone: string; address: string; email?:string; birthday?:string };

/** These are hidden only for an anonymous in-store sale, not Pickup or Delivery. */
export function paymentHiddenForWalkIn(method: PaymentMethod, isWalkIn: boolean): boolean {
  return isWalkIn && (method === 'cod' || method === 'deposit' || method === 'other');
}

export function customerInputIssue(value: CustomerInput, fields:CustomerFieldFlags={emailEnabled:true,birthdayEnabled:true}): string | null {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)) return 'Invalid customer request. Reopen Add customer.';
  if (value.branchId !== undefined && (typeof value.branchId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.branchId))) return 'Invalid customer branch.';
  if (typeof value.name !== 'string' || value.name.trim().length < 2 || value.name.trim().length > 120) return 'Customer name must contain 2–120 characters.';
  if (typeof value.phone !== 'string' || !/^[+0-9() .-]{5,40}$/.test(value.phone.trim()) || value.phone.replace(/\D/g,'').length < 5 || value.phone.replace(/\D/g,'').length > 20) return 'Enter a phone number with 5–20 digits.';
  if (typeof value.address !== 'string' || value.address.trim().length > 500) return 'Address must be 500 characters or fewer.';
  if(fields.emailEnabled && value.email) {
    if(typeof value.email!=='string' || value.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) return 'Enter a valid email address.';
  }
  if(fields.birthdayEnabled && value.birthday) {
    const b=value.birthday;
    if(typeof b!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 'Enter a valid birthday.';
    const date=new Date(b+'T00:00:00Z');
    if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==b || b>new Date().toISOString().slice(0,10)) return 'Enter a valid birthday that is not in the future.';
  }
  return null;
}

export function newestCustomers(rows: PickerCustomer[]): PickerCustomer[] {
  const time = (s: string | null) => { const n = s ? Date.parse(s) : NaN; return Number.isFinite(n) ? n : -Infinity; };
  return [...rows].sort((a,b) => {
    const at=time(a.created_at), bt=time(b.created_at);
    if(at!==bt) return bt>at ? 1 : -1;
    return b.id.localeCompare(a.id);
  });
}
export function mergeCustomerPage(current: PickerCustomer[], incoming: PickerCustomer[]): PickerCustomer[] {
  return newestCustomers(Array.from(new Map([...current,...incoming].map(row=>[row.id,row])).values()));
}
