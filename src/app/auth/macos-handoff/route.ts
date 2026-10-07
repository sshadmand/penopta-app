import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/auth";
import { createMacosHandoffCode } from "@/lib/auth/macos-handoff";
import {
  MACOS_APP_REVIEW_PARAM,
  MACOS_APP_REVIEW_VALUE,
  MACOS_HANDOFF_SRC,
  MACOS_OAUTH_PROVIDER_PARAM,
  macosHandoffReturnTo,
  macosOAuthProvider,
  postSignInHref,
  type MacosOAuthProvider,
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
 * `provider=google|github` starts that provider immediately. The reviewer
 * screen (`app_review=1`) still shows the email form. Sign in with Apple
 * stays in the Mac app. A completed sign-in mints a one-time code and
 * sends the user back to Penopta Sync.
 */
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("src") !== MACOS_HANDOFF_SRC) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  const appReview =
    request.nextUrl.searchParams.get(MACOS_APP_REVIEW_PARAM) ===
    MACOS_APP_REVIEW_VALUE;
  const provider = appReview
    ? null
    : macosOAuthProvider(
        request.nextUrl.searchParams.get(MACOS_OAUTH_PROVIDER_PARAM),
      );
  const challengeValue = handoffChallengeValue(appReview);

  // The short-lived cookie marks a sign-in that started in this handoff.
  // Without it, a browser that is already signed in to Penopta would hand
  // that account to the Mac app. Google and GitHub skip Penopta's page and
  // go straight to the provider; the cookie is set on that redirect too.
  const isReturningFromChallenge =
    request.cookies.get(REAUTH_COOKIE)?.value === challengeValue;
  if (!isReturningFromChallenge) {
    if (provider) {
      const direct = await redirectToOAuthProvider(
        request,
        provider,
        challengeValue,
      );
      if (direct) return direct;
    }
    return loginChallengeRedirect(request, appReview, challengeValue);
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
  response.cookies.set(REAUTH_COOKIE, "", reauthCookieOptions(request, 0));
  return response;
}

function loginChallengeRedirect(
  request: NextRequest,
  appReview: boolean,
  challengeValue: string,
): NextResponse {
  const login = new URL(
    loginStartHref(macosHandoffReturnTo(appReview)),
    request.nextUrl.origin,
  );
  login.searchParams.set(FORCE_SIGN_IN_PARAM, "1");
  const response = NextResponse.redirect(login);
  response.cookies.set(
    REAUTH_COOKIE,
    challengeValue,
    reauthCookieOptions(request, REAUTH_WINDOW_SECONDS),
  );
  return response;
}

/** Starts Google or GitHub and returns null when that redirect cannot be built. */
async function redirectToOAuthProvider(
  request: NextRequest,
  provider: MacosOAuthProvider,
  challengeValue: string,
): Promise<NextResponse | null> {
  try {
    const started = await auth.api.signInSocial({
      body: {
        provider,
        callbackURL: postSignInHref(macosHandoffReturnTo(false)),
        disableRedirect: true,
      },
      headers: request.headers,
      returnHeaders: true,
    });
    const authorizeURL = started.response.url;
    if (!authorizeURL || !isHttpURL(authorizeURL)) return null;

    const response = NextResponse.redirect(authorizeURL);
    for (const cookie of started.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    response.cookies.set(
      REAUTH_COOKIE,
      challengeValue,
      reauthCookieOptions(request, REAUTH_WINDOW_SECONDS),
    );
    return response;
  } catch {
    console.error("macos handoff provider start");
    return null;
  }
}

function isHttpURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function reauthCookieOptions(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    path: "/auth/macos-handoff",
    maxAge,
  };
}
