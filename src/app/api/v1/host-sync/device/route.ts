import { NextResponse, type NextRequest } from "next/server";

import { createDeviceLogin } from "@/lib/host-sync/device";
import { rejectIfRateLimited } from "@/lib/http/rate-limit";

/**
 * Unauthenticated. CLI `penopta-sync login` starts a 10-minute device-code
 * flow. The box polls `/device/token` until the user confirms in the browser.
 */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "hostSyncDevice");
  if (limited) return limited;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }

  const hostname =
    typeof json === "object" &&
    json !== null &&
    "hostname" in json &&
    typeof json.hostname === "string"
      ? json.hostname.trim()
      : "";

  if (!hostname) {
    return NextResponse.json(
      { error: "hostname is required." },
      { status: 400 },
    );
  }

  try {
    const created = await createDeviceLogin(hostname);
    return NextResponse.json({
      user_code: created.userCode,
      device_code: created.deviceCode,
      verification_url: created.verificationUrl,
      expires_in: created.expiresIn,
    });
  } catch (err) {
    console.error("POST /api/v1/host-sync/device", err);
    return NextResponse.json(
      { error: "Couldn't start host login. Try again." },
      { status: 500 },
    );
  }
}
