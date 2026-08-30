/**
 * Start sign-in on `/` (Better Auth Google / GitHub / passkey). Logged-out users land
 * on `/` already; this helper preserves returnTo for protected redirects.
 */
export function loginStartHref(returnTo?: string | null): string {
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    if (returnTo === "/") return "/";
    return `/?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return "/";
}
