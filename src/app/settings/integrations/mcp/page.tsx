import { CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { McpCommandPlayMenu } from "@/components/McpCommandPlayMenu";
import Mcp from "@/components/icons/Mcp";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { getPenoptaSyncInstallStatus } from "@/lib/integrations/macos";
import {
  listMcpSetupLinks,
  listMcpToolsByCategory,
  mcpIntegration,
} from "@/lib/integrations/mcp";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
import { getLatestMcpVerification } from "@/lib/oauth/tokens";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { listSyncedAgentNames } from "@/lib/threads/data";

/** Map agent / sync names onto Claude or ChatGPT integration cards. */
function providerIdFromAgentName(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (n === "claude" || n === "claude-code" || n === "anthropic")
    return "claude";
  if (n === "chatgpt" || n === "openai" || n === "codex") return "chatgpt";
  if (n === "cursor") return "cursor";
  return null;
}

export default async function McpIntegrationPage() {
  const session = await getSession();
  if (!session) {
    redirect(loginStartHref(integrationPath("mcp")));
  }

  const setupLinks = listMcpSetupLinks();
  const toolGroups = listMcpToolsByCategory();
  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const [syncedAgents, macStatus, mcpVerification] = await Promise.all([
    listSyncedAgentNames(activeOrg.id),
    getPenoptaSyncInstallStatus(activeOrg.id),
    getLatestMcpVerification(session.user.id),
  ]);

  const activeIds = new Set<string>();
  if (macStatus.installed) activeIds.add("macos");
  for (const name of syncedAgents) {
    const id = providerIdFromAgentName(name);
    if (id) activeIds.add(id);
  }
  const verifiedProvider = providerIdFromAgentName(mcpVerification?.agent);
  if (verifiedProvider) activeIds.add(verifiedProvider);
  // Any successful penopta_verify counts as MCP proven; attribute to both
  // chat providers only when the agent field was omitted.
  if (mcpVerification && !mcpVerification.agent) {
    activeIds.add("claude");
    activeIds.add("chatgpt");
  }

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 sm:px-12">
      <Link
        href={INTEGRATIONS_PATH}
        className="text-sm font-medium text-muted transition hover:text-foreground"
      >
        ← MCP Tools
      </Link>

      <div className="mt-6 flex items-center gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 place-items-center rounded-full ${mcpIntegration.iconBg}`}
        >
          <Mcp className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mcpIntegration.setupTitle}
          </h1>
          <p className="text-sm text-muted">{mcpIntegration.byline}</p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        {mcpIntegration.intro}
      </p>

      <section className="mt-8 max-w-2xl">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Set up a connector
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Add Penopta in your agent first — then these tools become available in
          chat.
        </p>
        <ul className="mt-4 space-y-2">
          {setupLinks.map((link) => {
            const Icon = link.icon;
            const active = activeIds.has(link.id);
            return (
              <li key={link.id}>
                <Link
                  href={link.href}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground transition hover:bg-background"
                >
                  <span
                    aria-hidden
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${link.iconBg}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{link.label}</span>
                      {active ? (
                        <span className="text-xs font-medium uppercase tracking-wide text-success">
                          {link.id === "macos" ? "Installed" : "Connected"}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {link.byline}
                    </span>
                  </span>
                  {active ? (
                    <CheckCircle2
                      className="size-5 shrink-0 text-success"
                      aria-label={
                        link.id === "macos" ? "Installed" : "Connected"
                      }
                    />
                  ) : (
                    <ChevronRight
                      className="size-5 shrink-0 text-muted"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10 max-w-4xl">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
            MCP commands
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Things you can ask your agent to do after Penopta is connected.
            Scheduled sync still uses additional tools behind the scenes.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-xl border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-sidebar text-xs font-semibold tracking-wide text-muted uppercase">
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Command
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  What it does
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  When to use
                </th>
              </tr>
            </thead>
            <tbody>
              {toolGroups.flatMap((group) => [
                <tr
                  key={`${group.category}-header`}
                  className="border-b border-border"
                >
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="bg-skeleton px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    {group.label}
                  </th>
                </tr>,
                ...group.tools.map((tool) => (
                  <tr
                    key={tool.name}
                    className="border-b border-border last:border-b-0 align-top"
                  >
                    <td className="px-3 py-3">
                      <div className="group/cmd flex items-center gap-1">
                        <code className="rounded bg-skeleton px-1.5 py-0.5 font-mono text-[13px] text-foreground">
                          {tool.name}
                        </code>
                        <McpCommandPlayMenu command={tool.name} />
                      </div>
                    </td>
                    <td className="px-3 py-3 leading-relaxed ">
                      <div className=" text-xs text-muted">{tool.summary}</div>
                    </td>
                    <td className="px-3 py-3 text-xs leading-relaxed text-muted">
                      {tool.whenToUse}
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
