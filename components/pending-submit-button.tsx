"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Spinner shown on Create buttons while their action runs. */
export function ButtonSpinner() {
  return <span aria-hidden className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

/** Submit button for server-action forms: disabled with a spinner until the action finishes. */
export default function PendingSubmitButton({ children, pendingLabel, className }: { children: ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-70`}>{pending ? <><ButtonSpinner />{pendingLabel}</> : children}</button>;
}
