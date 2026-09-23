export type BranchSwitchOrigin = { businessId: string; userId: string; branchId: string };
export function isBranchId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function validSwitchOrigin(value: unknown): value is BranchSwitchOrigin {
  if (!value || typeof value !== 'object') return false;
  const v=value as BranchSwitchOrigin;
  return isBranchId(v.businessId) && isBranchId(v.userId) && (v.branchId === '' || isBranchId(v.branchId));
}
export const branchChannelKey=(businessId:string,userId:string)=>`tenh-workspace-branch:${businessId}:${userId}`;
// Never carry a branch filter, selected record ID, page or mutation query into
// the next workspace. Detail/edit routes return to their module's index.
export function branchDestination(pathname: string): string {
  if (!pathname.startsWith('/dashboard') || pathname.includes('\\') || pathname.startsWith('//')) return '/dashboard';
  const path=pathname.split(/[?#]/)[0];
  const parts=path.split('/').filter(Boolean);
  if(parts[0]!=='dashboard')return '/dashboard';
  const detail=parts.slice(2).some(p=>isBranchId(p)||/^(new|create|edit)$/.test(p));
  return detail ? `/dashboard/${parts[1] || ''}`.replace(/\/$/,'') : path;
}

export function posBranchSwitchReason(target: string | undefined, state: { busy: boolean; pendingBranchId: string | null; hasCart: boolean; hasDialog: boolean }): string | null {
  if(state.busy)return 'A POS save or payment is in progress. Wait before switching branches.';
  if(state.pendingBranchId)return target===state.pendingBranchId ? null : 'Resolve the pending sale first, or switch back to the branch of that pending request.';
  if(state.hasCart)return 'Hold or clear the current POS order before switching branches.';
  if(state.hasDialog)return 'Close the POS dialog and save any customer details before switching branches.';
  return null;
}
