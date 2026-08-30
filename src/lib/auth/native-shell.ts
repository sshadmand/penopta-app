"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/**
 * Set by the Mac app’s WKWebView at document start.
 * The Safari sign-in sheet is a normal browser and must not set this —
 * Google / GitHub / passkey on `/` stay unchanged there and on the website.
 *
 * The Mac app also injects a `<head>` marker so native-wrapper chrome can
 * target `html:has(#penopta-mac-app-chrome)` without fighting hydration.
 */
export function isPenoptaMacApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { __PENOPTA_MAC_APP?: boolean }).__PENOPTA_MAC_APP,
  );
}

/** False during SSR/hydration; true in the Mac app WKWebView after the client takes over. */
export function useIsPenoptaMacApp(): boolean {
  return useSyncExternalStore(subscribe, isPenoptaMacApp, () => false);
}
