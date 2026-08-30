# OpenAI / ChatGPT plugin

Local packaging for the Penopta ChatGPT + Codex plugin (MCP connector + skills).

## Source of truth

| File | Role |
| --- | --- |
| `config.json` | Plugin metadata, ChatGPT App Id, MCP URL, skill list (edit this) |
| `public/brand/icon.png` | Logo copied into `plugins/penopta/assets/` on publish |
| `src/lib/integrations/query-skill.md` | Live-chat read/search skill (`penopta-context`) |
| `src/lib/integrations/sync-skill/*` | Hourly sync skill body (shared + ChatGPT overlay) |
| `src/lib/integrations/skill-version.ts` | `SYNC_SKILL_VERSION` — bump when sync instructions change |

Do **not** hand-edit `plugins/penopta/` — it is regenerated.

Skills stay separate on purpose:

- **`penopta-context`** — answer questions from Penopta MCP read tools (list/search/get/stats). Never scrapes the web app.
- **`penopta-hourly-sync`** — scheduled / “sync now” bulk delivery only.

Bump `pluginVersion` in `config.json` whenever you publish skill or MCP packaging changes so the marketplace cache invalidates.

## Publish

```bash
npm run plugins:publish
```

Writes:

- `plugins/penopta/` — installable plugin (`.codex-plugin/plugin.json`, `.app.json`, `.mcp.json`, skill)
- `.agents/plugins/marketplace.json` — repo marketplace entry

### Register the marketplace (once per machine)

Publish only writes files. ChatGPT/Codex won’t list them until the repo marketplace is registered:

```bash
npm run plugins:add
```

That runs `codex plugin marketplace add .`. You don’t need it again unless you move the repo or remove the marketplace entry.

Then restart ChatGPT desktop (Work or Codex) → **Plugins** → **Personal** → Penopta → install/update.

This does **not** submit to OpenAI’s public Plugins directory. That is still the [plugin submission portal](https://developers.openai.com/plugins/deploy/submission).

For Claude Connectors + Claude Code/Cowork plugins, see [`plugins/claude/README.md`](../claude/README.md).

## ChatGPT App Id

From Settings → Plugins → Penopta (dev mode), copy **App Id** (`asdk_app_…`) into `config.json` → `chatgptAppId`. The URL form `plugin_asdk_app_…` is also accepted; the publish script normalizes it.
