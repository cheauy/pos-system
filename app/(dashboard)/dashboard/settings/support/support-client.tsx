"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headphones, Send, MessageSquare, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { submitCustomerBugReport } from "./actions";
import { SUPPORT_REASONS } from '@/lib/support/reports';
import SupportImageInput from '@/components/support-image-input';
import SupportReportImage from '@/components/support-report-image';
type Report = { id: string; title: string; description: string; reason:string|null; image_path:string|null; status: string; created_at: string };
const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
export default function CustomerSupport({ reports, loadError }: { reports: Report[]; loadError: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    setBusy(true); setError("");
    try {
      const result = await submitCustomerBugReport(new FormData(form));
      if (result.ok) { form.reset(); toast.success(result.message); router.refresh(); }
      else setError(result.message);
    } catch { setError("Unable to send your report. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-[1600px] space-y-5 pb-8">
    <Link href="/dashboard/settings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><ArrowLeft size={16} />General Settings</Link>
    <header><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><Headphones size={25} /></span><div><h1 className="text-3xl font-bold text-slate-950 dark:text-white">Report a Bug</h1><p className="mt-1 text-sm text-slate-500">Send a problem to Support and follow its progress.</p></div></div></header>
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="font-bold">New report</h2><form onSubmit={submit} className="mt-5 space-y-4"><fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        <label className="block text-sm font-semibold">Title *<input name="title" required minLength={3} maxLength={160} placeholder="Briefly describe the problem" className={field} /></label>
        <label className="block text-sm font-semibold">Reason *<select name="reason" required defaultValue="" className={field}><option value="" disabled>Choose a reason</option>{SUPPORT_REASONS.map(reason=><option key={reason}>{reason}</option>)}</select></label>
        <SupportImageInput className={field}/>
        <label className="block text-sm font-semibold">Details (optional)<textarea name="description" maxLength={6000} rows={4} placeholder="Tell us what happened…" className={field} /></label>
        </fieldset>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"><Send size={16} />{busy ? "Sending…" : "Send report"}</button>
      </form></section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-100 p-5 dark:border-slate-800"><h2 className="font-bold">My reports</h2><p className="mt-1 text-xs text-slate-500">Your latest 50 reports in this workspace</p></div>{loadError ? <p role="alert" className="p-5 text-sm text-red-600">Reports could not be loaded. Refresh to try again.</p> : reports.length ? reports.map(r => <details key={r.id} className="border-b border-slate-100 p-5 last:border-0 dark:border-slate-800"><summary className="cursor-pointer"><span className="ml-1 font-semibold">{r.title}</span><span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${r.status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{r.status === "resolved" && <CheckCircle2 size={12} />}{r.status === "in_progress" ? "In progress" : r.status === "resolved" ? "Resolved" : "Open"}</span></summary><p className="mt-3 text-sm font-semibold text-blue-600">{r.reason??"Bug or Technical Issue"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{r.description}</p>{r.image_path&&<SupportReportImage id={r.id}/>}<p className="mt-3 text-xs text-slate-400">{r.created_at.slice(0, 10)}</p></details>) : <div className="p-12 text-center text-slate-500"><MessageSquare className="mx-auto mb-3 text-slate-300" size={32} /><p className="font-semibold">No reports yet</p><p className="mt-1 text-sm">Your submitted reports will appear here.</p></div>}</section>
    </div>
  </main>;
}
