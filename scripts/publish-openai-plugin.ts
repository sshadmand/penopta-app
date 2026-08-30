/**
 * Regenerate the ChatGPT/Codex Penopta plugin package from skill sources
 * (query skill + composed hourly sync skill).
 *
 * Writes:
 *   plugins/penopta/…                 (installable plugin)
 *   .agents/plugins/marketplace.json  (repo marketplace entry)
 *
 * Does not submit to OpenAI’s public directory — that stays a portal step.
 *
 * Usage (from penopta-app):
 *   npm run plugins:publish
 *   npm run plugins:add   # once per machine (registers the repo marketplace)
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { composeSyncSkill } from "@/lib/integrations/skill";
import { SYNC_SKILL_VERSION } from "@/lib/integrations/skill-version";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CONFIG_PATH = join(ROOT, "plugins/openai/config.json");
const PLUGIN_DIR = join(ROOT, "plugins/penopta");
const MARKETPLACE_PATH = join(ROOT, ".agents/plugins/marketplace.json");
const INTEGRATIONS_DIR = join(ROOT, "src/lib/integrations");
/** Source logo for ChatGPT/Codex plugin cards (copied into plugins/penopta/assets/). */
const BRAND_ICON_PATH = join(ROOT, "public/brand/icon.png");
const DEFAULT_BRAND_COLOR = "#F97316";

type SkillConfig = {
  name: string;
  description: string;
  /**
   * `sync` → compose ChatGPT hourly sync skill.
   * Otherwise a filename under src/lib/integrations/ (e.g. query-skill.md).
   */
  source: string;
};

type PluginConfig = {
  pluginName: string;
  pluginVersion: string;
  description: string;
  author: { name: string; email?: string; url?: string };
  homepage?: string;
  keywords?: string[];
  /** ChatGPT developer-mode App Id (`asdk_app_…` or `plugin_asdk_app_…`). */
  chatgptAppId: string;
  mcpUrl: string;
  skills: SkillConfig[];
  interface: {
    displayName: string;
    shortDescription: string;
    longDescription: string;
    developerName: string;
    category: string;
    capabilities?: string[];
    websiteURL?: string;
    privacyPolicyURL?: string;
    termsOfServiceURL?: string;
    defaultPrompt?: string | string[];
    brandColor?: string;
  };
};

function loadConfig(): PluginConfig {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as PluginConfig;
  if (!raw.pluginName?.trim()) {
    throw new Error(`${CONFIG_PATH}: missing pluginName`);
  }
  if (!raw.chatgptAppId?.trim()) {
    throw new Error(`${CONFIG_PATH}: missing chatgptAppId`);
  }
  if (!raw.mcpUrl?.trim()) {
    throw new Error(`${CONFIG_PATH}: missing mcpUrl`);
  }
  if (!Array.isArray(raw.skills) || raw.skills.length === 0) {
    throw new Error(`${CONFIG_PATH}: skills must be a non-empty array`);
  }
  for (const skill of raw.skills) {
    if (!skill.name?.trim() || !skill.description?.trim() || !skill.source?.trim()) {
      throw new Error(
        `${CONFIG_PATH}: each skill needs name, description, and source`,
      );
    }
  }
  if (!raw.pluginVersion?.trim()) {
    throw new Error(`${CONFIG_PATH}: missing pluginVersion`);
  }
  return raw;
}

/** Normalize to the `asdk_app_…` form used in OpenAI’s example `.app.json` files. */
function normalizeAppId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("plugin_")) return trimmed.slice("plugin_".length);
  return trimmed;
}

function yamlQuote(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

/** Always quote name/description — unquoted YAML breaks on `: `, `#`, and smart quotes. */
function yamlFrontmatter(name: string, description: string): string {
  const safeDescription = description
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return [
    "---",
    `name: ${yamlQuote(name)}`,
    `description: ${yamlQuote(safeDescription)}`,
    "---",
    "",
  ].join("\n");
}

const PLUGIN_SYNC_SCOPE_NOTE =
  "This skill is **sync-only** (hourly schedule or an explicit “sync Penopta now”). " +
  "For questions about projects, threads, or what someone worked on, use the " +
  "`penopta-context` skill and Penopta MCP read tools — do not run discovery or `sync_threads` for Q&A.";

/**
 * Plugin installs don’t use the Integrations paste box — point stale runs at
 * reinstalling / republishing while still mentioning the paste fallback.
 */
function adaptSkillForPlugin(body: string): string {
  const adapted = body
    .replaceAll(
      "Re-copy Instructions from Penopta → Integrations, then re-run once.",
      "Update or reinstall the Penopta plugin (npm run plugins:publish, then reinstall from your marketplace), or re-copy Instructions from Penopta → Integrations, then re-run once.",
    )
    .replaceAll(
      "Re-copy Instructions from Penopta → Integrations.",
      "Update or reinstall the Penopta plugin, or re-copy Instructions from Penopta → Integrations.",
    )
    .replaceAll(
      'tell the user to re-copy Instructions from Penopta → Integrations',
      "tell the user to update/reinstall the Penopta plugin (or re-copy Instructions from Penopta → Integrations)",
    );

  // Insert scope note after the version HTML comment when present.
  const versionComment = /^(<!-- penopta-sync-skill-version: \d+ -->\s*)/;
  if (versionComment.test(adapted)) {
    return adapted.replace(
      versionComment,
      `$1${PLUGIN_SYNC_SCOPE_NOTE}\n\n`,
    );
  }
  return `${PLUGIN_SYNC_SCOPE_NOTE}\n\n${adapted}`;
}

function stripAuthoringComments(raw: string): string {
  return raw.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

async function resolveSkillBody(skill: SkillConfig): Promise<{
  body: string;
  generatedNote: string;
}> {
  if (skill.source === "sync") {
    const body = adaptSkillForPlugin(await composeSyncSkill("chatgpt"));
    return {
      body,
      generatedNote: `<!-- Generated by npm run plugins:publish — do not edit. Source: sync-skill + SYNC_SKILL_VERSION=${SYNC_SKILL_VERSION} -->`,
    };
  }

  const path = join(INTEGRATIONS_DIR, skill.source);
  if (!existsSync(path)) {
    throw new Error(`Skill source not found: ${path}`);
  }
  return {
    body: stripAuthoringComments(readFileSync(path, "utf8")),
    generatedNote: `<!-- Generated by npm run plugins:publish — do not edit. Source: src/lib/integrations/${skill.source} -->`,
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const appId = normalizeAppId(config.chatgptAppId);

  if (!existsSync(BRAND_ICON_PATH)) {
    throw new Error(`Missing brand icon: ${BRAND_ICON_PATH}`);
  }

  // Fresh tree so renamed skills / removed stubs don’t linger.
  rmSync(PLUGIN_DIR, { recursive: true, force: true });

  const assetsDir = join(PLUGIN_DIR, "assets");
  mkdirSync(join(PLUGIN_DIR, ".codex-plugin"), { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  // Same mark for list icon + logo; ChatGPT falls back to a shield without these.
  const iconDest = join(assetsDir, "icon.png");
  const logoDest = join(assetsDir, "logo.png");
  copyFileSync(BRAND_ICON_PATH, iconDest);
  copyFileSync(BRAND_ICON_PATH, logoDest);

  const skillPaths: string[] = [];
  for (const skill of config.skills) {
    const { body, generatedNote } = await resolveSkillBody(skill);
    const skillDir = join(PLUGIN_DIR, "skills", skill.name);
    mkdirSync(skillDir, { recursive: true });
    const skillMd = [
      yamlFrontmatter(skill.name, skill.description),
      generatedNote,
      "",
      body.trim(),
      "",
    ].join("\n");
    const skillPath = join(skillDir, "SKILL.md");
    writeFileSync(skillPath, skillMd);
    skillPaths.push(skillPath);
  }

  writeJson(join(PLUGIN_DIR, ".app.json"), {
    apps: {
      penopta: { id: appId },
    },
  });

  writeJson(join(PLUGIN_DIR, ".mcp.json"), {
    mcpServers: {
      penopta: {
        type: "http",
        url: config.mcpUrl,
        oauth_resource: config.mcpUrl,
      },
    },
  });

  // Bump plugins/openai/config.json → pluginVersion when skills or MCP wiring change
  // so marketplace caches invalidate (sync body version stays SYNC_SKILL_VERSION).
  const packageVersion = config.pluginVersion;

  writeJson(join(PLUGIN_DIR, ".codex-plugin/plugin.json"), {
    name: config.pluginName,
    version: packageVersion,
    description: config.description,
    author: config.author,
    homepage: config.homepage,
    keywords: config.keywords,
    skills: "./skills/",
    apps: "./.app.json",
    mcpServers: "./.mcp.json",
    interface: {
      ...config.interface,
      brandColor: config.interface.brandColor ?? DEFAULT_BRAND_COLOR,
      composerIcon: "./assets/icon.png",
      logo: "./assets/logo.png",
    },
  });

  writeJson(MARKETPLACE_PATH, {
    name: "penopta-repo",
    interface: {
      displayName: "Penopta",
    },
    plugins: [
      {
        name: config.pluginName,
        source: {
          source: "local",
          path: "./plugins/penopta",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: config.interface.category || "Productivity",
      },
    ],
  });

  console.log("");
  console.log(
    `Published Penopta plugin v${packageVersion} (hourly sync skill v${SYNC_SKILL_VERSION})`,
  );
  for (const skillPath of skillPaths) {
    console.log(`  skill   ${skillPath}`);
  }
  console.log(`  plugin  ${PLUGIN_DIR}`);
  console.log(`  logo    ${logoDest}`);
  console.log(`  market  ${MARKETPLACE_PATH}`);
  console.log(`  mcp     ${config.mcpUrl}`);
  console.log(`  app id  ${appId}`);
  console.log("");
  console.log("Next:");
  console.log("  1. First time on this machine: npm run plugins:add");
  console.log(
    "  2. Restart ChatGPT desktop (Work/Codex) → Plugins → Personal → Penopta → install/update",
  );
  console.log(
    "  3. Complete Sign in with Penopta if prompted, then confirm MCP tools in a new chat (e.g. Verify my Penopta connection).",
  );
  console.log(
    "Public directory listing still requires the OpenAI plugin submission portal.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
