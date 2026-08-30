import { Bot } from "lucide-react";
import Link from "next/link";

import { INTEGRATIONS_PATH } from "@/lib/integrations/paths";

/** Empty-state card pointing people to connect agents so threads can ingest. */
export function AddAgentsHelper() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface px-8 py-9 text-center shadow-sm">
      <Bot
        aria-hidden
        className="mx-auto h-8 w-8 text-muted"
        strokeWidth={1.5}
      />
      <h1 className="mt-4 text-lg font-semibold tracking-tight">
        Add your Agents
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Connect an agent to make your agent threads available to one another.
        Your transcripts will not be visible with anyone unless you explicitly
        add it to a project in an organization.
      </p>
      <Link
        href={INTEGRATIONS_PATH}
        className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition hover:opacity-90"
      >
        Add your Agents
      </Link>
    </div>
  );
}
