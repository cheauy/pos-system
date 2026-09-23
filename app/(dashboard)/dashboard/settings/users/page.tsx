import Link from 'next/link';
import { requirePermission } from '@/lib/auth/require-permission';
import { loadUsersWorkspace } from './users-workspace-actions';
import UsersWorkspace from './users-workspace';

export default async function UsersPage(){
 const business=await requirePermission('users.view');
 const result=await loadUsersWorkspace(business.id);
 if(!result.success)return <main className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">User &amp; Manage User</h1><p role="alert" className="my-4 text-red-600">{result.message}</p><Link className="text-blue-600" href="/dashboard/settings">Back to Settings</Link></main>;
 return <UsersWorkspace initial={result.data}/>;
}
