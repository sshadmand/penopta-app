"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { setSkillDistillEnabledAction } from "@/lib/ai/actions";

/** Org toggle for the daily skill distill cron routine. */
export function SkillDistillRoutineToggle({
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
      const result = await setSkillDistillEnabledAction({ enabled: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? "Daily skills turned on" : "Daily skills turned off",
      );
      router.refresh();
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">Daily skills</h3>
          <p className="mt-1 text-sm text-muted">
            Once a day, Penopta reads each workgroup&apos;s newly synced threads
            and updates its skills and rules (same as{" "}
            <span className="font-medium text-foreground">/distill</span>). They
            go live right away and reach teammates&apos; repos through the Mac
            app. Off by default.
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
                  ? "Turn off daily skills"
                  : "Turn on daily skills"
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
            {effectiveOn ? "Daily skills on" : "Daily skills off"}
          </span>
        </button>
      </div>
    </section>
  );
}
