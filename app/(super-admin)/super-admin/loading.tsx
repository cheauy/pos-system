import { ActivitySignal } from '@/components/ui/activity-link';

export default function SuperAdminLoading() {
  return <div className="space-y-5" aria-busy="true" aria-label="Loading Super Admin">
    <ActivitySignal />
    <div className="h-8 w-48 rounded-lg bg-slate-200 motion-safe:animate-pulse dark:bg-slate-800" />
    <div className="grid gap-4 sm:grid-cols-3">{[0,1,2].map(id => <div key={id} className="h-24 rounded-2xl bg-slate-200 motion-safe:animate-pulse dark:bg-slate-800" />)}</div>
  </div>;
}
