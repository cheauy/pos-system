"use client";

import { Loader2 } from "lucide-react";

type LoadingOverlayProps = {
  visible: boolean;
  title?: string;
  description?: string;
};

export function LoadingOverlay({
  visible,
  title = "Processing...",
  description = "Please wait while the request is completed.",
}: LoadingOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>

          <div>
            <p className="font-semibold text-slate-900">
              {title}
            </p>

            <p className="mt-1 text-sm leading-5 text-slate-500">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}