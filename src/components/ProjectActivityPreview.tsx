"use client";

import Link from "next/link";
import { useMemo } from "react";

import { PendingActiveLabel } from "@/components/PendingNavLink";

import {
  type ActivityBucket,
  ACTIVITY_PREVIEW_DAYS,
  CONTRIBUTION_LEVEL_CLASS,
  activityPreviewDays,
  formatCount,
  formatDayLabel,
  toLocalActivityBuckets,
  valuesByDay,
} from "@/lib/stats/activity";
import { useLocalToday } from "@/lib/use-hydrated";

/** Last five local days of project activity; opens Analytics filtered to this project. */
export function ProjectActivityPreview({
  projectId,
  buckets,
}: {
  projectId: string;
  buckets: ActivityBucket[];
}) {
  const today = useLocalToday();

  const days = useMemo(() => {
    if (!today) return [];
    return activityPreviewDays(
      valuesByDay(toLocalActivityBuckets(buckets)),
      today,
      ACTIVITY_PREVIEW_DAYS,
    );
  }, [buckets, today]);

  const href = `/analytics?project=${encodeURIComponent(projectId)}`;

  if (!today) {
    return (
      <div
        className="flex h-3.5 w-20 shrink-0 animate-pulse rounded-sm bg-skeleton"
        aria-hidden
      />
    );
  }

  return (
    <Link
      href={href}
      aria-label="View analytics for this project"
      title="Last 5 days of activity"
      className="flex shrink-0 items-center gap-0.5 rounded-sm outline-none transition hover:opacity-80 focus-visible:ring-1 focus-visible:ring-foreground"
    >
      <PendingActiveLabel
        active={false}
        className="flex items-center gap-0.5"
        activeClassName="flex items-center gap-0.5 opacity-60"
      >
        {days.map((day) => {
          const noun = day.value === 1 ? "message" : "messages";
          const label = `${formatCount(day.value)} ${noun} on ${formatDayLabel(day.day)}`;
          return (
            <span
              key={day.day}
              title={label}
              className={`size-3.5 rounded-sm ${CONTRIBUTION_LEVEL_CLASS[day.level]}`}
            />
          );
        })}
      </PendingActiveLabel>
    </Link>
  );
}
