import "server-only";

import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { after } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  loadExternalProductCatalog,
  type ExternalCatalogProduct,
} from "./catalog-api";
import {
  isBlockedIpAddress,
  sanitizeDeliveryMessage,
  signWebhookPayload,
  validateSafeWebhookUrl,
} from "./security";

type ClaimedDeliveryRow = {
  delivery_id: string;
  webhook_id: string;
  business_id: string;
  target_url: string;
  signing_secret: string;
  event_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  attempt_count: number;
  created_at: string;
};

async function assertSafeResolvedWebhookUrl(rawUrl: string): Promise<URL> {
  const parsed = validateSafeWebhookUrl(rawUrl);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(host) !== 0) {
    if (isBlockedIpAddress(host)) {
      throw new Error("Webhook host resolves to a private or reserved IP address.");
    }
    return parsed;
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error("Unable to resolve webhook hostname.");
  }
  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new Error("Webhook hostname resolves to a restricted IP address.");
    }
  }

  return parsed;
}

async function postSignedWebhook({
  targetUrl,
  signingSecret,
  deliveryId,
  eventType,
  bodyObject,
}: {
  targetUrl: string;
  signingSecret: string;
  deliveryId: string;
  eventType: string;
  bodyObject: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  statusCode: number | null;
  responseText: string;
}> {
  const safeUrl = await assertSafeResolvedWebhookUrl(targetUrl);
  const rawBody = JSON.stringify(bodyObject);
  const timestampSec = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(signingSecret, timestampSec, rawBody);

  const response = await fetch(safeUrl.href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": "TenhPOS-Webhook/1.0",
      "X-Tenh-Event": eventType,
      "X-Tenh-Delivery": deliveryId,
      "X-Tenh-Timestamp": String(timestampSec),
      "X-Tenh-Signature-256": signature,
    },
    body: rawBody,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const rawText = (await response.text().catch(() => "")).slice(0, 500);
  const text = sanitizeDeliveryMessage(rawText) ?? "";
  return {
    ok: response.ok,
    statusCode: response.status,
    responseText: text,
  };
}

async function buildDeliveryEnvelope(
  row: ClaimedDeliveryRow,
  businessCache: Map<
    string,
    { id: string; name: string; slug: string; isActive: boolean } | null
  >,
): Promise<Record<string, unknown> | null> {
  if (!businessCache.has(row.business_id)) {
    const { data: biz } = await supabaseAdmin
      .from("businesses")
      .select("id, name, slug, is_active, subscription_status, subscription_expires_at")
      .eq("id", row.business_id)
      .maybeSingle();

    const expiryMs = biz?.subscription_expires_at
      ? Date.parse(biz.subscription_expires_at)
      : Number.NaN;
    const active = Boolean(
      biz &&
        biz.is_active &&
        biz.subscription_status !== "expired" &&
        biz.subscription_status !== "trial_blocked" &&
        (!Number.isFinite(expiryMs) || expiryMs > Date.now()),
    );

    businessCache.set(
      row.business_id,
      biz
        ? { id: biz.id, name: biz.name, slug: biz.slug, isActive: active }
        : null,
    );
  }

  const biz = businessCache.get(row.business_id);
  if (!biz || !biz.isActive) return null;

  let product: ExternalCatalogProduct | null = null;
  let currency = "USD";

  if (row.event_type !== "product.deleted" && row.entity_id) {
    const catalog = await loadExternalProductCatalog(biz, {
      entityId: row.entity_id,
      limit: 5,
    });
    currency = catalog.currency;
    product = catalog.products[0] ?? null;

    // If all variants in this family were deactivated or deleted, emit product.deleted.
    if (!product && row.event_type === "product.updated") {
      return {
        id: row.delivery_id,
        event: "product.deleted",
        created_at: new Date().toISOString(),
        business: {
          id: biz.id,
          name: biz.name,
          slug: biz.slug,
          currency,
        },
        product: null,
        products: [],
        data: {
          ...(row.payload ?? {}),
          entity_id: row.entity_id,
          deleted: true,
        },
      };
    }
  }

  return {
    id: row.delivery_id,
    event: row.event_type,
    created_at: new Date().toISOString(),
    business: {
      id: biz.id,
      name: biz.name,
      slug: biz.slug,
      currency,
    },
    product,
    products: product ? [product] : [],
    data: {
      ...(row.payload ?? {}),
      entity_id: row.entity_id,
    },
  };
}

export async function dispatchBusinessWebhooks({
  businessId,
  limit = 20,
}: {
  businessId?: string;
  limit?: number;
} = {}): Promise<{
  claimed: number;
  delivered: number;
  failed: number;
}> {
  const claimedRes = await supabaseAdmin.rpc("tenh_claim_webhook_deliveries", {
    p_business_id: businessId ?? null,
    p_limit: Math.max(1, Math.min(limit, 50)),
  });

  if (claimedRes.error) {
    if (claimedRes.error.code === "PGRST202" || claimedRes.error.code === "42883") {
      return { claimed: 0, delivered: 0, failed: 0 };
    }
    throw new Error(`Unable to claim webhook deliveries: ${claimedRes.error.message}`);
  }

  const rows = (claimedRes.data ?? []) as ClaimedDeliveryRow[];
  if (rows.length === 0) {
    return { claimed: 0, delivered: 0, failed: 0 };
  }

  const businessCache = new Map<
    string,
    { id: string; name: string; slug: string; isActive: boolean } | null
  >();

  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    const nowIso = new Date().toISOString();
    try {
      const envelope = await buildDeliveryEnvelope(row, businessCache);
      if (!envelope) {
        await supabaseAdmin
          .from("business_webhook_deliveries")
          .update({
            status: "failed",
            response_body: "Skipped: business inactive or subscription expired.",
          })
          .eq("id", row.delivery_id);
        failed++;
        continue;
      }

      const result = await postSignedWebhook({
        targetUrl: row.target_url,
        signingSecret: row.signing_secret,
        deliveryId: row.delivery_id,
        eventType: String(envelope.event || row.event_type),
        bodyObject: envelope,
      });

      if (result.ok) {
        delivered++;
        await Promise.all([
          supabaseAdmin
            .from("business_webhook_deliveries")
            .update({
              status: "delivered",
              response_status: result.statusCode,
              response_body: result.responseText || "OK",
              delivered_at: nowIso,
            })
            .eq("id", row.delivery_id),
          supabaseAdmin
            .from("business_webhooks")
            .update({
              last_triggered_at: nowIso,
              last_status_code: result.statusCode,
              last_error: null,
              failure_count: 0,
              updated_at: nowIso,
            })
            .eq("id", row.webhook_id),
        ]);
      } else {
        failed++;
        const terminal = row.attempt_count >= 3;
        const backoffSec = row.attempt_count <= 1 ? 60 : 300;
        const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString();
        const errorSummary = `HTTP ${result.statusCode ?? 0}${
          result.responseText ? `: ${result.responseText.slice(0, 180)}` : ""
        }`;

        await Promise.all([
          supabaseAdmin
            .from("business_webhook_deliveries")
            .update({
              status: terminal ? "failed" : "pending",
              response_status: result.statusCode,
              response_body: errorSummary,
              next_attempt_at: nextAttempt,
            })
            .eq("id", row.delivery_id),
          supabaseAdmin
            .from("business_webhooks")
            .update({
              last_triggered_at: nowIso,
              last_status_code: result.statusCode,
              last_error: errorSummary,
              failure_count: row.attempt_count,
              updated_at: nowIso,
            })
            .eq("id", row.webhook_id),
        ]);
      }
    } catch (error) {
      failed++;
      const terminal = row.attempt_count >= 3;
      const backoffSec = row.attempt_count <= 1 ? 60 : 300;
      const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString();
      const message =
        error instanceof Error ? error.message.slice(0, 240) : "Webhook delivery failed.";

      await Promise.all([
        supabaseAdmin
          .from("business_webhook_deliveries")
          .update({
            status: terminal ? "failed" : "pending",
            response_status: null,
            response_body: message,
            next_attempt_at: nextAttempt,
          })
          .eq("id", row.delivery_id),
        supabaseAdmin
          .from("business_webhooks")
          .update({
            last_triggered_at: nowIso,
            last_status_code: null,
            last_error: message,
            failure_count: row.attempt_count,
            updated_at: nowIso,
          })
          .eq("id", row.webhook_id),
      ]);
    }
  }

  return {
    claimed: rows.length,
    delivered,
    failed,
  };
}

export function scheduleBusinessWebhookFlush(businessId: string): void {
  if (!businessId) return;
  const run = async () => {
    try {
      await dispatchBusinessWebhooks({ businessId, limit: 15 });
    } catch {
      // Queued rows remain in business_webhook_deliveries for retry.
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}

export async function sendTestBusinessWebhook({
  business,
  webhookId,
}: {
  business: { id: string; name: string; slug: string };
  webhookId: string;
}): Promise<{
  ok: boolean;
  statusCode: number | null;
  message: string;
}> {
  const { data: hook, error } = await supabaseAdmin
    .from("business_webhooks")
    .select("id, business_id, name, target_url, signing_secret")
    .eq("id", webhookId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error || !hook) {
    return {
      ok: false,
      statusCode: null,
      message: "Webhook endpoint not found.",
    };
  }

  const sampleCatalog = await loadExternalProductCatalog(business, { limit: 3 });
  const deliveryId = randomUUID();
  const nowIso = new Date().toISOString();

  const envelope: Record<string, unknown> = {
    id: deliveryId,
    event: "webhook.test",
    created_at: nowIso,
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      currency: sampleCatalog.currency,
    },
    product: sampleCatalog.products[0] ?? null,
    products: sampleCatalog.products,
    data: {
      test: true,
      sample_count: sampleCatalog.products.length,
      total_catalog_products: sampleCatalog.total,
    },
  };

  try {
    const result = await postSignedWebhook({
      targetUrl: hook.target_url,
      signingSecret: hook.signing_secret,
      deliveryId,
      eventType: "webhook.test",
      bodyObject: envelope,
    });

    const summary = result.ok
      ? `Test webhook delivered (HTTP ${result.statusCode}).`
      : `Webhook returned HTTP ${result.statusCode}${
          result.responseText ? `: ${result.responseText.slice(0, 140)}` : ""
        }`;

    await Promise.all([
      supabaseAdmin.from("business_webhook_deliveries").insert({
        id: deliveryId,
        webhook_id: hook.id,
        business_id: business.id,
        event_type: "webhook.test",
        entity_id: null,
        payload: { test: true, sample_count: sampleCatalog.products.length },
        status: result.ok ? "delivered" : "failed",
        attempt_count: 1,
        response_status: result.statusCode,
        response_body: result.responseText || (result.ok ? "OK" : summary),
        delivered_at: result.ok ? nowIso : null,
      }),
      supabaseAdmin
        .from("business_webhooks")
        .update({
          last_triggered_at: nowIso,
          last_status_code: result.statusCode,
          last_error: result.ok ? null : summary,
          failure_count: result.ok ? 0 : 1,
          updated_at: nowIso,
        })
        .eq("id", hook.id),
    ]);

    return {
      ok: result.ok,
      statusCode: result.statusCode,
      message: summary,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 220) : "Unable to reach webhook URL.";

    await Promise.all([
      supabaseAdmin.from("business_webhook_deliveries").insert({
        id: deliveryId,
        webhook_id: hook.id,
        business_id: business.id,
        event_type: "webhook.test",
        entity_id: null,
        payload: { test: true },
        status: "failed",
        attempt_count: 1,
        response_status: null,
        response_body: message,
      }),
      supabaseAdmin
        .from("business_webhooks")
        .update({
          last_triggered_at: nowIso,
          last_status_code: null,
          last_error: message,
          updated_at: nowIso,
        })
        .eq("id", hook.id),
    ]);

    return {
      ok: false,
      statusCode: null,
      message,
    };
  }
}
