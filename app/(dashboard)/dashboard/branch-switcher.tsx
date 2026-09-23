"use client";
// Compatibility wrapper. All switching goes through the workspace-wide guards.
import { useWorkspaceBranch } from "./workspace-branch-provider";
export default function BranchSwitcher({ branches, branchId }: { branches: { id:string; name:string }[]; branchId:string }) {
  const {requestSwitch}=useWorkspaceBranch();
  return <label>Workspace branch<select aria-label="Switch operating branch" value={branchId} onChange={e=>void requestSwitch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>;
}
