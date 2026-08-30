"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  sendWeeklyDigestNowAction,
  setWeeklyDigestEnabledAction,
} from "@/lib/ai/actions";

/** Org toggle for the Monday team progress email. Hidden on personal spaces. */
export function WeeklyDigestRoutineToggle({
  enabled,
  hasAiKey,
  canManage,
  emailConfigured,
}: {
  enabled: boolean;
  hasAiKey: boolean;
  canManage: boolean;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const effectiveOn = hasAiKey && enabled;

  function toggle() {
    if (!canManage || !hasAiKey) return;
    const next = !enabled;
    startTransition(async () => {
      const result = await setWeeklyDigestEnabledAction({ enabled: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next
          ? "Weekly progress emails turned on"
          : "Weekly progress emails turned off",
      );
      router.refresh();
    });
  }

  function sendNow() {
    if (!canManage || !hasAiKey || !emailConfigured) return;
    startTransition(async () => {
      const result = await sendWeeklyDigestNowAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.skippedNoActivity) {
        toast.success("No daily summaries this week to email.");
        return;
      }
      toast.success(
        result.emailed === 1
          ? "Sent this week’s snapshot to 1 teammate"
          : `Sent this week’s snapshot to ${result.emailed} teammates`,
      );
    });
  }

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">Weekly email snapshot</h3>
          <p className="mt-1 text-sm text-muted">
            Each Monday, email teammates a short recap of this org’s daily
            summaries from the past week. Shared workgroups go to everyone;
            private ones only to their owner. If there are no summaries that
            week, no email is sent. Needs daily summaries turned on. On by
            default.
          </p>
          {!emailConfigured ? (
            <p className="mt-2 text-sm text-muted">
              Email isn’t configured in this environment, so nothing will be sent
              until it is.
            </p>
          ) : null}
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
                  ? "Turn off weekly progress emails"
                  : "Turn on weekly progress emails"
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
            {effectiveOn
              ? "Weekly progress emails on"
              : "Weekly progress emails off"}
          </span>
        </button>
      </div>
      {canManage && hasAiKey ? (
        <button
          type="button"
          disabled={pending || !emailConfigured}
          onClick={sendNow}
          title={
            emailConfigured
              ? "Email teammates this week’s snapshot now"
              : "Email isn’t configured"
          }
          className="mt-3 text-sm font-medium text-accent disabled:opacity-50"
        >
          Email this week’s snapshot now
        </button>
      ) : null}
    </section>
  );
}
