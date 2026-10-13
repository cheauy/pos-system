"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useRef, useState, useEffect, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UserRound, Landmark, CalendarDays, Coins, Banknote, CreditCard, LockKeyhole, UnlockKeyhole, FileText, Calculator, TriangleAlert, ArrowRightLeft, Zap, ShieldCheck, Scale, PlusCircle, X, ChevronDown } from "lucide-react";
import PrintButton from "@/components/print-button";
import ContentSkeleton from "@/components/ui/content-skeleton";
import { useWorkspaceBranch, useBranchSwitchGuard } from "../workspace-branch-provider";
import { openRegisterShift, addCashMovement, closeRegisterShift } from "./actions";
import { totals, money, date, payments, cents, type Branch, type Shift, type Movement, type Order } from "./register-model";
import styles from "./register-workspace.module.css";

const input = "w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50";
const panel = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
const denominations = [100, 50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05, 0.01];
type Draft = "opening" | "movement" | "closing";
type Run = (action: (data: FormData) => Promise<void>, data: FormData, success: string, draft: Draft) => Promise<boolean>;

type RegisterProps = { branchId: string; branches: Branch[]; shifts: Shift[]; movements: Movement[]; orders: Order[]; names: Record<string, string> };

export default function RegisterClient(props: RegisterProps) {
  const workspace = useWorkspaceBranch();
  const noBranch = !workspace.branchId || workspace.branchId === "all";
  const loading = workspace.changing || (!noBranch && workspace.branchId !== props.branchId);
  const selected = props.branches.filter(branch => branch.id === workspace.branchId && branch.is_active);
  if (loading || noBranch || selected.length !== 1) {
    return <main className={`${styles.workspace} space-y-4 text-slate-900`}>
      <RegisterHeader disabled />
      {loading ? <ContentSkeleton kind="form" /> : <p role="alert" className={panel}>{noBranch ? "Choose one branch in the workspace header to use its cash register." : "No valid register is available for the selected branch. Refresh or ask the Owner to review its branch settings."}</p>}
    </main>;
  }
  // Remount branch drafts and reports only after matching server data has arrived.
  return <RegisterWorkspace key={workspace.branchId} {...props} />;
}

function RegisterWorkspace({ branchId: branch, branches, shifts, movements, orders, names }: RegisterProps) {
  const { t: translateLabel } = useLanguage();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const locked = useRef(false);
  const [drafts, setDrafts] = useState<Partial<Record<Draft, boolean>>>({});
  const dirty = Object.values(drafts).some(Boolean);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<Shift | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const history = useRef<HTMLElement>(null);
  useBranchSwitchGuard(() => locked.current || busy ? "Cash register update in progress. Wait before switching branches." : null);

  function markDraft(draft: Draft) {
    setDrafts(previous => previous[draft] ? previous : { ...previous, [draft]: true });
  }

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (busy || dirty || dialog.current?.open) return;
      last = Date.now();
      router.refresh();
    };
    // Each refresh re-reads live orders and movements; reuse reads within 30 seconds.
    const onFocus = () => { if (Date.now() - last >= 30000) refresh(); };
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [busy, dirty, router]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (busy || !window.confirm(translateLabel("Discard unsaved changes?"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, busy, translateLabel]);

  const list = shifts.filter(s => s.location_id === branch);
  const opened = list.filter(s => s.status === "open");
  const ambiguous = opened.length > 1;
  const open = opened.length === 1 ? opened[0] : undefined;
  const selected = branches.find(b => b.id === branch);
  const closingOnly = Boolean(selected?.plan_disable_pending);
  const summary = list.map(s => totals(s, movements, orders));
  const finalClosures = branches.filter(b => b.id !== branch && b.is_active && b.plan_disable_pending).map(b => ({ branch: b, shifts: shifts.filter(s => s.location_id === b.id && s.status === "open") })).filter(item => item.shifts.length > 0);

  const run: Run = async (action, data, success, draft) => {
    if (locked.current || busy) return false;
    const shiftId = data.get("shiftId");
    const ordinaryShift = !ambiguous && open?.id === shiftId;
    const finalClosure = draft === "closing" && finalClosures.some(item => item.shifts.length === 1 && item.shifts[0].id === shiftId);
    const validOpening = !ambiguous && !open && !closingOnly && data.get("locationId") === branch;
    const validShift = (ordinaryShift || finalClosure) && (draft !== "movement" || !closingOnly);
    if (draft === "opening" ? !validOpening : !validShift) {
      setError("The register context changed. Refresh before continuing.");
      return false;
    }
    if (draft === "closing" && drafts.movement && !window.confirm(translateLabel("Discard unsaved changes?"))) return false;
    locked.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await action(data);
      setDrafts(previous => draft === "movement" ? { ...previous, movement: false } : {});
      setMessage(success);
      startRefresh(() => router.refresh());
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to update register.");
      return false;
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  function showReport(shift: Shift) { setReport(shift); dialog.current?.showModal(); }

  return <main className={`${styles.workspace} space-y-4 text-slate-900`} onChange={event => {
    const draft = (event.target as HTMLElement).closest("form")?.dataset.draft as Draft | undefined;
    if (draft) markDraft(draft);
  }}>
    <RegisterHeader onView={() => {
          const closed = list.find(s => s.status === "closed");
          if (closed) showReport(closed); else history.current?.scrollIntoView({ behavior: "smooth" });
    }} />
    {(error || message) && <p role={error ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}
    {ambiguous ? <p role="alert" className={panel}>More than one open shift exists for this branch. Refresh or ask the Owner to resolve the register state before recording cash.</p> : open ? <ShiftWorkspace key={open.id} shift={open} branchName={selected?.name || translateLabel("Branch")} staff={names[open.opened_by] || translateLabel("Staff")}
      movements={movements} orders={orders} busy={busy} run={run} closingOnly={closingOnly} markDraft={markDraft} />
      : <section key={branch} className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Title icon={<UnlockKeyhole />} title="Open Register" text={translateLabel("Register: ") + (selected?.name || translateLabel("Branch"))} />
          <Badge open={false} />
        </div>
        <form data-draft="opening" className="mt-4" onSubmit={async event => {
          event.preventDefault();
          await run(openRegisterShift, new FormData(event.currentTarget), "Register opened.", "opening");
        }}>
          <input type="hidden" name="locationId" value={branch} />
          <fieldset disabled={busy} className={styles.openingForm}>
            <Field label="Opening cash ($)"><input name="openingCash" required type="number" min="0" max="999999999.99" step="0.01" defaultValue="0.00" className={input} /></Field>
            <Field label="Opening note (optional)"><textarea name="note" rows={1} maxLength={1000} className={input} placeholder="Add a note…" /></Field>
            <button type="submit" disabled={!selected?.is_active || closingOnly} className={primary}><UnlockKeyhole size={17} />Open Shift</button>
          </fieldset>
          {closingOnly ? <p className="mt-3 text-sm text-amber-700">This branch is closing after the plan change. Close its existing register; a new shift cannot be opened.</p>
            : !selected?.is_active && <p className="mt-3 text-sm text-amber-700">Choose an active branch to open its register.</p>}
        </form>
      </section>}
    {open && <MovementFeed shift={open} movements={movements} orders={orders} names={names} />}
    <section ref={history} className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title icon={<FileText />} title="Shift History / Z Report" text="Recent shifts for this branch, plus all open shifts" />
        <div className="flex flex-wrap gap-2">
          <Metric small label="Cash sales" value={summary.reduce((n, s) => n + cents(s.cash), 0) / 100} icon={<Banknote />} tone="green" />
          <Metric small label="Non-cash sales" value={summary.reduce((n, s) => n + cents(s.noncash), 0) / 100} icon={<CreditCard />} />
        </div>
      </div>
      <ul className="mt-4 divide-y divide-slate-200">
        {list.map(shift => {
          const t = totals(shift, movements, orders);
          return <li key={shift.id} className="py-3">
            <div className={styles.historyRow}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm" data-i18n-ignore={Boolean(names[shift.opened_by])}>{names[shift.opened_by] || "Staff"}</strong><Badge open={shift.status === "open"} /></div>
                <p className="mt-1 text-xs text-slate-500">{date(shift.opened_at)}</p>
                <p className="break-words text-xs text-slate-500" data-i18n-ignore="true">{selected?.name}</p>
              </div>
              <dl className={styles.historyAmounts}>
                <Amount label="Expected" value={shift.expected_cash} />
                <Amount label="Actual" value={shift.closing_cash} />
                <Amount label="Over / Short" value={shift.variance} tone={shift.variance == null ? "" : Number(shift.variance) === 0 ? "text-emerald-600" : "text-red-600"} />
              </dl>
              <button type="button" className={secondary} onClick={() => showReport(shift)}><FileText size={16} />{shift.status === "closed" ? "View / Print Z" : "View"}</button>
            </div>
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-blue-600"><ChevronDown size={16} />Show details</summary>
              <dl className={`${styles.historyDetails} rounded-xl bg-slate-50 p-3`}>
                <Amount label="Opened" text={date(shift.opened_at)} />
                <Amount label="Closed" text={date(shift.closed_at)} />
                <Amount label="Opening cash" value={shift.opening_cash} />
                <Amount label="Cash sales" value={t.cash} /><Amount label="Non-cash sales" value={t.noncash} />
                <Amount label="Cash in" value={t.incoming} /><Amount label="Cash out" value={t.outgoing} /><Amount label="Cash refunds" value={t.refunds} />
              </dl>
              {shift.opening_note && <p className="mt-2 whitespace-pre-wrap break-words text-sm"><span>Opening note (optional)</span>: <span data-i18n-ignore="true">{shift.opening_note}</span></p>}
              {shift.closing_note && <p className="mt-2 whitespace-pre-wrap break-words text-sm"><span>Closing note</span>: <span data-i18n-ignore="true">{shift.closing_note}</span></p>}
            </details>
          </li>;
        })}
      </ul>
      {!list.length && <p className="py-6 text-center text-sm text-slate-500">No shifts recorded for this branch.</p>}
    </section>
    {finalClosures.map(item => <details key={item.branch.id} className={panel}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold"><LockKeyhole size={18} /><span>Final branch closure:</span><span data-i18n-ignore="true">{item.branch.name}</span></summary>
      <div className="mt-4 space-y-4">
        {item.shifts.length === 1 ? <><ShiftWorkspace idPrefix={`register-final-${item.shifts[0].id}`} shift={item.shifts[0]} branchName={item.branch.name} staff={names[item.shifts[0].opened_by] || translateLabel("Staff")} movements={movements} orders={orders} busy={busy} run={run} closingOnly markDraft={markDraft} />
          <button type="button" className={secondary} onClick={() => showReport(item.shifts[0])}><FileText size={16} />View</button></>
          : <p role="alert">More than one open shift exists for this branch. Refresh or ask the Owner to resolve the register state before recording cash.</p>}
      </div>
    </details>)}
    <dialog ref={dialog} aria-labelledby="register-report-title" className="m-auto max-h-[90dvh] w-[min(650px,95vw)] overflow-auto rounded-2xl bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40 sm:p-6">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <h2 id="register-report-title" className="font-bold">{report?.status === "closed" ? "Z Report" : "Open shift summary"}</h2>
        <button type="button" aria-label="Close report" className={secondary} onClick={() => dialog.current?.close()}><X size={18} /></button>
      </div>
      {report && <>
        <div id="shift-report-print">
          <h2 className="text-xl font-bold">{report.status === "closed" ? "Z Report" : "Open shift summary"}</h2>
          <p className="mt-1 break-words text-sm"><span data-i18n-ignore="true">{branches.find(b => b.id === report.location_id)?.name}</span> · <span data-i18n-ignore={Boolean(names[report.opened_by])}>{names[report.opened_by] || "Staff"}</span></p>
          <p className="break-all text-xs text-slate-500">Shift {report.id}</p>
          <dl className="mt-5 divide-y">
            {[
              ["Opened", date(report.opened_at)], ["Closed", date(report.closed_at)],
              ["Opening cash", money(report.opening_cash)], ["Cash sales", money(totals(report, movements, orders).cash)],
              ["Non-cash sales", money(totals(report, movements, orders).noncash)],
              ["Cash in", money(totals(report, movements, orders).incoming)], ["Cash out", money(totals(report, movements, orders).outgoing)],
              ["Cash refunds", money(totals(report, movements, orders).refunds)],
              ["Expected cash", report.expected_cash == null ? "Not closed" : money(report.expected_cash)],
              ["Actual cash", report.closing_cash == null ? "Not closed" : money(report.closing_cash)],
              ["Over / Short", report.variance == null ? "Not closed" : money(report.variance)],
            ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2 text-sm">
              <dt>{label}</dt><dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
            </div>)}
          </dl>
          {report.opening_note && <p className="mt-4 whitespace-pre-wrap break-words text-sm"><span>Opening note (optional)</span>: <span data-i18n-ignore="true">{report.opening_note}</span></p>}
          {report.closing_note && <p className="mt-4 whitespace-pre-wrap break-words text-sm"><span>Closing note</span>: <span data-i18n-ignore="true">{report.closing_note}</span></p>}
        </div>
        {report.status === "closed" && <div className="no-print mt-5"><PrintButton label="Print Z Report" selector="#shift-report-print" /></div>}
      </>}
    </dialog>
 <style media="print">{`@page{size:A4;margin:15mm}html,body{width:auto!important;min-width:0!important;background:white!important}body *:not(:has(#shift-report-print)):not(#shift-report-print):not(#shift-report-print *){display:none!important}body *:has(#shift-report-print){position:static!important;display:block!important;margin:0!important;padding:0!important;height:auto!important;max-height:none!important;overflow:visible!important;transform:none!important}dialog:has(#shift-report-print){width:100%!important;max-width:none!important;border:0!important;box-shadow:none!important}dialog::backdrop{display:none}#shift-report-print,#shift-report-print *{visibility:visible!important;color:black!important}`}</style>
  </main>;
}

function RegisterHeader({ onView, disabled = false }: { onView?: () => void; disabled?: boolean }) {
  return <header className={styles.header}>
    <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Staff Shifts & Cash Register</h1><p className="mt-1 text-sm text-slate-500">Open a drawer, track cash movements, and close with an expected-vs-actual count.</p></div>
    <div className={styles.headerActions}><button type="button" disabled={disabled} className={secondary} onClick={onView}><FileText size={17} />View Z Report</button></div>
  </header>;
}

function ShiftWorkspace({ shift, branchName, staff, movements, orders, busy, run, closingOnly, markDraft, idPrefix = "register" }: {
  shift: Shift; branchName: string; staff: string; movements: Movement[]; orders: Order[]; busy: boolean; run: Run; closingOnly: boolean; markDraft: (draft: Draft) => void; idPrefix?: string;
}) {
  const { t: translateText } = useLanguage();
  const t = totals(shift, movements, orders);
  const [activeForm, setActiveForm] = useState<"movement" | "closing" | null>(null);
  const [type, setType] = useState("cash_in");
  const [reason, setReason] = useState("");
  const [counted, setCounted] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const movementHeading = useRef<HTMLHeadingElement>(null);
  const closingHeading = useRef<HTMLHeadingElement>(null);
  const closingSubmission = useRef(false);
  const movementId = `${idPrefix}-movement-form`, closingId = `${idPrefix}-closing-form`;
  const denominationTotal = denominations.reduce((n, d) => n + cents(d) * Number(counts[d] || 0), 0) / 100;
  const variance = counted === "" ? null : (cents(counted) - cents(t.expected)) / 100;

  useEffect(() => {
    if (activeForm === "movement") movementHeading.current?.focus();
    if (activeForm === "closing") closingHeading.current?.focus();
  }, [activeForm]);

  function preset(value: string, direction: string) {
    setReason(value); setType(direction); markDraft("movement");
    form.current?.querySelector<HTMLInputElement>('input[name="amount"]')?.focus();
  }

  return <div className="space-y-4">
    <section className={panel}>
      <div className={styles.summary}>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-3 text-lg font-bold"><span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />Active Shift</h2>
            <Badge open />
          </div>
          <div className={`${styles.shiftInfo} mt-4`}>
            <Info icon={<UserRound />} label="Cashier" value={staff} />
            <Info icon={<Landmark />} label="Register" value={branchName} />
            <Info icon={<CalendarDays />} label="Opened" value={date(shift.opened_at)} />
          </div>
          {shift.opening_note && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-500" data-i18n-ignore="true">{shift.opening_note}</p>}
        </div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Estimated cash in drawer</p>
          <p className="mt-1 break-words text-3xl font-bold tracking-tight text-blue-600 sm:text-4xl">{money(t.expected)}</p>
          <dl className={`${styles.breakdown} mt-4 border-t border-slate-200 pt-3`}>
            <Amount label="Opening cash" value={shift.opening_cash} /><Amount label="Cash sales" value={t.cash} tone="text-emerald-600" />
            <Amount label="Non-cash sales" value={t.noncash} /><Amount label="Cash in" value={t.incoming} tone="text-emerald-600" />
            <Amount label="Cash out" value={t.outgoing} tone="text-red-600" /><Amount label="Cash refunds" value={t.refunds} tone="text-red-600" />
          </dl>
        </div>
      </div>
      {closingOnly && <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><TriangleAlert size={18} className="shrink-0" />This branch is closing after the plan change. New sales and cash movements are blocked. Count the drawer and close the register to finish disabling the branch.</p>}
      <div className={`${styles.actions} mt-4 border-t border-slate-200 pt-4`}>
        {!closingOnly && <button type="button" disabled={busy} className={primary} aria-expanded={activeForm === "movement"} aria-controls={movementId} onClick={() => setActiveForm(activeForm === "movement" ? null : "movement")}><PlusCircle size={18} />Record Cash Movement</button>}
        <button type="button" disabled={busy} className={secondary} aria-expanded={activeForm === "closing"} aria-controls={closingId} onClick={() => setActiveForm(activeForm === "closing" ? null : "closing")}><LockKeyhole size={18} />Close Register</button>
      </div>
    </section>

    {!closingOnly && <section id={movementId} hidden={activeForm !== "movement"} className={panel}>
      <div className="flex items-center justify-between gap-3">
        <h2 ref={movementHeading} tabIndex={-1} className="flex items-center gap-2 text-lg font-bold"><Coins size={20} className="text-blue-600" />Record Cash Movement</h2>
        <button type="button" disabled={busy} aria-label="Close" className={secondary} onClick={() => setActiveForm(null)}><X size={18} /></button>
      </div>
      <form ref={form} data-draft="movement" className="mt-4" onSubmit={async event => {
        event.preventDefault();
        if (await run(addCashMovement, new FormData(event.currentTarget), "Cash movement recorded.", "movement")) {
          form.current?.reset(); setReason(""); setActiveForm(null);
        }
      }}>
        <input type="hidden" name="shiftId" value={shift.id} />
        <fieldset disabled={busy} className="space-y-3">
          <div className={styles.formColumns}>
            <Field label="Movement type"><select name="type" className={input} value={type} onChange={event => setType(event.target.value)}><option value="cash_in">Cash In</option><option value="cash_out">Cash Out</option></select></Field>
            <Field label="Amount ($)"><input name="amount" required type="number" min="0.01" max="999999999.99" step="0.01" placeholder="0.00" className={input} /></Field>
            <Field label="Reason"><select name="reason" required className={input} value={reason} onChange={event => setReason(event.target.value)}><option value="">Select reason</option>{["Petty cash", "Safe drop", "Correction", "Cash float", "Other"].map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
          </div>
          <div className={styles.twoColumns}>
            <Field label="Reference (optional)"><input name="reference" maxLength={200} placeholder="Receipt #, transfer ID" className={input} /></Field>
            <Field label="Note (optional)"><input name="note" maxLength={500} placeholder="Add a note…" className={input} /></Field>
          </div>
          <div className={styles.actions}>
            <button type="button" className={secondary} onClick={() => preset("Petty cash", "cash_out")}><Zap size={15} />Petty cash</button>
            <button type="button" className={secondary} onClick={() => preset("Safe drop", "cash_out")}><ShieldCheck size={15} />Safe drop</button>
            <button type="button" className={secondary} onClick={() => preset("Correction", type)}><Scale size={15} />Correction</button>
            <button type="submit" className={primary}><PlusCircle size={17} />Record Movement</button>
          </div>
        </fieldset>
      </form>
    </section>}

    <section id={closingId} hidden={activeForm !== "closing"} className={panel}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 ref={closingHeading} tabIndex={-1} className="flex items-center gap-2 text-lg font-bold"><LockKeyhole size={20} className="text-blue-600" />Close Register</h2><p className="mt-1 text-sm text-slate-500">Count the physical cash and review the over / short variance.</p></div>
        <button type="button" disabled={busy} aria-label="Close" className={secondary} onClick={() => setActiveForm(null)}><X size={18} /></button>
      </div>
      <form data-draft="closing" className="mt-4" onSubmit={async event => {
        event.preventDefault();
        if (busy || closingSubmission.current) return;
        closingSubmission.current = true;
        const data = new FormData(event.currentTarget);
        try {
          if (window.confirm(translateText(`Close this shift with ${money(counted)} counted cash? The server will calculate the final variance.`))) {
            await run(closeRegisterShift, data, "Register closed. View the Z Report for the final totals.", "closing");
          }
        } finally {
          closingSubmission.current = false;
        }
      }}>
        <input type="hidden" name="shiftId" value={shift.id} />
        <fieldset disabled={busy} className="space-y-4">
          <div className={styles.formColumns}>
            <Field label="Estimated expected cash"><input readOnly value={money(t.expected)} className={`${input} bg-slate-50 font-semibold`} /></Field>
            <Field label="Actual counted cash ($)"><input name="closingCash" type="number" required min="0" max="999999999.99" step="0.01" placeholder="0.00" className={input} value={counted} onChange={event => setCounted(event.target.value)} /></Field>
            <Field label="Estimated Over / Short"><output aria-live="polite" className={`${input} block font-semibold ${variance === null ? "" : variance === 0 ? "text-emerald-700" : "text-red-600"}`}>{variance === null ? "Enter counted cash" : money(variance)}</output></Field>
          </div>
          <details className="rounded-xl border border-slate-200">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-600"><ChevronDown size={16} /><Calculator size={18} />Cash Denomination Helper</summary>
            <div className="space-y-3 border-t border-slate-200 p-3">
              <div className={styles.denominations}>{denominations.map(d => <label key={d} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                <span className="flex-1 font-semibold">{money(d)}</span>
                <input aria-label={`Number of ${money(d)} denominations`} type="number" min="0" max="99999" step="1" value={counts[d] || ""} placeholder="0" onChange={event => {
                  const value = event.target.value;
                  if (value === "" || /^\d{1,5}$/.test(value)) setCounts({ ...counts, [d]: value });
                }} className="min-h-11 w-20 rounded-lg border border-slate-200 bg-white px-2 py-2" />
                <span className="w-full text-right text-xs text-slate-500">{money(d * Number(counts[d] || 0))}</span>
              </label>)}</div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold"><span>Total</span>: {money(denominationTotal)}</p>
                <button type="button" className={secondary} onClick={() => { setCounted(denominationTotal.toFixed(2)); markDraft("closing"); }}>Use counted total</button>
              </div>
            </div>
          </details>
          <Field label="Closing note (optional)"><textarea name="note" rows={2} maxLength={1000} placeholder="Add a note about the close…" className={input} /></Field>
          <div className={styles.closeActions}>
            <p className="flex items-start gap-2 text-sm text-amber-700"><TriangleAlert size={18} className="shrink-0" />Final expected cash and variance are calculated by the server when you close.</p>
            <button type="submit" className={primary}><LockKeyhole size={17} />Close & Calculate</button>
          </div>
        </fieldset>
      </form>
    </section>
  </div>;
}

function MovementFeed({shift,movements,orders,names}:{shift:Shift;movements:Movement[];orders:Order[];names:Record<string,string>}){const [all,setAll]=useState(false);const rows=[{id:shift.id,time:shift.opened_at,title:"Opening float",detail:"Initial cash in drawer",amount:Number(shift.opening_cash),actor:names[shift.opened_by]||"Staff",cash:true},...movements.filter(m=>m.shift_id===shift.id).map(m=>({id:m.id,time:m.created_at,title:m.movement_type==="cash_in"?"Cash in":"Cash out",detail:[m.reason,m.reference].filter(Boolean).join(" · "),amount:Number(m.amount)*(m.movement_type==="cash_out"?-1:1),actor:names[m.created_by]||"Staff",cash:true})),...orders.filter(o=>o.register_shift_id===shift.id&&(o.pos_checkout || !["cancelled","refunded"].includes(o.status))).map(o=>({id:o.id,time:o.created_at,title:payments(o).cash&&payments(o).noncash?"Split payment sale":payments(o).cash?"Cash sale":"Non-cash sale",detail:o.order_number,amount:(payments(o).cash+payments(o).noncash)/100,actor:"",cash:payments(o).cash>0}))].sort((a,b)=>b.time.localeCompare(a.time));return <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><Title icon={<ArrowRightLeft/>} title="Current shift activity" text="Opening float, cash movements and collected POS payments"/><button className={secondary} onClick={()=>setAll(!all)}>{all?"Show recent":"View all movements"}</button></div><div className={`${styles.activity} mt-4`}>{(all?rows:rows.slice(0,3)).map(r=><div key={r.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><span className={`rounded-full p-2 ${r.cash?"bg-emerald-50 text-emerald-600":"bg-blue-50 text-blue-600"}`}>{r.cash?<Coins size={20}/>:<CreditCard size={20}/>}</span><div className="min-w-0 flex-1 text-xs"><p className="text-slate-500">{date(r.time)}</p><strong className="mt-1 block">{r.title}</strong><p className="mt-1 break-words text-slate-500">{r.detail}</p>{r.actor&&<p className="mt-1 text-slate-400">by {r.actor}</p>}</div><strong className={`text-xs ${r.amount<0?"text-red-600":"text-emerald-600"}`}>{money(r.amount)}</strong></div>)}</div></section>;}


function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 text-sm text-slate-500"><span className="mb-1 block">{label}</span>{children}</label>;
}
function Title({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="min-w-0"><h2 className="flex items-center gap-2 text-lg font-bold"><span className="shrink-0 text-blue-600">{icon}</span>{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}
function Badge({ open }: { open: boolean }) {
  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{open ? "Open" : "Closed"}</span>;
}
function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-center gap-3"><span className="shrink-0 rounded-lg bg-slate-50 p-2 text-blue-600">{icon}</span><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><strong className="break-words text-sm" data-i18n-ignore="true">{value}</strong></div></div>;
}
function Amount({ label, value, text, tone = "" }: { label: string; value?: number | null; text?: string; tone?: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 break-words text-sm font-semibold ${tone}`}>{text ?? (value == null ? "—" : money(value))}</dd></div>;
}
function Metric({ label, value, icon, tone = "blue", small = false }: { label: string; value: number; icon: ReactNode; tone?: string; small?: boolean }) {
  return <div className={`flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 ${small ? "px-3 py-2" : "p-3"}`}><span className={`shrink-0 rounded-full p-2 ${tone === "green" ? "bg-emerald-50 text-emerald-600" : tone === "red" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"}`}>{icon}</span><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><strong className="break-words text-sm">{money(value)}</strong></div></div>;
}
