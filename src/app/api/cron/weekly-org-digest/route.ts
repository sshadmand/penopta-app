import { NextResponse } from "next/server";

import { runWeeklyOrgDigests } from "@/lib/ai/weekly-digest";
import { authorizeCron } from "@/lib/cron/authorize";

export const maxDuration = 300;

/**
 * Vercel Cron entrypoint. Emails each opted-in team org a recap of last
 * week's daily project summaries (shared workgroups plus each member's
 * own private ones).
 *
 * Schedule is `0 14 * * 1` UTC in vercel.json — 7 AM Pacific during PDT,
 * 6 AM Pacific during PST (Vercel cron is UTC-only).
 *
 * Secured with `CRON_SECRET` — Vercel sends `Authorization: Bearer …`.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runWeeklyOrgDigests();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("GET /api/cron/weekly-org-digest", err);
    return NextResponse.json(
      { error: "Weekly digest run failed." },
      { status: 500 },
    );
  }
}
