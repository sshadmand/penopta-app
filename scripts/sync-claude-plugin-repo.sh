#!/usr/bin/env bash
# Regenerate the Claude plugin in penopta-app, then sync it into the public
# penopta-claude-plugin repo (plugin at repo root for Anthropic Plugin Directory).
#
# Usage (from penopta-app):
#   npm run plugins:sync:claude
#   npm run plugins:sync:claude -- --push
#
# Override destination:
#   PENOPTA_CLAUDE_PLUGIN_REPO=/path/to/penopta-claude-plugin npm run plugins:sync:claude

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_SRC="$ROOT/plugins/claude/penopta"
DEST="${PENOPTA_CLAUDE_PLUGIN_REPO:-}"
PUSH=0

if [[ -z "$DEST" ]]; then
  if [[ -d "$ROOT/../penopta-claude-plugin" ]]; then
    DEST="$(cd "$ROOT/../penopta-claude-plugin" && pwd)"
  else
    DEST="$ROOT/../penopta-claude-plugin"
  fi
fi

usage() {
  cat <<EOF
Usage:
  npm run plugins:sync:claude
  npm run plugins:sync:claude -- --push

Regenerates plugins/claude/penopta/ then copies it to:
  $DEST

--push   commit + push the public repo when there are changes

Override path: PENOPTA_CLAUDE_PLUGIN_REPO=/path/to/repo
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --push)
      PUSH=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$DEST/.git" ]]; then
  echo "Public plugin repo not found (expected a git checkout): $DEST" >&2
  echo "Clone it next to penopta-app, or set PENOPTA_CLAUDE_PLUGIN_REPO." >&2
  exit 1
fi

echo "→ Regenerating Claude plugin…"
(cd "$ROOT" && npm run plugins:publish:claude)

if [[ ! -f "$PLUGIN_SRC/.claude-plugin/plugin.json" ]]; then
  echo "Missing generated plugin at $PLUGIN_SRC" >&2
  exit 1
fi

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$PLUGIN_SRC/.claude-plugin/plugin.json")"
MCP_URL="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).mcpServers.penopta.url)" "$PLUGIN_SRC/.mcp.json")"

echo "→ Syncing v$VERSION → $DEST"
# Keep .git; replace everything else so deleted skills don't linger.
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  "$PLUGIN_SRC/" "$DEST/"

# Public README (submission + install). Overwrites the generated in-app README.
cat > "$DEST/README.md" <<EOF
# Penopta (Claude plugin)

Official Claude Code / Cowork plugin for [Penopta](https://penopta.com).

Bundles skills plus the remote Penopta MCP connector:

\`\`\`text
$MCP_URL
\`\`\`

Auth is **Sign in with Penopta** (OAuth). No API key.

## Docs

- Connector guide: https://www.penopta.com/docs/claude-connector
- Privacy: https://penopta.com/privacy
- Support: support@penopta.com

## Install

After this plugin is listed in Anthropic’s Plugin Directory, install it from Claude Code / Cowork Discover.

Load from a clone:

\`\`\`bash
claude --plugin-dir /path/to/penopta-claude-plugin
\`\`\`

Then approve the Penopta OAuth prompt and ask Claude to verify the connection
(e.g. run \`penopta_verify\`).

## Skills

| Skill | Purpose |
| --- | --- |
| \`penopta-context\` | Read/search projects and threads in live chat |
| \`penopta-hourly-sync\` | Hourly / on-demand bulk sync only |
| \`SETUP\` | Guide connecting the bundled MCP after install |

## Source of truth

This repository is a **public mirror** of the generated plugin. Edit and regenerate
from the private Penopta app:

\`\`\`bash
npm run plugins:publish:claude   # regenerate locally
npm run plugins:sync:claude      # copy here
npm run plugins:sync:claude -- --push
\`\`\`

Do not hand-edit skill bodies here; they will be overwritten on the next sync.

## Version

Plugin version: **$VERSION**
EOF

echo "→ Validating…"
if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$DEST"
else
  echo "  (claude CLI not found — skipped validate)"
fi

if [[ "$PUSH" -eq 1 ]]; then
  cd "$DEST"
  git add -A
  if git diff --cached --quiet; then
    echo "→ No changes to push (already up to date)."
  else
    git commit -m "$(cat <<EOF
Publish Penopta Claude plugin v${VERSION}.

Synced from penopta-app via npm run plugins:sync:claude.
EOF
)"
    git push -u origin HEAD
    echo "→ Pushed to origin."
  fi
else
  echo ""
  echo "Synced to $DEST (not pushed)."
  echo "Review, then: npm run plugins:sync:claude -- --push"
fi
