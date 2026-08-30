"use client";

import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { CopyField } from "@/components/CopyField";
import {
  DIAGNOSE_CHAT_COMMAND,
  mcpDiagnoseChatPrompt,
  syncHasCaptureGap,
  type McpConnectionHealth,
} from "@/lib/integrations/diagnose-shared";

function statusLabel(status: McpConnectionHealth["status"]): string {
  switch (status) {
    case "never_connected":
      return "Never connected";
    case "needs_reauth":
      return "Needs re-sign-in";
    case "access_expired_refresh_ok":
      return "Access expired (refresh still valid)";
    case "auth_ok_never_verified":
      return "Signed in — not verified yet";
    case "auth_ok":
      return "Signed in";
  }
}

/**
 * Small footer under MCP setup. Opens a modal with connection health + the
 * ChatGPT/Claude self-check (full prompt only on Copy/Run).
 */
export function McpDiagnosePanel({
  providerName,
  agentHint,
  diagnoseHref,
  health,
}: {
  providerName: string;
  agentHint: string;
  diagnoseHref?: string;
  health: McpConnectionHealth;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const prompt = mcpDiagnoseChatPrompt(agentHint);
  const latestSync = health.recentSyncs[0] ?? null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <p className="mt-3 text-sm text-muted">
        If you believe you installed it correctly,{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          run this diagnose for more help
        </button>
        .
      </p>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id={titleId}
                  className="text-base font-semibold text-foreground"
                >
                  Diagnose {providerName} connection
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Compare what Penopta sees with what {providerName} reports.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted transition hover:bg-sidebar hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 rounded-md bg-sidebar px-4 py-3 text-sm">
              <p className="font-medium text-foreground">
                {statusLabel(health.status)}
              </p>
              <p className="mt-1 text-muted">{health.summary}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>
                  Last verify:{" "}
                  {health.lastVerify
                    ? `${formatDistanceToNow(new Date(health.lastVerify.verifiedAt), { addSuffix: true })}${
                        health.lastVerify.agent
                          ? ` via ${health.lastVerify.agent}`
                          : ""
                      }`
                    : "never"}
                </li>
                <li>
                  Tokens: access{" "}
                  {health.auth.accessValid
                    ? "valid"
                    : health.auth.accessExpiresAt
                      ? "expired"
                      : "none"}
                  {health.auth.refreshValid
                    ? " · refresh valid"
                    : " · refresh expired or missing"}
                </li>
                <li>
                  Last hourly sync
                  {agentHint ? ` (${agentHint})` : ""}:{" "}
                  {latestSync
                    ? `${formatDistanceToNow(new Date(latestSync.createdAt), { addSuffix: true })}${
                        syncHasCaptureGap(latestSync) && latestSync.limitation
                          ? ` — ${latestSync.limitation}`
                          : ` · ${latestSync.threadsChanged} threads changed`
                      }`
                    : "none delivered yet"}
                </li>
              </ul>
            </div>

            <div className="mt-4">
              <CopyField
                label={`Check in ${providerName}`}
                value={prompt}
                displayValue={DIAGNOSE_CHAT_COMMAND}
                action={
                  diagnoseHref
                    ? { label: "Run", href: diagnoseHref }
                    : undefined
                }
                reloadAction={{ label: "Reload" }}
                hint={`Same idea as verify — asks ${providerName} to call penopta_diagnose. Reload after it runs.`}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
