import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const INACTIVE_DAYS_BEFORE_RELEASE = 60;
const BATCH_SIZE = 250;

function addDays(value: string | Date, days: number) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type ExpiredBusiness = {
  id: string;
  subscription_expires_at: string;
};

type DisabledBusiness = {
  id: string;
  disabled_at: string;
  scheduled_deletion_at: string | null;
};

type DueBusiness = {
  id: string;
};

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const errors: Array<{ businessId: string; message: string }> = [];
  let expiredDisabled = 0;
  let deletionScheduled = 0;
  let released = 0;

  /*
   * 1. Expire businesses even if nobody visits the dashboard after
   *    the subscription end date. The 60-day clock starts from the
   *    subscription expiry timestamp, not from the cron execution time.
   */
  const { data: expiredRows, error: expiredLookupError } =
    await supabaseAdmin
      .from("businesses")
      .select("id, subscription_expires_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .not("subscription_expires_at", "is", null)
      .lte("subscription_expires_at", nowIso)
      .limit(BATCH_SIZE);

  if (expiredLookupError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unable to find expired businesses: ${expiredLookupError.message}`,
      },
      { status: 500 },
    );
  }

  for (const row of (expiredRows ?? []) as ExpiredBusiness[]) {
    const expiry = new Date(row.subscription_expires_at);

    if (Number.isNaN(expiry.getTime())) continue;

    const releaseAt = addDays(expiry, INACTIVE_DAYS_BEFORE_RELEASE);

    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        is_active: false,
        disabled_at: expiry.toISOString(),
        disabled_reason: "subscription_expired",
        scheduled_deletion_at: releaseAt.toISOString(),
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("is_active", true)
      .is("archived_at", null);

    if (error) {
      errors.push({ businessId: row.id, message: error.message });
    } else {
      expiredDisabled += 1;
    }
  }

  /*
   * 2. Backfill the 60-day deadline for older disabled businesses that
   *    were created before this lifecycle rule existed.
   */
  const { data: unscheduledRows, error: unscheduledLookupError } =
    await supabaseAdmin
      .from("businesses")
      .select("id, disabled_at, scheduled_deletion_at")
      .eq("is_active", false)
      .is("archived_at", null)
      .not("disabled_at", "is", null)
      .limit(BATCH_SIZE);

  if (unscheduledLookupError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unable to find unscheduled inactive businesses: ${unscheduledLookupError.message}`,
      },
      { status: 500 },
    );
  }

  for (const row of (unscheduledRows ?? []) as DisabledBusiness[]) {
    const disabledAt = new Date(row.disabled_at);

    if (Number.isNaN(disabledAt.getTime())) continue;

    const releaseAt = addDays(disabledAt, INACTIVE_DAYS_BEFORE_RELEASE);
    const existingReleaseAt = row.scheduled_deletion_at
      ? new Date(row.scheduled_deletion_at)
      : null;

    // Older code used a longer deletion window in one admin action. The
    // product rule is now exactly 60 days, so shorten only deadlines that
    // are missing or later than disabled_at + 60 days. Never extend one.
    if (
      existingReleaseAt &&
      !Number.isNaN(existingReleaseAt.getTime()) &&
      existingReleaseAt.getTime() <= releaseAt.getTime()
    ) {
      continue;
    }

    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        scheduled_deletion_at: releaseAt.toISOString(),
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("is_active", false)
      .is("archived_at", null);

    if (error) {
      errors.push({ businessId: row.id, message: error.message });
    } else {
      deletionScheduled += 1;
    }
  }

  /*
   * 3. Release store addresses whose businesses have remained inactive
   *    for the full 60-day grace period. The RPC locks the row and
   *    re-checks every condition so reactivation cannot race this job.
   */
  const { data: dueRows, error: dueLookupError } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("is_active", false)
    .is("archived_at", null)
    .not("scheduled_deletion_at", "is", null)
    .lte("scheduled_deletion_at", nowIso)
    .limit(BATCH_SIZE);

  if (dueLookupError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unable to find businesses ready for release: ${dueLookupError.message}`,
      },
      { status: 500 },
    );
  }

  for (const row of (dueRows ?? []) as DueBusiness[]) {
    const { data, error } = await supabaseAdmin.rpc(
      "release_inactive_business_slug",
      { p_business_id: row.id },
    );

    if (error) {
      errors.push({ businessId: row.id, message: error.message });
      continue;
    }

    if (Array.isArray(data) ? data.length > 0 : Boolean(data)) {
      released += 1;
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    checkedAt: nowIso,
    policy: {
      inactiveDaysBeforeRelease: INACTIVE_DAYS_BEFORE_RELEASE,
    },
    expiredDisabled,
    deletionScheduled,
    released,
    errors,
  });
}
