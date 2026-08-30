# Claude / Cowork plugin

Local packaging for the Penopta Claude Code + Cowork plugin (remote MCP + skills).

Points at the **same** MCP URL as the Claude Connectors Directory listing:
`https://app.penopta.com/api/mcp`.

## Source of truth

| File | Role |
| --- | --- |
| `config.json` | Plugin metadata, MCP URL, skill list (edit this) |
| `src/lib/integrations/query-skill.md` | Live-chat read/search skill (`penopta-context`) |
| `src/lib/integrations/sync-skill/*` | Hourly sync skill body (shared + Claude overlay) |
| `src/lib/integrations/skill-version.ts` | `SYNC_SKILL_VERSION` — bump when sync instructions change |

Do **not** hand-edit `plugins/claude/penopta/` — it is regenerated.

Bump `pluginVersion` in `config.json` whenever you publish skill or MCP packaging changes.

## Publish

```bash
npm run plugins:publish:claude
```

Writes:

- `plugins/claude/penopta/` — installable plugin (`.claude-plugin/plugin.json`, `.mcp.json`, skills)
- `.claude-plugin/marketplace.json` — repo marketplace entry (local)

### Sync to the public GitHub mirror

```bash
npm run plugins:sync:claude           # regenerate + copy to ../penopta-claude-plugin
npm run plugins:sync:claude -- --push # also commit + push
```

Public repo: https://github.com/sshadmand/penopta-claude-plugin

### Try locally

```bash
claude plugin marketplace add .
claude plugin install penopta@penopta-claude
```

### Public directory

Submit the **public** repo URL (plugin at repo root — leave path blank) at
https://platform.claude.com/plugins/submit.
