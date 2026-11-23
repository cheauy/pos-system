"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
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
  revealBusinessApiKeyAction,
  revealBusinessWebhookAction,
  revokeBusinessApiKeyAction,
  rotateWebhookSecretAction,
  saveBusinessWebhookAction,
  testBusinessWebhookAction,
  toggleBusinessWebhookAction,
} from "./actions";

export type ApiKeySummary = {
  id: string;
  name: string;
  maskedKey: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type WebhookSummary = {
  id: string;
  name: string;
  maskedTargetUrl: string;
  secretMask: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
};

export type WebhookDeliverySummary = {
  id: string;
  eventType: string;
  status: "pending" | "processing" | "delivered" | "failed";
  attemptCount: number;
  responseStatus: number | null;
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

const AUTO_HIDE_MS = 20_000;

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

  // Ephemeral in-memory secrets cached only during this browser tab's interaction,
  // never rendered unless the specific Eye toggle is explicitly opened.
  const [cachedApiKeys, setCachedApiKeys] = useState<Record<string, string>>({});
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});

  const [cachedWebhooks, setCachedWebhooks] = useState<
    Record<string, { targetUrl: string; signingSecret: string }>
  >({});
  const [visibleWebhookUrlIds, setVisibleWebhookUrlIds] = useState<
    Record<string, boolean>
  >({});
  const [visibleWebhookSecretIds, setVisibleWebhookSecretIds] = useState<
    Record<string, boolean>
  >({});

  const hideTimersRef = useRef<Record<string, number>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  function scheduleAutoHide(timerKey: string, hideFn: () => void) {
    const existing = hideTimersRef.current[timerKey];
    if (existing) window.clearTimeout(existing);
    hideTimersRef.current[timerKey] = window.setTimeout(() => {
      hideFn();
      delete hideTimersRef.current[timerKey];
    }, AUTO_HIDE_MS);
  }

  async function copyText(id: string, value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast.success(`${label} copied to clipboard.`);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 2200);
    } catch {
      toast.error("Unable to copy automatically.");
    }
  }

  async function resolveApiKeyPlaintext(keyId: string): Promise<string | null> {
    if (cachedApiKeys[keyId]) return cachedApiKeys[keyId];

    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("keyId", keyId);
    const result = await revealBusinessApiKeyAction(formData);
    if (!result.success || !result.rawKey) {
      toast.error(result.message);
      setBannerMessage({ ok: false, text: result.message });
      return null;
    }

    const raw = result.rawKey;
    setCachedApiKeys((prev) => ({ ...prev, [keyId]: raw }));
    return raw;
  }

  function handleToggleKeyEye(keyId: string) {
    if (visibleKeyIds[keyId]) {
      setVisibleKeyIds((prev) => ({ ...prev, [keyId]: false }));
      return;
    }

    startTransition(async () => {
      const raw = await resolveApiKeyPlaintext(keyId);
      if (!raw) return;
      setVisibleKeyIds((prev) => ({ ...prev, [keyId]: true }));
      scheduleAutoHide(`key:${keyId}`, () => {
        setVisibleKeyIds((prev) => ({ ...prev, [keyId]: false }));
      });
    });
  }

  function handleCopyApiKey(keyId: string) {
    startTransition(async () => {
      const raw = await resolveApiKeyPlaintext(keyId);
      if (!raw) return;
      await copyText(`copy-key:${keyId}`, raw, "API Key");
    });
  }

  async function resolveWebhookDetails(
    webhookId: string,
  ): Promise<{ targetUrl: string; signingSecret: string } | null> {
    if (cachedWebhooks[webhookId]) return cachedWebhooks[webhookId];

    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("webhookId", webhookId);
    const result = await revealBusinessWebhookAction(formData);
    if (!result.success || !result.targetUrl || !result.signingSecret) {
      toast.error(result.message);
      setBannerMessage({ ok: false, text: result.message });
      return null;
    }

    const details = {
      targetUrl: result.targetUrl,
      signingSecret: result.signingSecret,
    };
    setCachedWebhooks((prev) => ({ ...prev, [webhookId]: details }));
    return details;
  }

  function handleToggleWebhookUrlEye(webhookId: string) {
    if (visibleWebhookUrlIds[webhookId]) {
      setVisibleWebhookUrlIds((prev) => ({ ...prev, [webhookId]: false }));
      return;
    }

    startTransition(async () => {
      const details = await resolveWebhookDetails(webhookId);
      if (!details) return;
      setVisibleWebhookUrlIds((prev) => ({ ...prev, [webhookId]: true }));
      scheduleAutoHide(`wh-url:${webhookId}`, () => {
        setVisibleWebhookUrlIds((prev) => ({ ...prev, [webhookId]: false }));
      });
    });
  }

  function handleToggleWebhookSecretEye(webhookId: string) {
    if (visibleWebhookSecretIds[webhookId]) {
      setVisibleWebhookSecretIds((prev) => ({ ...prev, [webhookId]: false }));
      return;
    }

    startTransition(async () => {
      const details = await resolveWebhookDetails(webhookId);
      if (!details) return;
      setVisibleWebhookSecretIds((prev) => ({ ...prev, [webhookId]: true }));
      scheduleAutoHide(`wh-sec:${webhookId}`, () => {
        setVisibleWebhookSecretIds((prev) => ({ ...prev, [webhookId]: false }));
      });
    });
  }

  function handleCopyWebhookSecret(webhookId: string) {
    startTransition(async () => {
      const details = await resolveWebhookDetails(webhookId);
      if (!details) return;
      await copyText(
        `copy-wh-sec:${webhookId}`,
        details.signingSecret,
        "Signing secret",
      );
    });
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
        if (result.createdKeyId && result.rawKey) {
          const id = result.createdKeyId;
          const raw = result.rawKey;
          // Keep masked by default! Only cache in memory so clicking Eye or Copy works immediately.
          setCachedApiKeys((prev) => ({ ...prev, [id]: raw }));
          setVisibleKeyIds((prev) => ({ ...prev, [id]: false }));
        }
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
        setCachedApiKeys((prev) => {
          const next = { ...prev };
          delete next[keyId];
          return next;
        });
        setVisibleKeyIds((prev) => ({ ...prev, [keyId]: false }));
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
        if (result.webhookId && result.targetUrl && result.signingSecret) {
          const id = result.webhookId;
          setCachedWebhooks((prev) => ({
            ...prev,
            [id]: {
              targetUrl: result.targetUrl!,
              signingSecret: result.signingSecret!,
            },
          }));
        }
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
      webhookId?: string;
      targetUrl?: string;
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
      if (result.success && result.targetUrl && result.signingSecret) {
        setCachedWebhooks((prev) => ({
          ...prev,
          [webhookId]: {
            targetUrl: result.targetUrl!,
            signingSecret: result.signingSecret!,
          },
        }));
        setVisibleWebhookSecretIds((prev) => ({ ...prev, [webhookId]: false }));
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
          <p className="font-bold">Integration service setup pending</p>
          <p className="mt-1 leading-6">
            API keys and webhooks will become available once the latest database update is active.
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

      {/* Connection Endpoint Summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Owner &amp; Admin Access Only · Cost-Free
            </div>
            <h2 className="pt-1 text-lg font-bold text-slate-950 dark:text-white">
              TenhChat Catalog Sync Endpoints
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Copy your Products API URL and pair it with a masked API key below inside{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                tenhchat.com
              </span>
              . Wholesale cost prices and customer records are never exposed.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Primary Products API URL
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
                Root Alias URL
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
              Keys stay masked at all times. Click the eye icon to temporarily reveal (auto-hides after 20s).
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
            apiKeys.map((key) => {
              const isRevealed = Boolean(visibleKeyIds[key.id] && cachedApiKeys[key.id]);
              const displayedKey = isRevealed ? cachedApiKeys[key.id] : key.maskedKey;

              return (
                <div
                  key={key.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-semibold text-slate-900 dark:text-white"
                        data-i18n-ignore="true"
                      >
                        {key.name}
                      </span>
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

                    <div className="flex flex-wrap items-center gap-2">
                      <code
                        data-i18n-ignore="true"
                        className="break-all rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {displayedKey}
                      </code>

                      {key.isActive && (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleToggleKeyEye(key.id)}
                            aria-label={isRevealed ? "Hide full API key" : "Show full API key"}
                            title={isRevealed ? "Hide full API key" : "Click eye to see full API key"}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          >
                            {isRevealed ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleCopyApiKey(key.id)}
                            aria-label="Copy API key"
                            title="Copy API key"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {copiedId === `copy-key:${key.id}` ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {copiedId === `copy-key:${key.id}` ? "Copied" : "Copy"}
                          </button>
                        </>
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
              );
            })
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
              Outgoing Webhooks (Admin Only)
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Target URLs and HMAC signing secrets stay masked until revealed by an Owner or Admin.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateWebhook}
          className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
        >
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
                HTTPS Target URL (Admin Only)
              </label>
              <input
                id="webhook-target-url"
                name="targetUrl"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                required
                autoComplete="off"
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
            webhooks.map((hook) => {
              const cached = cachedWebhooks[hook.id];
              const isUrlVisible = Boolean(
                visibleWebhookUrlIds[hook.id] && cached?.targetUrl,
              );
              const isSecretVisible = Boolean(
                visibleWebhookSecretIds[hook.id] && cached?.signingSecret,
              );

              return (
                <div
                  key={hook.id}
                  className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
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

                      {/* Masked Target URL + Eye Reveal */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-500">Target URL:</span>
                        <code
                          data-i18n-ignore="true"
                          className="break-all rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {isUrlVisible ? cached.targetUrl : hook.maskedTargetUrl}
                        </code>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggleWebhookUrlEye(hook.id)}
                          aria-label={
                            isUrlVisible ? "Hide webhook URL" : "Show full webhook URL"
                          }
                          title={
                            isUrlVisible ? "Hide webhook URL" : "Click eye to reveal URL"
                          }
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {isUrlVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Masked Signing Secret + Eye Reveal + Copy */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                          <LockKeyhole className="h-3 w-3" />
                          Signing Secret:
                        </span>
                        <code
                          data-i18n-ignore="true"
                          className="break-all rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {isSecretVisible ? cached.signingSecret : hook.secretMask}
                        </code>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggleWebhookSecretEye(hook.id)}
                          aria-label={
                            isSecretVisible ? "Hide signing secret" : "Show signing secret"
                          }
                          title={
                            isSecretVisible
                              ? "Hide signing secret"
                              : "Click eye to reveal signing secret"
                          }
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {isSecretVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleCopyWebhookSecret(hook.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {copiedId === `copy-wh-sec:${hook.id}` ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {copiedId === `copy-wh-sec:${hook.id}` ? "Copied" : "Copy"}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
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

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Created {formatTimestamp(hook.createdAt)} · Last triggered:{" "}
                        {formatTimestamp(hook.lastTriggeredAt)}
                      </p>
                      {hook.lastError && (
                        <p
                          className="text-xs text-red-600 dark:text-red-400"
                          data-i18n-ignore="true"
                        >
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
              );
            })
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
              Latest 15 outgoing events and HTTP status codes (payloads and headers are hidden).
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
