import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Manual bank auto-verification is disabled. Payments require TENH admin review." },
    { status: 410 },
  );
}
