import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Missing secret
 * fails closed (500). Wrong bearer fails 401.
 */
export function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("CRON_SECRET is not set");
    return NextResponse.json(
      { error: "Cron is not configured." },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!bearerMatches(auth, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

export function bearerMatches(authorization: string, secret: string): boolean {
  return timingSafeEqualUtf8(authorization, `Bearer ${secret}`);
}

function timingSafeEqualUtf8(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}
