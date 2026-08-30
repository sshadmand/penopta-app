export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "penopta-theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";

export const THEME_PREFERENCES: {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function parseThemePreference(value: string | null): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/** Runs before paint so the first frame matches the stored preference (dark by default). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=s==="light"?!1:s==="system"?matchMedia("(prefers-color-scheme: dark)").matches:!0;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
