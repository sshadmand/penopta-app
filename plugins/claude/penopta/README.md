# Penopta (Claude plugin)

Skills + remote MCP for Claude Code and Cowork.

- **MCP:** `https://app.penopta.com/api/mcp` (same as the Claude Connectors Directory connector)
- **Docs:** https://www.penopta.com/docs/claude-connector
- **Privacy:** https://penopta.com/privacy

## Install (local / marketplace)

From a checkout of this repo after `npm run plugins:publish:claude`:

```bash
claude plugin marketplace add .
claude plugin install penopta@penopta-claude
```

Or load once: `claude --plugin-dir plugins/claude/penopta`.

## Public directory

Plugin Directory submission needs a **public** GitHub URL to this plugin folder
(or a public mirror of it). Submit at https://platform.claude.com/plugins/submit.

Regenerate with `npm run plugins:publish:claude` — do not hand-edit `skills/`.
