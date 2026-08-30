"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { setDailySummaryEnabledAction } from "@/lib/ai/actions";

/** Org toggle for the daily project-summary cron routine. */
export function DailySummaryRoutineToggle({
  enabled,
  hasAiKey,
  canManage,
}: {
  enabled: boolean;
  hasAiKey: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const effectiveOn = hasAiKey && enabled;

  function toggle() {
    if (!canManage || !hasAiKey) return;
    const next = !enabled;
    startTransition(async () => {
      const result = await setDailySummaryEnabledAction({ enabled: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next
          ? "Daily project summaries turned on"
          : "Daily project summaries turned off",
      );
      router.refresh();
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">Daily summaries</h3>
          <p className="mt-1 text-sm text-muted">
            Once a day, Penopta summarizes the last 24 hours of each project and
            posts it on that project’s home timeline (same place as{" "}
            <span className="font-medium text-foreground">/summary</span>). On
            by default when an AI key is saved.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={effectiveOn}
          disabled={pending || !canManage || !hasAiKey}
          onClick={toggle}
          title={
            !hasAiKey
              ? "Add an AI key first"
              : !canManage
                ? "Only organization owners can change this"
                : effectiveOn
                  ? "Turn off daily summaries"
                  : "Turn on daily summaries"
          }
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
            effectiveOn ? "bg-accent" : "bg-foreground/15"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-surface shadow transition ${
              effectiveOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
          <span className="sr-only">
            {effectiveOn ? "Daily summaries on" : "Daily summaries off"}
          </span>
        </button>
      </div>
    </section>
  );
}
