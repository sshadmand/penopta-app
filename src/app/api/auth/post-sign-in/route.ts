import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/auth";
import {
  isMacosHandoffReturnTo,
  isNewlyRegisteredUser,
  safeAppPath,
} from "@/lib/auth/post-sign-in";

/**
 * After social / passkey sign-in: first-time accounts land on integrations
 * settings; returning users continue to `?to=` (default `/`).
 *
 * Mac app Safari-sheet sign-in is the exception: always return to the
 * handoff URL so the one-time code can complete. Website `/` sign-in is
 * unchanged.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  const returnTo = safeAppPath(request.nextUrl.searchParams.get("to"));
  const dest = isMacosHandoffReturnTo(returnTo)
    ? returnTo
    : (await isNewlyRegisteredUser(session.user.id))
      ? "/settings/integrations"
      : returnTo;

  return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
}
