import { NextResponse } from "next/server";

import { runDailyProjectSummaries } from "@/lib/ai/daily-summary";
import { authorizeCron } from "@/lib/cron/authorize";

export const maxDuration = 300;

/**
 * Vercel Cron entrypoint. Posts a 24h summary onto each eligible project's
 * timeline (same assistant chat rows as `/summary`).
 *
 * Schedule is `0 6 * * *` UTC in vercel.json — 11 PM Pacific during PDT,
 * 10 PM Pacific during PST (Vercel cron is UTC-only).
 *
 * Secured with `CRON_SECRET` — Vercel sends `Authorization: Bearer …`.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runDailyProjectSummaries();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("GET /api/cron/daily-project-summaries", err);
    return NextResponse.json(
      { error: "Daily summary run failed." },
      { status: 500 },
    );
  }
}
