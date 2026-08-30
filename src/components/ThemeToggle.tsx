"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/ThemeProvider";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

const ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const;

function cyclePreference(current: ThemePreference): ThemePreference {
  const order: ThemePreference[] = ["system", "light", "dark"];
  return order[(order.indexOf(current) + 1) % order.length] ?? "system";
}

/** Compact control for headers and menus — cycles system → light → dark. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const Icon = ICONS[preference];
  const next = cyclePreference(preference);
  const currentLabel =
    THEME_PREFERENCES.find((item) => item.value === preference)?.label ??
    "System";

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${currentLabel}. Switch to ${next}`}
      title={`Theme: ${currentLabel}`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-background ${className ?? ""}`}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** Segmented Light / Dark / System control for settings. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex rounded-lg border border-border bg-background p-0.5"
    >
      {THEME_PREFERENCES.map((item) => {
        const Icon = ICONS[item.value];
        const selected = preference === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(item.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
              selected
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
