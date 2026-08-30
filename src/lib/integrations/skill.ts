import { readFile } from "node:fs/promises";
import path from "node:path";

import { SYNC_SKILL_VERSION } from "@/lib/integrations/skill-version";

/** Providers that receive a pasteable hourly sync skill. */
export const SYNC_SKILL_PROVIDERS = ["chatgpt", "claude"] as const;

export type SyncSkillProvider = (typeof SYNC_SKILL_PROVIDERS)[number];

const SYNC_SKILL_DIR = path.join(
  process.cwd(),
  "src/lib/integrations/sync-skill",
);

const SHARED_PATH = path.join(SYNC_SKILL_DIR, "shared.md");

const DISCOVERY_HEADING = /^## Discovery\/enumeration mechanism\b/m;

type ProviderOverlay = {
  kindValues: string;
  modelExample: string;
  preamble: string;
  discovery: string;
};

const DEFAULT_KIND: Record<SyncSkillProvider, string> = {
  chatgpt: "chatgpt|codex|other",
  claude: "claude|other",
};

const DEFAULT_MODEL: Record<SyncSkillProvider, string> = {
  chatgpt: "gpt-5",
  claude: "claude-opus-4-8",
};

export function isSyncSkillProvider(
  value: string,
): value is SyncSkillProvider {
  return (SYNC_SKILL_PROVIDERS as readonly string[]).includes(value);
}

function overlayPath(provider: SyncSkillProvider): string {
  return path.join(SYNC_SKILL_DIR, `${provider}.md`);
}

/**
 * Parse a provider overlay markdown file.
 * Optional meta comments: `<!-- kind: ... -->`, `<!-- model: ... -->`.
 * Everything before the Discovery heading is preamble; from that heading
 * onward is discovery (inserted at {{provider_discovery}}).
 */
function parseProviderOverlay(
  provider: SyncSkillProvider,
  raw: string,
): ProviderOverlay {
  let kindValues = DEFAULT_KIND[provider];
  let modelExample = DEFAULT_MODEL[provider];
  let body = raw;

  // Strip the top authoring comment block if present.
  body = body.replace(/^<!--[\s\S]*?-->\s*/, "");

  const metaRe = /^<!--\s*(kind|model)\s*:\s*([^>]+?)\s*-->\s*/i;
  while (true) {
    const match = body.match(metaRe);
    if (!match) break;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "kind" && value) kindValues = value;
    if (key === "model" && value) modelExample = value;
    body = body.slice(match[0].length);
  }

  const discoveryMatch = body.match(DISCOVERY_HEADING);
  if (!discoveryMatch || discoveryMatch.index == null) {
    throw new Error(
      `Sync skill overlay for ${provider} is missing a "## Discovery/enumeration mechanism" heading.`,
    );
  }

  const preamble = body.slice(0, discoveryMatch.index).trim();
  const discovery = body.slice(discoveryMatch.index).trim();

  return { kindValues, modelExample, preamble, discovery };
}

function applyTemplate(
  shared: string,
  provider: SyncSkillProvider,
  overlay: ProviderOverlay,
  skillVersion: number,
): string {
  const replacements: Record<string, string> = {
    skillVersion: String(skillVersion),
    provider,
    kind_values: overlay.kindValues,
    model_example: overlay.modelExample,
    provider_preamble: overlay.preamble,
    provider_discovery: overlay.discovery,
  };

  return shared
    .replace(/\{\{(\w+)\}\}/g, (full, key: string) => {
      if (!(key in replacements)) {
        throw new Error(`Unknown sync-skill template token: {{${key}}}`);
      }
      return replacements[key]!;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Compose the resolved hourly sync skill markdown for one provider. */
export async function composeSyncSkill(
  provider: SyncSkillProvider,
  skillVersion: number = SYNC_SKILL_VERSION,
): Promise<string> {
  const [shared, overlayRaw] = await Promise.all([
    readFile(SHARED_PATH, "utf8"),
    readFile(overlayPath(provider), "utf8"),
  ]);
  const overlay = parseProviderOverlay(provider, overlayRaw);
  return applyTemplate(shared, provider, overlay, skillVersion);
}
