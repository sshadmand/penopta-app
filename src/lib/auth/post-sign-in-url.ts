/** Client-safe helpers for post-auth redirects (no DB imports). */

/** Mac app Safari-sheet callback. Not linked from website UI. */
export const MACOS_HANDOFF_PATH = "/auth/macos-handoff";

/** Query the Mac app always sends so a browser hitting this URL is a no-op. */
export const MACOS_HANDOFF_SRC = "macos";

/** Private reviewer switch sent only by an Option-click in the Mac app. */
export const MACOS_APP_REVIEW_PARAM = "app_review";
export const MACOS_APP_REVIEW_VALUE = "1";

export function macosHandoffReturnTo(appReview = false): string {
  const params = new URLSearchParams({ src: MACOS_HANDOFF_SRC });
  if (appReview) params.set(MACOS_APP_REVIEW_PARAM, MACOS_APP_REVIEW_VALUE);
  return `${MACOS_HANDOFF_PATH}?${params.toString()}`;
}

/** True only for the Mac app handoff path (query string ignored). */
export function isMacosHandoffReturnTo(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  return pathname === MACOS_HANDOFF_PATH;
}

/** True only for the exact Mac handoff plus its private App Review switch. */
export function isMacosAppReviewReturnTo(path: string): boolean {
  if (!isMacosHandoffReturnTo(path)) return false;
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  return (
    params.get("src") === MACOS_HANDOFF_SRC &&
    params.get(MACOS_APP_REVIEW_PARAM) === MACOS_APP_REVIEW_VALUE
  );
}

export function safeAppPath(value: string | null | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

/** Post-auth landing route; server decides integrations vs `returnTo`. */
export function postSignInHref(returnTo?: string | null): string {
  const to = safeAppPath(returnTo);
  if (to === "/") return "/api/auth/post-sign-in";
  return `/api/auth/post-sign-in?to=${encodeURIComponent(to)}`;
}
