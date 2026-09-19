"use client";

import {
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MoreVertical,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  TableProperties,
  Trash2,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
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
  showTables = true,
  storeQrImage,
}: {
  storeUrl: string;
  tables: BusinessTable[];
  allowDineIn: boolean;
  canEdit: boolean;
  showTables?: boolean;
  storeQrImage: string;
}) {
  const [state, formAction, pending] = useActionState(createBusinessTable, initialState);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const filteredTables = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tables;
    return tables.filter((table) => table.name.toLowerCase().includes(normalized));
  }, [query, tables]);

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.success("Link copied"); }
    catch { toast.error("Could not copy the link. Select and copy the store URL below."); }
  }

  function printQr(url: string) {
    const imageUrl = url === storeUrl ? storeQrImage : getQrImageUrl(url);
    const popup = window.open("", "_blank", "width=560,height=680");
    if (!popup) {
      toast.error("Allow pop-ups to print the QR code.");
      return;
    }

    popup.document.write(`<!doctype html><html><head><title>Store QR code</title></head><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:Arial,sans-serif"><div style="text-align:center"><h1>Scan to visit our store</h1><img src="${imageUrl}" style="width:320px;height:320px" onload="window.print()"/><p style="font-size:12px;color:#64748b;max-width:420px;word-break:break-all">${url}</p></div></body></html>`);
    popup.document.close();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
            <QrCode size={17} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">{showTables ? "Store QR Codes & Tables" : "Store Website QR Code"}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {showTables ? "Share your store QR, or create a unique QR for each restaurant table." : "Customers scan this QR code to open your store website and browse products."}
            </p>
          </div>
        </div>
        {showTables && <p className="text-[11px] text-slate-500">Each table QR opens the store in dine-in mode.</p>}
      </div>

      {showTables && !allowDineIn && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Turn on Dine-in under Fulfillment methods before creating table QR codes.
        </div>
      )}

      <div className={`mt-3 grid gap-3 ${showTables ? "lg:grid-cols-[390px_minmax(0,1fr)]" : ""}`}>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <QrCode size={15} className="text-blue-600" /> Store QR code
          </div>
          <div className="mt-3 flex items-center gap-4">
            <img
              src={storeQrImage}
              alt="Store QR code"
              className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-emerald-600">Your store link</p>
              <p className="mt-1 break-all text-xs font-semibold text-blue-600">{storeUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => copy(storeUrl)} className={secondaryButtonClass}>
                  <Copy size={12} /> Copy Link
                </button>
                <a href={storeQrImage} download="store-website-qr.png" className={secondaryButtonClass}>
                  <Download size={12} /> Download QR
                </a>
                <button type="button" onClick={() => printQr(storeUrl)} className={secondaryButtonClass}><Printer size={12} /> Print QR</button>
                <a href={storeUrl} target="_blank" rel="noreferrer" className={secondaryButtonClass}><ExternalLink size={12} /> Open website</a>
              </div>
            </div>
          </div>
          {new URL(storeUrl).hostname.endsWith("localhost") && <p className="mt-3 text-xs text-amber-700">This QR uses your local preview address. For customers scanning on a phone, deploy the store with a public domain first.</p>}
        </div>

        {showTables && <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <TableProperties size={15} className="text-blue-600" /> Table QR codes
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tables..."
                  className="h-9 w-full min-w-[190px] rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {canEdit && (
                <form action={formAction} className="flex gap-2">
                  <input
                    name="name"
                    required
                    maxLength={60}
                    placeholder="Table name"
                    className="h-9 w-32 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={pending || !allowDineIn}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Add Table
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {filteredTables.map((table) => {
              const tableUrl = `${storeUrl.replace(/\/+$/, "")}/?table=${encodeURIComponent(table.public_token)}`;
              return (
                <article key={table.id} className="rounded-lg border border-slate-200 bg-slate-50/30 p-3">
                  <div className="flex items-start gap-2">
                    <div className="rounded-md bg-blue-50 p-2 text-blue-600">
                      <TableProperties size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xs font-bold text-slate-900">{table.name}</h3>
                      <p className="mt-0.5 text-[10px] text-slate-500">Dine-in mode</p>
                    </div>
                    <MoreVertical size={14} className="text-slate-400" />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <a href={getQrImageUrl(tableUrl)} target="_blank" rel="noreferrer" className={tinyButtonClass}>
                      <Download size={11} /> Download
                    </a>
                    <button type="button" onClick={() => printQr(tableUrl)} className={tinyButtonClass}>
                      <Printer size={11} /> Print
                    </button>
                    <a href={tableUrl} target="_blank" rel="noreferrer" className={tinyButtonClass}>
                      <ExternalLink size={11} /> Open
                    </a>
                  </div>

                  {canEdit && (
                    <div className="mt-2 flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                      <form action={regenerateBusinessTableToken}>
                        <input type="hidden" name="tableId" value={table.id} />
                        <button type="submit" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100">
                          <RefreshCw size={11} /> New QR
                        </button>
                      </form>
                      <form action={deleteBusinessTable}>
                        <input type="hidden" name="tableId" value={table.id} />
                        <button type="submit" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-rose-600 hover:bg-rose-50">
                          <Trash2 size={11} /> Delete
                        </button>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}

            {filteredTables.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 md:col-span-2 2xl:col-span-3">
                {tables.length === 0 ? "No table QR codes yet." : "No tables match your search."}
              </div>
            )}
          </div>
        </div>}
      </div>
    </section>
  );
}

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50";

const tinyButtonClass =
  "inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50";
