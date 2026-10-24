import { NextResponse } from "next/server";

import { runDailyProjectSkillDistill } from "@/lib/ai/daily-skills";
import { authorizeCron } from "@/lib/cron/authorize";

export const maxDuration = 300;

/**
 * Vercel Cron entrypoint. Distills each opted-in workgroup's newly synced
 * threads into skills and rules (same path as `/distill`).
 *
 * Schedule is `30 6 * * *` UTC in vercel.json — after the daily summaries.
 *
 * Secured with `CRON_SECRET` — Vercel sends `Authorization: Bearer …`.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runDailyProjectSkillDistill();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("GET /api/cron/daily-project-skills", err);
    return NextResponse.json(
      { error: "Daily skill distill failed." },
      { status: 500 },
    );
  }
}
