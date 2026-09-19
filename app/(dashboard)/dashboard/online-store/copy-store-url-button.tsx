"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function CopyStoreUrlButton({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Store URL copied");
    } catch {
      toast.error("Unable to copy store URL");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy store URL"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-blue-600"
      aria-label="Copy store URL"
    >
      <Copy size={14} />
    </button>
  );
}
