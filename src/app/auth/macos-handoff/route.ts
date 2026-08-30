import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/auth";
import { createMacosHandoffCode } from "@/lib/auth/macos-handoff";
import {
  MACOS_APP_REVIEW_PARAM,
  MACOS_APP_REVIEW_VALUE,
  MACOS_HANDOFF_SRC,
  macosHandoffReturnTo,
} from "@/lib/auth/post-sign-in-url";
import { loginStartHref } from "@/lib/auth/urls";

export const dynamic = "force-dynamic";

const REAUTH_COOKIE = "penopta_macos_reauth";
const REAUTH_WINDOW_SECONDS = 10 * 60;
const FORCE_SIGN_IN_PARAM = "macos_sign_in";

function handoffChallengeValue(appReview: boolean): string {
  return appReview ? "review" : "standard";
}

/**
 * Mac app only (`?src=macos`). Website visitors without that query go home.
 * After the existing `/` sign-in (Google / GitHub / passkey in Safari),
 * mints a one-time code and sends the user back to Penopta Sync.
 */
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("src") !== MACOS_HANDOFF_SRC) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  const appReview =
    request.nextUrl.searchParams.get(MACOS_APP_REVIEW_PARAM) ===
    MACOS_APP_REVIEW_VALUE;
  const challengeValue = handoffChallengeValue(appReview);

  // A Mac sign-in must start at Penopta's sign-in choice, even if the system
  // browser still carries a session from another account. This prevents App
  // Review from silently receiving that account instead of the demo account,
  // without signing the person out of their normal browser workspace. The
  // short-lived, httpOnly cookie marks the return leg after that choice.
  const isReturningFromChallenge =
    request.cookies.get(REAUTH_COOKIE)?.value === challengeValue;
  if (!isReturningFromChallenge) {
    const login = new URL(
      loginStartHref(macosHandoffReturnTo(appReview)),
      request.nextUrl.origin,
    );
    login.searchParams.set(FORCE_SIGN_IN_PARAM, "1");
    const response = NextResponse.redirect(login);
    response.cookies.set(REAUTH_COOKIE, challengeValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/auth/macos-handoff",
      maxAge: REAUTH_WINDOW_SECONDS,
    });
    return response;
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL(
        loginStartHref(macosHandoffReturnTo(appReview)),
        request.nextUrl.origin,
      ),
    );
  }

  const code = await createMacosHandoffCode(session.user.id);
  const callback = `penopta-sync://auth?code=${encodeURIComponent(code)}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Returning to Penopta Sync</title>
<meta http-equiv="refresh" content="0;url=${callback}">
</head>
<body>
<p>Returning to the Penopta Mac app…</p>
<script>location.replace(${JSON.stringify(callback)});</script>
</body>
</html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
  response.cookies.set(REAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/auth/macos-handoff",
    maxAge: 0,
  });
  return response;
}
