import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Webhook } from "lucide-react";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { maskSecret } from "@/lib/integrations/security";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl, getRootUrl } from "@/lib/tenancy/domain";

import IntegrationsClient, {
  type ApiKeySummary,
  type WebhookDeliverySummary,
  type WebhookSummary,
} from "./integrations-client";

export const dynamic = "force-dynamic";

function isMissingRelation(code?: string): boolean {
  return code === "42P01" || code === "PGRST205";
}

export default async function IntegrationsSettingsPage() {
  const business = await getCurrentBusiness();
  if (business.role !== "owner") {
    redirect("/dashboard/settings");
  }

  const [keysRes, hooksRes, deliveriesRes] = await Promise.all([
    supabaseAdmin
      .from("business_api_keys")
      .select(
        "id, name, key_prefix, scopes, is_active, last_used_at, revoked_at, created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin
      .from("business_webhooks")
      .select(
        "id, name, target_url, signing_secret, events, is_active, last_triggered_at, last_status_code, last_error, failure_count, created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("business_webhook_deliveries")
      .select(
        "id, event_type, status, attempt_count, response_status, response_body, delivered_at, created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const migrationReady =
    !isMissingRelation(keysRes.error?.code) &&
    !isMissingRelation(hooksRes.error?.code) &&
    !isMissingRelation(deliveriesRes.error?.code);

  const apiKeys: ApiKeySummary[] = (keysRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : ["products:read"],
    isActive: Boolean(row.is_active && !row.revoked_at),
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
  }));

  const webhooks: WebhookSummary[] = (hooksRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    targetUrl: row.target_url,
    secretMask: maskSecret(row.signing_secret),
    events: Array.isArray(row.events) ? row.events.map(String) : [],
    isActive: Boolean(row.is_active),
    lastTriggeredAt: row.last_triggered_at ?? null,
    lastStatusCode: row.last_status_code ?? null,
    lastError: row.last_error ?? null,
    failureCount: Number(row.failure_count ?? 0),
    createdAt: row.created_at,
  }));

  const deliveries: WebhookDeliverySummary[] = (deliveriesRes.data ?? []).map(
    (row) => ({
      id: row.id,
      eventType: row.event_type,
      status: (row.status as WebhookDeliverySummary["status"]) ?? "pending",
      attemptCount: Number(row.attempt_count ?? 0),
      responseStatus: row.response_status ?? null,
      responseBody: row.response_body ?? null,
      deliveredAt: row.delivered_at ?? null,
      createdAt: row.created_at,
    }),
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 pb-8">
      <section>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to General Settings
        </Link>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Webhook className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              API &amp; Webhooks
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sync your product catalog and real-time stock updates with TenhChat Social Inbox.
            </p>
          </div>
        </div>
      </section>

      <IntegrationsClient
        businessId={business.id}
        productsApiUrl={getAppUrl("/api/v1/products")}
        alternateProductsApiUrl={getRootUrl("/api/products")}
        migrationReady={migrationReady}
        apiKeys={apiKeys}
        webhooks={webhooks}
        deliveries={deliveries}
      />
    </main>
  );
}
