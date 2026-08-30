import type { ProviderProjectProvider } from "@/lib/integrations/provider-projects";

/** Display label for a catalog provider. */
export function providerDisplayName(provider: ProviderProjectProvider): string {
  switch (provider) {
    case "chatgpt":
      return "ChatGPT";
    case "claude":
      return "Claude";
    case "cursor":
      return "Cursor";
  }
}

/**
 * Friendly source-project label for a thread's `projectContext`, resolving
 * catalog external ids to names when possible. Null when unset.
 */
export function resolveSourceProjectLabel(
  projectContext: string | null | undefined,
  catalog: Array<{ name: string; projectId: string }> = [],
): string | null {
  const raw = projectContext?.trim();
  if (!raw) return null;
  const match = catalog.find((p) => p.name === raw || p.projectId === raw);
  return match?.name ?? raw;
}

/** Who first registered a catalog project. */
export type ProviderProjectSource =
  "penopta_sync" | "penopta_sync_linux" | "skill";

export const PROVIDER_PROJECT_SOURCE_LABEL: Record<
  ProviderProjectSource,
  string
> = {
  penopta_sync: "MacOS app",
  penopta_sync_linux: "Linux sync",
  skill: "Skill",
};

/** Public catalog row shape for integrations UI (no DB types). */
export type AvailableProviderProject = {
  id: string;
  provider: ProviderProjectProvider;
  projectId: string;
  name: string;
  createdAt: string | null;
  updatedAt: string;
  source: ProviderProjectSource | null;
  tracked: boolean;
  /** Hidden from the Home Untracked list; still listed under Integrations. */
  sidebarHidden: boolean;
};

/** Sidebar / membership-picker shape for a source (provider) project. */
export function toSourceProjectOption(project: AvailableProviderProject) {
  return {
    id: project.id,
    name: project.name,
    provider: project.provider,
    providerLabel: providerDisplayName(project.provider),
    projectId: project.projectId,
    updatedAt: project.updatedAt,
    tracked: project.tracked,
    sidebarHidden: project.sidebarHidden,
  };
}
