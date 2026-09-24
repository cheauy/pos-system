import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordSubscriptionJob } from "@/lib/super-admin/job-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = new Date().toISOString();
  await recordSubscriptionJob(startedAt, "running");
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "process_subscription_expirations",
      { p_limit: 100 },
    );

    if (error) {
      await recordSubscriptionJob(startedAt, "failed");
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    await recordSubscriptionJob(startedAt, "succeeded");
    return NextResponse.json({
      ok: true,
      result: data,
      processedAt: new Date().toISOString(),
    });
  } catch {
    await recordSubscriptionJob(startedAt, "failed");
    return NextResponse.json({ error: "Subscription processing failed." }, { status: 500 });
  }
}
