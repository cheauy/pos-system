"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  generateApiKey,
  generateWebhookSecret,
  isIntegrationAdminRole,
  normalizeWebhookEvents,
  validateSafeWebhookUrl,
} from "@/lib/integrations/security";
import {
  dispatchBusinessWebhooks,
  sendTestBusinessWebhook,
} from "@/lib/integrations/webhook-dispatcher";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type IntegrationActionResult = {
  success: boolean;
  message: string;
  createdKeyId?: string;
  rawKey?: string;
  webhookId?: string;
  targetUrl?: string;
  signingSecret?: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function migrationMissing(code?: string): boolean {
  return code === "42P01" || code === "PGRST205";
}

function missingColumn(code?: string, message?: string): boolean {
  return (
    code === "42703" ||
    code === "PGRST204" ||
    Boolean(message && /key_encrypted/i.test(message))
  );
}

export async function createBusinessApiKeyAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can manage API keys.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  if (submittedBusinessId !== business.id) {
    return {
      success: false,
      message: "Workspace changed. Refresh the page and try again.",
    };
  }

  const rawName = String(formData.get("name") ?? "").trim() || "TenhChat Social Inbox";
  if (rawName.length > 80) {
    return {
      success: false,
      message: "Key name must not exceed 80 characters.",
    };
  }

  const { count, error: countError } = await supabaseAdmin
    .from("business_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .eq("is_active", true);

  if (countError) {
    return {
      success: false,
      message: migrationMissing(countError.code)
        ? "API key service is not initialized yet."
        : "Unable to check existing API keys.",
    };
  }

  if ((count ?? 0) >= 10) {
    return {
      success: false,
      message: "You can have up to 10 active API keys. Revoke an unused key first.",
    };
  }

  const generated = generateApiKey();
  let encryptedKey: string | null = null;
  try {
    encryptedKey = encryptIntegrationSecret(generated.rawKey);
  } catch {
    encryptedKey = null;
  }

  let insertResult = await supabaseAdmin
    .from("business_api_keys")
    .insert({
      business_id: business.id,
      name: rawName,
      key_prefix: generated.keyPrefix,
      key_hash: generated.keyHash,
      ...(encryptedKey ? { key_encrypted: encryptedKey } : {}),
      scopes: ["products:read"],
      is_active: true,
      created_by: business.userId ?? null,
    })
    .select("id")
    .single();

  if (
    insertResult.error &&
    encryptedKey &&
    missingColumn(insertResult.error.code, insertResult.error.message)
  ) {
    insertResult = await supabaseAdmin
      .from("business_api_keys")
      .insert({
        business_id: business.id,
        name: rawName,
        key_prefix: generated.keyPrefix,
        key_hash: generated.keyHash,
        scopes: ["products:read"],
        is_active: true,
        created_by: business.userId ?? null,
      })
      .select("id")
      .single();
  }

  if (insertResult.error || !insertResult.data) {
    return {
      success: false,
      message: "Unable to create API key. Please try again.",
    };
  }

  await createAuditLog({
    action: "create",
    entityType: "business",
    entityId: insertResult.data.id,
    description: `Created API key "${rawName}" (${generated.keyPrefix}•••)`,
  });

  revalidatePath("/dashboard/settings/integrations");
  return {
    success: true,
    message: "API key created. Click the eye icon on the key row to reveal or copy it.",
    createdKeyId: insertResult.data.id,
    rawKey: generated.rawKey,
  };
}

export async function revealBusinessApiKeyAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can view API keys.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const keyId = String(formData.get("keyId") ?? "").trim();
  if (submittedBusinessId !== business.id || !isUuid(keyId)) {
    return {
      success: false,
      message: "Invalid API key selection.",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("business_api_keys")
    .select("id, key_encrypted, is_active, revoked_at")
    .eq("id", keyId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      message: missingColumn(error.code, error.message)
        ? "Generate a new API key after applying the latest update to use Eye reveal."
        : "Unable to load API key.",
    };
  }

  if (!data || !data.is_active || data.revoked_at) {
    return {
      success: false,
      message: "Revoked API keys cannot be revealed.",
    };
  }

  if (!data.key_encrypted) {
    return {
      success: false,
      message:
        "This older key was saved as a one-way hash only. Revoke it and generate a new key to enable Eye reveal.",
    };
  }

  try {
    const rawKey = decryptIntegrationSecret(data.key_encrypted);
    return {
      success: true,
      message: "API key revealed.",
      rawKey,
    };
  } catch {
    return {
      success: false,
      message: "Unable to decrypt this API key.",
    };
  }
}

export async function revokeBusinessApiKeyAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can revoke API keys.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const keyId = String(formData.get("keyId") ?? "").trim();
  if (submittedBusinessId !== business.id || !isUuid(keyId)) {
    return {
      success: false,
      message: "Invalid API key selection.",
    };
  }

  let updateRes = await supabaseAdmin
    .from("business_api_keys")
    .update({
      is_active: false,
      key_encrypted: null,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", keyId)
    .eq("business_id", business.id)
    .select("id, name, key_prefix")
    .maybeSingle();

  if (
    updateRes.error &&
    missingColumn(updateRes.error.code, updateRes.error.message)
  ) {
    updateRes = await supabaseAdmin
      .from("business_api_keys")
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq("id", keyId)
      .eq("business_id", business.id)
      .select("id, name, key_prefix")
      .maybeSingle();
  }

  if (updateRes.error || !updateRes.data) {
    return {
      success: false,
      message: "Unable to revoke API key.",
    };
  }

  await createAuditLog({
    action: "delete",
    entityType: "business",
    entityId: updateRes.data.id,
    description: `Revoked API key "${updateRes.data.name}" (${updateRes.data.key_prefix}•••)`,
  });

  revalidatePath("/dashboard/settings/integrations");
  return {
    success: true,
    message: "API key revoked immediately.",
  };
}

export async function saveBusinessWebhookAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can manage webhooks.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  if (submittedBusinessId !== business.id) {
    return {
      success: false,
      message: "Workspace changed. Refresh the page and try again.",
    };
  }

  const name =
    String(formData.get("name") ?? "").trim() || "TenhChat Social Inbox";
  if (name.length > 80) {
    return {
      success: false,
      message: "Webhook name must not exceed 80 characters.",
    };
  }

  let validatedUrl: URL;
  try {
    validatedUrl = validateSafeWebhookUrl(String(formData.get("targetUrl") ?? ""));
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Invalid webhook URL.",
    };
  }

  const events = normalizeWebhookEvents(formData.getAll("events"));
  const webhookId = String(formData.get("webhookId") ?? "").trim();

  if (webhookId) {
    if (!isUuid(webhookId)) {
      return { success: false, message: "Invalid webhook identifier." };
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("business_webhooks")
      .update({
        name,
        target_url: validatedUrl.href,
        events,
        updated_at: new Date().toISOString(),
      })
      .eq("id", webhookId)
      .eq("business_id", business.id)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return { success: false, message: "Unable to update webhook endpoint." };
    }

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: updated.id,
      description: `Updated webhook "${name}" (${validatedUrl.origin})`,
    });

    revalidatePath("/dashboard/settings/integrations");
    return { success: true, message: "Webhook endpoint updated." };
  }

  const { count, error: countError } = await supabaseAdmin
    .from("business_webhooks")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);

  if (countError) {
    return {
      success: false,
      message: migrationMissing(countError.code)
        ? "Webhook service is not initialized yet."
        : "Unable to check existing webhooks.",
    };
  }

  if ((count ?? 0) >= 5) {
    return {
      success: false,
      message: "You can configure up to 5 webhook endpoints per workspace.",
    };
  }

  const signingSecret = generateWebhookSecret();
  const { data: created, error: insertError } = await supabaseAdmin
    .from("business_webhooks")
    .insert({
      business_id: business.id,
      name,
      target_url: validatedUrl.href,
      signing_secret: signingSecret,
      events,
      is_active: true,
      created_by: business.userId ?? null,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return {
      success: false,
      message: "Unable to save webhook endpoint.",
    };
  }

  await createAuditLog({
    action: "create",
    entityType: "business",
    entityId: created.id,
    description: `Created webhook "${name}" (${validatedUrl.origin})`,
  });

  revalidatePath("/dashboard/settings/integrations");
  return {
    success: true,
    message:
      "Webhook endpoint added. Click the eye icon on the webhook row to view its URL or signing secret.",
    webhookId: created.id,
    targetUrl: validatedUrl.href,
    signingSecret,
  };
}

export async function revealBusinessWebhookAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can view webhook details.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  if (submittedBusinessId !== business.id || !isUuid(webhookId)) {
    return { success: false, message: "Invalid webhook selection." };
  }

  const { data, error } = await supabaseAdmin
    .from("business_webhooks")
    .select("id, target_url, signing_secret")
    .eq("id", webhookId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error || !data) {
    return { success: false, message: "Webhook endpoint not found." };
  }

  return {
    success: true,
    message: "Webhook details loaded.",
    webhookId: data.id,
    targetUrl: data.target_url,
    signingSecret: data.signing_secret,
  };
}

export async function toggleBusinessWebhookAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can manage webhooks.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  const nextActive = formData.get("isActive") === "true";

  if (submittedBusinessId !== business.id || !isUuid(webhookId)) {
    return { success: false, message: "Invalid webhook selection." };
  }

  const { data, error } = await supabaseAdmin
    .from("business_webhooks")
    .update({
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", webhookId)
    .eq("business_id", business.id)
    .select("id, name")
    .maybeSingle();

  if (error || !data) {
    return { success: false, message: "Unable to update webhook status." };
  }

  revalidatePath("/dashboard/settings/integrations");
  return {
    success: true,
    message: nextActive ? "Webhook enabled." : "Webhook paused.",
  };
}

export async function rotateWebhookSecretAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can rotate webhook secrets.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  if (submittedBusinessId !== business.id || !isUuid(webhookId)) {
    return { success: false, message: "Invalid webhook selection." };
  }

  const signingSecret = generateWebhookSecret();
  const { data, error } = await supabaseAdmin
    .from("business_webhooks")
    .update({
      signing_secret: signingSecret,
      updated_at: new Date().toISOString(),
    })
    .eq("id", webhookId)
    .eq("business_id", business.id)
    .select("id, name, target_url")
    .maybeSingle();

  if (error || !data) {
    return { success: false, message: "Unable to rotate signing secret." };
  }

  await createAuditLog({
    action: "update",
    entityType: "business",
    entityId: data.id,
    description: `Rotated signing secret for webhook "${data.name}"`,
  });

  revalidatePath("/dashboard/settings/integrations");
  return {
    success: true,
    message: "Signing secret rotated. Click the eye icon to reveal or copy the new secret.",
    webhookId: data.id,
    targetUrl: data.target_url,
    signingSecret,
  };
}

export async function deleteBusinessWebhookAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can delete webhooks.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  if (submittedBusinessId !== business.id || !isUuid(webhookId)) {
    return { success: false, message: "Invalid webhook selection." };
  }

  const { data, error } = await supabaseAdmin
    .from("business_webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("business_id", business.id)
    .select("id, name")
    .maybeSingle();

  if (error || !data) {
    return { success: false, message: "Unable to delete webhook endpoint." };
  }

  await createAuditLog({
    action: "delete",
    entityType: "business",
    entityId: data.id,
    description: `Deleted webhook "${data.name}"`,
  });

  revalidatePath("/dashboard/settings/integrations");
  return { success: true, message: "Webhook endpoint deleted." };
}

export async function testBusinessWebhookAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can test webhooks.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  const webhookId = String(formData.get("webhookId") ?? "").trim();
  if (submittedBusinessId !== business.id || !isUuid(webhookId)) {
    return { success: false, message: "Invalid webhook selection." };
  }

  const result = await sendTestBusinessWebhook({
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
    },
    webhookId,
  });

  revalidatePath("/dashboard/settings/integrations");
  return {
    success: result.ok,
    message: result.message,
  };
}

export async function flushPendingWebhooksAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  const business = await getCurrentBusiness();
  if (!isIntegrationAdminRole(business.role)) {
    return {
      success: false,
      message: "Only an Owner or Admin can dispatch queued webhooks.",
    };
  }

  const submittedBusinessId = String(formData.get("businessId") ?? "").trim();
  if (submittedBusinessId !== business.id) {
    return {
      success: false,
      message: "Workspace changed. Refresh the page and try again.",
    };
  }

  try {
    const summary = await dispatchBusinessWebhooks({
      businessId: business.id,
      limit: 25,
    });
    revalidatePath("/dashboard/settings/integrations");
    if (summary.claimed === 0) {
      return { success: true, message: "No pending webhook events in queue." };
    }
    return {
      success: summary.failed === 0,
      message: `Processed ${summary.claimed} queued webhook(s): ${summary.delivered} delivered, ${summary.failed} failed.`,
    };
  } catch {
    return {
      success: false,
      message: "Unable to dispatch queued webhooks right now.",
    };
  }
}
