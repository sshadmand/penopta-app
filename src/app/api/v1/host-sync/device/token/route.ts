import { NextResponse, type NextRequest } from "next/server";

import {
  linuxSyncIntegrationsUrl,
  pollDeviceTokenByDeviceCode,
  pollDeviceTokenByUserCode,
} from "@/lib/host-sync/device";
import { rejectIfRateLimited } from "@/lib/http/rate-limit";

/**
 * Unauthenticated poll. Device flow sends `device_code`; website claim
 * (`penopta-sync login --code`) sends `user_code`.
 */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "hostSyncDeviceToken");
  if (limited) return limited;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const deviceCode =
    typeof json === "object" &&
    json !== null &&
    "device_code" in json &&
    typeof json.device_code === "string"
      ? json.device_code
      : null;
  const userCode =
    typeof json === "object" &&
    json !== null &&
    "user_code" in json &&
    typeof json.user_code === "string"
      ? json.user_code
      : null;

  if (!deviceCode && !userCode) {
    return NextResponse.json(
      { error: "device_code or user_code is required." },
      { status: 400 },
    );
  }

  try {
    const result = deviceCode
      ? await pollDeviceTokenByDeviceCode(deviceCode)
      : await pollDeviceTokenByUserCode(userCode!);

    if (result.status === "pending") {
      return NextResponse.json(
        { error: "authorization_pending" },
        { status: 400 },
      );
    }
    if (result.status === "expired") {
      return NextResponse.json(
        {
          error: "expired_token",
          refresh_url: linuxSyncIntegrationsUrl(),
        },
        { status: 400 },
      );
    }
    if (result.status === "consumed") {
      return NextResponse.json(
        { error: "already_used" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      token: result.secret,
      expires_at: result.expiresAt,
      hostname: result.hostname,
      org_id: result.orgId,
      token_type: "host",
    });
  } catch (err) {
    console.error("POST /api/v1/host-sync/device/token", err);
    return NextResponse.json(
      { error: "Couldn't complete host login. Try again." },
      { status: 500 },
    );
  }
}
