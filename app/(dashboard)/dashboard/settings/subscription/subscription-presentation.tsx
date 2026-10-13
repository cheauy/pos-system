"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import styles from "./subscription-responsive.module.css";

export default function SubscriptionPresentation({ children, action }: { children: ReactNode; action: ReactNode }) {
  const [tab, setTab] = useState("overview");
  const root = useRef<HTMLElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!action) return;
    const viewport = window.visualViewport;
    const update = () => {
      root.current?.style.setProperty("--subscription-action-height", `${footer.current?.offsetHeight ?? 0}px`);
      root.current?.style.setProperty("--subscription-keyboard-gap", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    };
    const observer = new ResizeObserver(update);
    if (footer.current) observer.observe(footer.current);
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => { observer.disconnect(); viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, [action]);
  return (
    <main ref={root} className={`mx-auto w-full max-w-[1540px] space-y-4 pb-10 ${styles.responsive}`} data-tab={tab} data-has-action={Boolean(action)}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Subscription & Plan">
          {["overview", "payments"].map((value) => (
            <button key={value} id={`subscription-${value}-tab`} type="button" role="tab" aria-selected={tab === value} aria-controls={`subscription-${value}`} tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)} onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === "Home" ? "overview" : event.key === "End" ? "payments" : tab === "overview" ? "payments" : "overview";
                  setTab(next);
                  document.getElementById(`subscription-${next}-tab`)?.focus();
                }
              }}>
              {value === "overview" ? "Overview" : "Payments"}
            </button>
          ))}
        </div>
        <a href="#billing-history" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm"><History size={16} />Billing History</a>
      </div>
      {children}
      {action ? <div ref={footer} className={styles.bottomAction}>{action}</div> : null}
    </main>
  );
}

export function SubscriptionExtras({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <aside className={`space-y-4 max-sm:hidden ${styles.extras}`} data-expanded={expanded}>
    <button type="button" className={styles.extraToggle} aria-expanded={expanded} aria-controls="subscription-extra-details" onClick={() => setExpanded(!expanded)}>Usage & Access</button>
    <div id="subscription-extra-details" className={`space-y-4 ${styles.extraBody}`}>{children}</div>
  </aside>;
}
