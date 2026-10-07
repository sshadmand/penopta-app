import { APIError } from "better-auth/api";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/auth";
import { nativeAppleSignInBody } from "@/lib/auth/apple-native";
import { mintMacosSessionCookie } from "@/lib/auth/macos-handoff";
import { rejectIfRateLimited } from "@/lib/http/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Mac app only. Verifies a native Sign in with Apple identity token and
 * returns a Better Auth session cookie for WKWebView. The system Apple sheet
 * stays inside the app; this route is not used by the website.
 */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "macosApple");
  if (limited) return limited;

  let identityToken = "";
  let nonce: string | undefined;
  let givenName: string | undefined;
  let familyName: string | undefined;
  let email: string | undefined;
  try {
    const body = (await request.json()) as {
      identityToken?: unknown;
      nonce?: unknown;
      givenName?: unknown;
      familyName?: unknown;
      email?: unknown;
    };
    identityToken = boundedString(body.identityToken, 8_000) ?? "";
    nonce = boundedString(body.nonce, 256);
    givenName = boundedString(body.givenName, 128);
    familyName = boundedString(body.familyName, 128);
    email = boundedString(body.email, 320);
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  if (!identityToken) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  try {
    const result = await auth.api.signInSocial({
      body: nativeAppleSignInBody({
        identityToken,
        nonce,
        givenName,
        familyName,
        email,
      }),
      headers: request.headers,
    });
    const userId = "user" in result ? result.user?.id : undefined;
    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const cookie = await mintMacosSessionCookie(userId);
    if (!cookie) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    return NextResponse.json({ cookie });
  } catch (error) {
    if (error instanceof APIError) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    console.error("POST /api/auth/macos/apple");
    return NextResponse.json({ error: "invalid_token" }, { status: 500 });
  }
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}
