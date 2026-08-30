import { useSyncExternalStore } from "react";

import { localDayKey } from "@/lib/stats/activity";

function subscribe() {
  return () => {};
}

/**
 * False during SSR and the hydration render; true after the client takes over.
 * Use this to keep timezone/locale text from mismatching the server HTML.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** Local `YYYY-MM-DD` after hydration; empty on the server so timezone text matches. */
export function useLocalToday(): string {
  return useSyncExternalStore(
    subscribe,
    () => localDayKey(new Date()),
    () => "",
  );
}
