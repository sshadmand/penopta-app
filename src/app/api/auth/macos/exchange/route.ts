import { NextResponse, type NextRequest } from "next/server";

import {
  consumeMacosHandoffCode,
  mintMacosSessionCookie,
} from "@/lib/auth/macos-handoff";
import { rejectIfRateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Mac app only. Consumes a one-time handoff code and returns a signed
 * Better Auth session cookie to inject into WKWebView. Website login is
 * unchanged — browsers never call this.
 */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "macosExchange");
  if (limited) return limited;
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const userId = await consumeMacosHandoffCode(code);
  if (!userId) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const cookie = await mintMacosSessionCookie(userId);
  if (!cookie) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  return NextResponse.json({ cookie });
}
