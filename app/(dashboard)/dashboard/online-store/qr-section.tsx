"use client";

import {
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  createBusinessTable,
  deleteBusinessTable,
  regenerateBusinessTableToken,
  type TableActionState,
} from "./qr-actions";

type BusinessTable = {
  id: string;
  name: string;
  public_token: string;
  is_active: boolean;
};

const initialState: TableActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

function getQrImageUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(value)}`;
}

export default function QrSection({
  storeUrl,
  tables,
  allowDineIn,
  canEdit,
}: {
  storeUrl: string;
  tables: BusinessTable[];
  allowDineIn: boolean;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createBusinessTable,
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Link copied");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
          <QrCode size={22} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">QR Codes & Tables</h2>
          <p className="mt-1 text-sm text-slate-500">
            Share your store QR, or create a unique QR for each restaurant table.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <img
            src={getQrImageUrl(storeUrl)}
            alt="Store QR code"
            className="mx-auto aspect-square w-full max-w-[180px] rounded-xl bg-white p-2"
          />
          <p className="mt-3 text-center text-sm font-semibold text-slate-900">Store QR</p>
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-sm font-semibold text-slate-900">Public store link</p>
          <p className="mt-1 break-all text-sm text-slate-500">{storeUrl}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(storeUrl)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Copy size={16} /> Copy Link
            </button>
            <a
              href={getQrImageUrl(storeUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink size={16} /> Open QR
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Table QR ordering</h3>
            <p className="mt-1 text-sm text-slate-500">
              Each table QR automatically opens the store in Dine In mode.
            </p>
          </div>

          {canEdit && (
            <form action={formAction} className="flex gap-2">
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Table 1"
                className="h-11 min-w-0 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={pending || !allowDineIn}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add Table
              </button>
            </form>
          )}
        </div>

        {!allowDineIn && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Turn on Dine In under Ordering & Fulfillment before creating table QR codes.
          </p>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => {
            const tableUrl = `${storeUrl.replace(/\/+$/, "")}/?table=${encodeURIComponent(table.public_token)}`;
            return (
              <article key={table.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex gap-4">
                  <img
                    src={getQrImageUrl(tableUrl)}
                    alt={`${table.name} QR code`}
                    className="h-24 w-24 rounded-xl border border-slate-200 bg-white p-1"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-900">{table.name}</h4>
                    <p className="mt-1 line-clamp-2 break-all text-xs text-slate-500">{tableUrl}</p>
                    <button
                      type="button"
                      onClick={() => copy(tableUrl)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600"
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                </div>

                {canEdit && (
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                    <form action={regenerateBusinessTableToken}>
                      <input type="hidden" name="tableId" value={table.id} />
                      <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                        <RefreshCw size={13} /> New QR
                      </button>
                    </form>
                    <form action={deleteBusinessTable}>
                      <input type="hidden" name="tableId" value={table.id} />
                      <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                        <Trash2 size={13} /> Delete
                      </button>
                    </form>
                  </div>
                )}
              </article>
            );
          })}

          {tables.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
              No table QR codes yet.
            </div>
          )}
        </div>
      </div>

      <p className="mt-5 text-xs text-slate-400">
        QR images are rendered by the public QRServer image endpoint; TENH only sends the public store URL to generate the image.
      </p>
    </section>
  );
}
