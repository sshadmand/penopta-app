import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import Apple from "@/components/icons/Apple";

/** CTA / status for local macOS sync on a provider setup page. */
export function MacosProviderSyncCallout({ syncing }: { syncing: boolean }) {
  if (syncing) {
    return (
      <section className="mt-8 max-w-2xl">
        <Link
          href="/settings/integrations/macos"
          className="flex items-center gap-2 rounded-md bg-success-bg px-3 py-2 text-sm text-success transition hover:opacity-90"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          <span>Syncing code from macOS app</span>
          <span className="ml-auto shrink-0 text-success/70" aria-hidden>
            →
          </span>
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-8 max-w-2xl">
      <Link
        href="/settings/integrations/macos"
        className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground transition hover:bg-background"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-white"
        >
          <Apple className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">Set up macOS app</span>
          <span className="mt-0.5 block text-xs text-muted">
            Sync local Claude Code, Codex, or Cursor sessions Penopta can’t
            reach via MCP.
          </span>
        </span>
        <span className="shrink-0 text-muted" aria-hidden>
          →
        </span>
      </Link>
    </section>
  );
}
