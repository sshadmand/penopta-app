"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  applyResolvedTheme,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();
/** Same-tab override when localStorage is blocked. */
let memoryPreference: ThemePreference | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

function readPreference(): ThemePreference {
  return memoryPreference ?? readStoredPreference();
}

function snapshot(): `${ThemePreference}:${ResolvedTheme}` {
  if (typeof window === "undefined") return "dark:dark";
  const preference = readPreference();
  const resolved = resolveTheme(preference, systemPrefersDark());
  return `${preference}:${resolved}`;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pair = useSyncExternalStore(subscribe, snapshot, () => "dark:dark");
  const [preference, resolved] = pair.split(":") as [
    ThemePreference,
    ResolvedTheme,
  ];

  useLayoutEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => emit();
    media.addEventListener("change", onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      memoryPreference = null;
      emit();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    memoryPreference = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode can block storage; still apply for this session.
    }
    emit();
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
