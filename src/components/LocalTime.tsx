"use client";

import { formatDistanceToNow } from "date-fns";

import {
  formatCompactTime,
  formatDayLabel,
} from "@/lib/projects/activity-feed";
import { useIsHydrated } from "@/lib/use-hydrated";

function toDate(at: Date | number | string): Date {
  return at instanceof Date ? at : new Date(at);
}

/** Compact local time (`10PM`, `10:32PM`). Empty until after hydration. */
export function CompactTime({
  at,
  className,
}: {
  at: Date | number | string;
  className?: string;
}) {
  const hydrated = useIsHydrated();
  const date = toDate(at);
  if (Number.isNaN(date.getTime())) return null;

  return (
    <time dateTime={date.toISOString()} className={className}>
      {hydrated ? formatCompactTime(date) : null}
    </time>
  );
}

/** Locale datetime for thread headers. Empty until after hydration. */
export function LocaleTime({
  at,
  className,
}: {
  at: Date | number | string;
  className?: string;
}) {
  const hydrated = useIsHydrated();
  const date = toDate(at);
  if (Number.isNaN(date.getTime())) return null;

  return (
    <time dateTime={date.toISOString()} className={className}>
      {hydrated
        ? date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : null}
    </time>
  );
}

/** `Created 3 days ago`-style relative time. Stable placeholder until hydrated. */
export function RelativeTime({
  at,
  prefix,
}: {
  at: Date | number | string;
  prefix?: string;
}) {
  const hydrated = useIsHydrated();
  const date = toDate(at);
  if (Number.isNaN(date.getTime())) return null;

  const relative = hydrated
    ? formatDistanceToNow(date, { addSuffix: true })
    : null;
  if (!prefix) return relative;
  return relative ? `${prefix} ${relative}` : prefix;
}

/** Timeline day chip. Label fills in after hydration so SSR stays timezone-safe. */
export function TimelineDayDivider({ at }: { at: number }) {
  const hydrated = useIsHydrated();
  const label = hydrated ? formatDayLabel(new Date(at)) : null;

  return (
    <li
      aria-label={label ?? undefined}
      className="my-3 flex items-center gap-3 first:mt-0"
    >
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="shrink-0 text-xs tracking-wider text-muted uppercase">
        {label ?? "\u00a0"}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </li>
  );
}
