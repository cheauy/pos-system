import type { BusinessRole } from '@/lib/business/types';
import type { Permission } from '@/lib/auth/permissions';
import { getAssignableRoles } from '@/lib/auth/user-role-options';
export type TeamStatus = 'active' | 'pending' | 'disabled';
export type TeamRow = {
  id: string; userId: string; name: string; email: string; phone: string;
  role: BusinessRole; branchId: string | null; status: TeamStatus;
  createdAt: string; lastActive: string | null; revision: number; passwordRequired: boolean;
};
export type TeamActivity = { id: string; description: string; createdAt: string; action: string; actor: string };
export type TeamWorkspace = {
  businessId: string; businessName: string; actorId: string; actorRole: BusinessRole;
  rows: TeamRow[]; branches: {id:string;name:string}[]; activities: TeamActivity[];
  seatLimit: number; seatsUsed: number; reservedSeats: number; canCreate: boolean; lockReason: string | null;
  effectiveRolePermissions: Record<BusinessRole, Permission[]>;
  canManageRolePermissions: boolean;
  canCreateUsers: boolean;
  canEditUsers: boolean;
  canDisableUsers: boolean;
  assignableRoles: BusinessRole[];
};
export type TeamCreateInput = {
  requestId: string; name: string; email: string; phone: string; role: BusinessRole;
  branchId: string; password: string; sendInvite: boolean; requirePasswordChange: boolean;
};
export type TeamEditInput = {name:string;phone:string;role:BusinessRole;branchId:string};
export type TeamActionResult<T=undefined> = {success:true;data:T;message:string;warning?:string} | {success:false;message:string;uncertain?:boolean};
export const NEW_USER_ROLES = ['manager','staff','cashier'] as const;
export const TEAM_ROLE_LABELS: Record<BusinessRole,string> = {owner:'Owner',manager:'Manager',staff:'Staff',cashier:'Cashier',admin:'Manager (legacy admin)'};
export const TEAM_ROLE_NOTES: Record<BusinessRole,string> = {
  owner:'Full business control. Ownership is not assignable here.',
  manager:'Daily operations; manages Staff and Cashier accounts only.',
  staff:'Read-only products, orders, customers and inventory. No checkout.',
  cashier:'POS checkout, customers, order updates and register operations.',
  admin:'Existing admin permissions are preserved for compatibility. Owner manages this account.',
};
export function isId(value:unknown):value is string{return typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);}
export function canManageTeamMember(actor:BusinessRole,actorId:string,row:Pick<TeamRow,'role'|'userId'>):boolean {
  if(actorId===row.userId || row.role==='owner')return false;
  if(actor==='owner')return true;
  if(actor==='manager' || actor==='admin')return row.role==='staff' || row.role==='cashier';
  return false;
}
export function createIssue(input:TeamCreateInput,actor:BusinessRole,allowedRoles:BusinessRole[]=getAssignableRoles(actor)):string|null {
  if(!input || !isId(input.requestId) || !isId(input.branchId))return 'Choose a starting branch and reopen the create form.';
  if(typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>120)return 'Full name must contain 2–120 characters.';
  if(typeof input.email!=='string'||input.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))return 'Enter a valid email address.';
  if(typeof input.phone!=='string'||input.phone.length>40||(input.phone.trim()!==''&&!/^[+\d() .-]{3,40}$/.test(input.phone.trim())))return 'Enter a valid phone number or leave it empty.';
  if(!NEW_USER_ROLES.includes(input.role as typeof NEW_USER_ROLES[number])||!allowedRoles.includes(input.role))return 'You cannot assign this role.';
  if(input.sendInvite!==false || input.requirePasswordChange!==true)return 'New users use a temporary password and must change it on first sign in.';
  if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)return 'Use a temporary password of 12–128 characters.';
  return null;
}
export function editIssue(input:TeamEditInput,actor:BusinessRole,allowedRoles:BusinessRole[]=getAssignableRoles(actor)):string|null {
  return createIssue({...input,email:'validation@example.com',requestId:'00000000-0000-4000-8000-000000000000',password:'validation-only-123',sendInvite:false,requirePasswordChange:true},actor,allowedRoles);
}
export function safeCsv(value:unknown):string {
  let text=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function exportTeamCsv(rows:TeamRow[]):string {
  return '\uFEFF'+[['Name','Email','Phone','Role','Status','Created'],...rows.map(r=>[r.name,r.email,r.phone,TEAM_ROLE_LABELS[r.role]||r.role,r.status,r.createdAt])].map(row=>row.map(safeCsv).join(',')).join('\r\n');
}
export function filterTeam(rows:TeamRow[],search:string,status:string,role:string,branch:string,sort:string):TeamRow[]{
 const q=search.trim().toLowerCase();
 return rows.filter(r=>(!q||`${r.name} ${r.email} ${r.phone} ${TEAM_ROLE_LABELS[r.role]}`.toLowerCase().includes(q))&&(status==='all'||r.status===status)&&(role==='all'||r.role===role)&&(branch==='all'||r.branchId===branch||(branch==='owner'&&r.role==='owner')))
 .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='oldest'?a.createdAt.localeCompare(b.createdAt):sort==='lastActive'?(b.lastActive||'').localeCompare(a.lastActive||'')||b.id.localeCompare(a.id):b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
