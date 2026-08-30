import type { ComponentType } from "react";

import Anthropic from "@/components/icons/Anthropic";
import Cursor from "@/components/icons/Cursor";
import OpenAI from "@/components/icons/OpenAI";

type AgentIcon = ComponentType<{ className?: string }>;

/** `claude-code` → `Claude code` for sidebar labels. */
export function formatAgentDisplayName(agentName: string): string {
  const spaced = agentName.replace(/[-_]+/g, " ").trim();
  if (!spaced) return agentName;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Resolve a black brand glyph for a sync agent name (`cursor`, `claude-code`,
 * `codex`, …). Returns null when unknown.
 */
export function agentBrandIcon(
  agentName: string,
): { Icon: AgentIcon; className: string } | null {
  const token = agentName.trim().toLowerCase();

  if (
    token === "claude" ||
    token === "claude-code" ||
    token === "anthropic"
  ) {
    return {
      Icon: Anthropic,
      className: "size-full fill-current! text-foreground",
    };
  }

  if (
    token === "chatgpt" ||
    token === "openai" ||
    token === "codex"
  ) {
    return {
      Icon: OpenAI,
      className: "size-full fill-current! text-foreground",
    };
  }

  if (token === "cursor") {
    // White PNG — black in light UI, original white in dark UI.
    return {
      Icon: Cursor,
      className: "size-full brightness-0 dark:brightness-100",
    };
  }

  return null;
}

/**
 * Black brand icon for an agent name. Size the wrapper via `className`
 * (e.g. `size-2`); the glyph fills that box so baked-in icon sizes don’t win.
 */
export function AgentBrandIcon({
  agentName,
  className,
}: {
  agentName: string;
  className?: string;
}) {
  const resolved = agentBrandIcon(agentName);
  if (!resolved) return null;
  const { Icon, className: iconClass } = resolved;
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center",
        className ?? "size-3",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <Icon className={iconClass} />
    </span>
  );
}
