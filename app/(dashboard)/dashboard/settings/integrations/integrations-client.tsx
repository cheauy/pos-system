"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  createBusinessApiKeyAction,
  deleteBusinessWebhookAction,
  flushPendingWebhooksAction,
  revokeBusinessApiKeyAction,
  rotateWebhookSecretAction,
  saveBusinessWebhookAction,
  testBusinessWebhookAction,
  toggleBusinessWebhookAction,
} from "./actions";

export type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type WebhookSummary = {
  id: string;
  name: string;
  targetUrl: string;
  secretMask: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  failureCount: number;
  createdAt: string;
};

export type WebhookDeliverySummary = {
  id: string;
  eventType: string;
  status: "pending" | "processing" | "delivered" | "failed";
  attemptCount: number;
  responseStatus: number | null;
  responseBody: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

const EVENT_OPTIONS = [
  {
    id: "product.created",
    label: "Product Created",
    hint: "Fires when a new product or variant is added",
  },
  {
    id: "product.updated",
    label: "Product Updated",
    hint: "Fires when name, SKU, price, photo, or details change",
  },
  {
    id: "product.deleted",
    label: "Product Deleted / Disabled",
    hint: "Fires when a product is archived or deleted",
  },
  {
    id: "inventory.updated",
    label: "Stock Updated",
    hint: "Fires on POS sales, online orders, returns, and stock adjustments",
  },
] as const;

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IntegrationsClient({
  businessId,
  productsApiUrl,
  alternateProductsApiUrl,
  migrationReady,
  apiKeys,
  webhooks,
  deliveries,
}: {
  businessId: string;
  productsApiUrl: string;
  alternateProductsApiUrl: string;
  migrationReady: boolean;
  apiKeys: ApiKeySummary[];
  webhooks: WebhookSummary[];
  deliveries: WebhookDeliverySummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [keyName, setKeyName] = useState("TenhChat Social Inbox");
  const [webhookName, setWebhookName] = useState("TenhChat Social Inbox");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    EVENT_OPTIONS.map((item) => item.id),
  );

  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [revealedSigningSecret, setRevealedSigningSecret] = useState<string | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  async function copyText(id: string, value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast.success(`${label} copied to clipboard.`);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 2200);
    } catch {
      toast.error("Unable to copy automatically. Select and copy manually.");
    }
  }

  function toggleEventOption(eventId: string) {
    setSelectedEvents((prev) => {
      if (prev.includes(eventId)) {
        return prev.length > 1 ? prev.filter((id) => id !== eventId) : prev;
      }
      return [...prev, eventId];
    });
  }

  function handleCreateApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("name", keyName);

    startTransition(async () => {
      const result = await createBusinessApiKeyAction(formData);
      setBannerMessage({ ok: result.success, text: result.message });
      if (result.success) {
        if (result.rawKey) setRevealedApiKey(result.rawKey);
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRevokeKey(keyId: string) {
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("keyId", keyId);

    startTransition(async () => {
      const result = await revokeBusinessApiKeyAction(formData);
      setBannerMessage({ ok: result.success, text: result.message });
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleCreateWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("name", webhookName);
    formData.set("targetUrl", webhookUrl);
    for (const ev of selectedEvents) {
      formData.append("events", ev);
    }

    startTransition(async () => {
      const result = await saveBusinessWebhookAction(formData);
      setBannerMessage({ ok: result.success, text: result.message });
      if (result.success) {
        if (result.signingSecret) setRevealedSigningSecret(result.signingSecret);
        setWebhookUrl("");
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function runWebhookAction(
    action: (fd: FormData) => Promise<{
      success: boolean;
      message: string;
      signingSecret?: string;
    }>,
    webhookId: string,
    extra?: Record<string, string>,
  ) {
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("webhookId", webhookId);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        formData.set(k, v);
      }
    }

    startTransition(async () => {
      const result = await action(formData);
      setBannerMessage({ ok: result.success, text: result.message });
      if (result.signingSecret) {
        setRevealedSigningSecret(result.signingSecret);
      }
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      router.refresh();
    });
  }

  function handleFlushPending() {
    const formData = new FormData();
    formData.set("businessId", businessId);

    startTransition(async () => {
      const result = await flushPendingWebhooksAction(formData);
      setBannerMessage({ ok: result.success, text: result.message });
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  const pendingDeliveriesCount = deliveries.filter(
    (d) => d.status === "pending" || d.status === "processing",
  ).length;

  return (
    <div className="space-y-6">
      {!migrationReady && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p className="font-bold">Database setup required</p>
          <p className="mt-1 leading-6">
            Apply migration{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50">
              supabase/migrations/20261123010000_api_keys_and_webhooks.sql
            </code>{" "}
            to enable API key generation and outgoing webhooks.
          </p>
        </div>
      )}

      {bannerMessage && (
        <div
          role="status"
          className={
            bannerMessage.ok
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300"
              : "rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
          }
        >
          {bannerMessage.text}
        </div>
      )}

      {revealedApiKey && (
        <section className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/90 p-5 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Save your new API Key now (shown once)
              </p>
              <p className="mt-0.5 text-xs text-emerald-800/90 dark:text-emerald-300/80">
                Paste this key into TenhChat (tenhchat.com) Catalog Sync. Only a SHA-256 hash is stored on the server.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyText("raw-api-key", revealedApiKey, "API Key")}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              {copiedId === "raw-api-key" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copiedId === "raw-api-key" ? "Copied" : "Copy API Key"}
            </button>
          </div>
          <code
            data-i18n-ignore="true"
            className="mt-3 block break-all rounded-xl border border-emerald-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-200"
          >
            {revealedApiKey}
          </code>
        </section>
      )}

      {revealedSigningSecret && (
        <section className="rounded-2xl border-2 border-blue-400 bg-blue-50/90 p-5 shadow-sm dark:border-blue-700 dark:bg-blue-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                Webhook Signing Secret (HMAC-SHA256)
              </p>
              <p className="mt-0.5 text-xs text-blue-800/90 dark:text-blue-300/80">
                Verify incoming requests on TenhChat using header{" "}
                <code className="font-mono">X-Tenh-Signature-256</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                void copyText(
                  "raw-webhook-secret",
                  revealedSigningSecret,
                  "Signing secret",
                )
              }
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              {copiedId === "raw-webhook-secret" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copiedId === "raw-webhook-secret" ? "Copied" : "Copy Secret"}
            </button>
          </div>
          <code
            data-i18n-ignore="true"
            className="mt-3 block break-all rounded-xl border border-blue-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 dark:border-blue-800 dark:bg-slate-950 dark:text-blue-200"
          >
            {revealedSigningSecret}
          </code>
        </section>
      )}

      {/* Connection Endpoint Summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Free Integration · Zero Extra Cost
            </div>
            <h2 className="pt-1 text-lg font-bold text-slate-950 dark:text-white">
              TenhChat Social Inbox Endpoints
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Use your Products API URL and an API Key below so{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                tenhchat.com
              </span>{" "}
              can fetch live products, variants, promo prices, and branch stock.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Primary Products API URL (GET)
              </span>
              <button
                type="button"
                onClick={() =>
                  void copyText("api-url-v1", productsApiUrl, "Products API URL")
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {copiedId === "api-url-v1" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy
              </button>
            </div>
            <code
              data-i18n-ignore="true"
              className="mt-2 block break-all font-mono text-xs text-slate-800 dark:text-slate-200"
            >
              {productsApiUrl}
            </code>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Root Alias URL (GET)
              </span>
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    "api-url-root",
                    alternateProductsApiUrl,
                    "Products API URL",
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {copiedId === "api-url-root" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy
              </button>
            </div>
            <code
              data-i18n-ignore="true"
              className="mt-2 block break-all font-mono text-xs text-slate-800 dark:text-slate-200"
            >
              {alternateProductsApiUrl}
            </code>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Pass your key via{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">
            Authorization: Bearer tpos_live_...
          </code>{" "}
          or{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">
            x-api-key: tpos_live_...
          </code>
          . Optional filters: <code className="font-mono">?search=</code>,{" "}
          <code className="font-mono">?online_only=true</code>,{" "}
          <code className="font-mono">?updated_since=ISO_DATE</code>.
        </p>
      </section>

      {/* API Keys Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-950 dark:text-white">API Keys</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Read-only catalog keys scoped strictly to this business workspace.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateApiKey}
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="api-key-name"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Key label
            </label>
            <input
              id="api-key-name"
              name="name"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              maxLength={80}
              required
              disabled={!migrationReady || isPending}
              placeholder="e.g. TenhChat Social Inbox"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <button
            type="submit"
            disabled={!migrationReady || isPending}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Generate API Key
          </button>
        </form>

        <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {apiKeys.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No API keys created yet. Generate one above to connect TenhChat.
            </p>
          ) : (
            apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="font-semibold text-slate-900 dark:text-white"
                      data-i18n-ignore="true"
                    >
                      {key.name}
                    </span>
                    <code
                      data-i18n-ignore="true"
                      className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {key.keyPrefix}••••••••
                    </code>
                    {key.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Revoked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Created {formatTimestamp(key.createdAt)} · Last used:{" "}
                    {formatTimestamp(key.lastUsedAt)}
                  </p>
                </div>

                {key.isActive && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRevokeKey(key.id)}
                    className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Outgoing Webhooks Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-950 dark:text-white">
              Outgoing Webhooks
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Automatically push signed JSON updates whenever products or branch inventory change.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateWebhook} className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
            <div>
              <label
                htmlFor="webhook-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Endpoint name
              </label>
              <input
                id="webhook-name"
                name="name"
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                maxLength={80}
                required
                disabled={!migrationReady || isPending}
                placeholder="TenhChat Social Inbox"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label
                htmlFor="webhook-target-url"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                HTTPS Target URL
              </label>
              <input
                id="webhook-target-url"
                name="targetUrl"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
                disabled={!migrationReady || isPending}
                placeholder="https://tenhchat.com/api/webhooks/tenh-pos"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Events to send
            </p>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              {EVENT_OPTIONS.map((ev) => {
                const checked = selectedEvents.includes(ev.id);
                return (
                  <label
                    key={ev.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition ${
                      checked
                        ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/25"
                        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEventOption(ev.id)}
                      disabled={!migrationReady || isPending}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 dark:text-white">
                        {ev.label}
                      </span>
                      <span className="mt-0.5 block text-slate-500 dark:text-slate-400">
                        {ev.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!migrationReady || isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Add Webhook Endpoint
            </button>
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {webhooks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              No webhook endpoints configured yet.
            </p>
          ) : (
            webhooks.map((hook) => (
              <div
                key={hook.id}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-bold text-slate-900 dark:text-white"
                        data-i18n-ignore="true"
                      >
                        {hook.name}
                      </span>
                      {hook.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          Paused
                        </span>
                      )}
                      {hook.lastStatusCode !== null && (
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
                            hook.lastStatusCode >= 200 && hook.lastStatusCode < 300
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          }`}
                        >
                          HTTP {hook.lastStatusCode}
                        </span>
                      )}
                    </div>

                    <code
                      data-i18n-ignore="true"
                      className="block break-all font-mono text-xs text-slate-700 dark:text-slate-300"
                    >
                      {hook.targetUrl}
                    </code>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {hook.events.map((ev) => (
                        <span
                          key={ev}
                          data-i18n-ignore="true"
                          className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>

                    <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                      Secret:{" "}
                      <code data-i18n-ignore="true" className="font-mono">
                        {hook.secretMask}
                      </code>{" "}
                      · Last triggered: {formatTimestamp(hook.lastTriggeredAt)}
                    </p>
                    {hook.lastError && (
                      <p className="text-xs text-red-600 dark:text-red-400" data-i18n-ignore="true">
                        Last error: {hook.lastError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runWebhookAction(testBusinessWebhookAction, hook.id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send Test
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runWebhookAction(toggleBusinessWebhookAction, hook.id, {
                          isActive: hook.isActive ? "false" : "true",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {hook.isActive ? (
                        <PauseCircle className="h-3.5 w-3.5" />
                      ) : (
                        <PlayCircle className="h-3.5 w-3.5" />
                      )}
                      {hook.isActive ? "Pause" : "Enable"}
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runWebhookAction(rotateWebhookSecretAction, hook.id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Rotate Secret
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runWebhookAction(deleteBusinessWebhookAction, hook.id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recent Deliveries Log */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-950 dark:text-white">
              Recent Webhook Deliveries
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Latest 15 outgoing events and HTTP responses.
            </p>
          </div>
          {webhooks.length > 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleFlushPending}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {pendingDeliveriesCount > 0
                ? `Deliver Pending (${pendingDeliveriesCount})`
                : "Check Queue"}
            </button>
          )}
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {deliveries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No webhook deliveries recorded yet. Click &ldquo;Send Test&rdquo; on a webhook above to verify connectivity.
            </p>
          ) : (
            deliveries.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  {item.status === "delivered" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : item.status === "failed" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                  ) : (
                    <Clock3 className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <code
                    data-i18n-ignore="true"
                    className="rounded bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {item.eventType}
                  </code>
                  <span className="capitalize text-slate-600 dark:text-slate-300">
                    {item.status}
                  </span>
                  {item.responseStatus !== null && (
                    <span className="font-mono text-slate-500">
                      (HTTP {item.responseStatus})
                    </span>
                  )}
                  <span className="text-slate-400">
                    · Attempt {item.attemptCount}
                  </span>
                </div>

                <div className="text-slate-500 dark:text-slate-400">
                  {formatTimestamp(item.deliveredAt ?? item.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
