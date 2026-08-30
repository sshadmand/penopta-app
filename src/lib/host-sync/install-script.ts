import { getPublicAppUrl } from "@/lib/integrations/providers";

/** GitHub repo that publishes `penopta-sync-linux-{x64,arm64}` release assets. */
export function linuxSyncGithubRepo(): string {
  return (
    process.env.PENOPTA_LINUX_SYNC_REPO?.trim() ||
    "sshadmand/penopta-linux-sync"
  );
}

/**
 * Install / update script served at `/install-sync.sh`.
 * Re-running is the same as `penopta-sync update`: new binary, keep config + timer.
 */
export function linuxInstallScript(): string {
  const repo = linuxSyncGithubRepo();
  const appUrl = getPublicAppUrl();
  return [
    "#!/bin/sh",
    "set -eu",
    `REPO=${JSON.stringify(repo)}`,
    `APP_URL=${JSON.stringify(appUrl)}`,
    'BIN_NAME="penopta-sync"',
    'INSTALL_DIR="${PENOPTA_SYNC_BIN_DIR:-$HOME/.local/bin}"',
    'DEST="$INSTALL_DIR/$BIN_NAME"',
    'CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/penopta/sync.json"',
    "",
    'arch=$(uname -m)',
    'case "$arch" in',
    '  x86_64|amd64) asset="penopta-sync-linux-x64" ;;',
    '  aarch64|arm64) asset="penopta-sync-linux-arm64" ;;',
    "  *)",
    '    echo "Unsupported architecture: $arch (need x86_64 or arm64)" >&2',
    "    exit 1",
    "    ;;",
    "esac",
    "",
    'os=$(uname -s)',
    'if [ "$os" != "Linux" ]; then',
    '  echo "This installer is for Linux. On macOS use Penopta Sync from $APP_URL/settings/integrations/macos" >&2',
    "  exit 1",
    "fi",
    "",
    'url="https://github.com/$REPO/releases/latest/download/$asset"',
    "tmp=$(mktemp)",
    `trap 'rm -f "$tmp"' EXIT`,
    "",
    'echo "Downloading $url"',
    "if command -v curl >/dev/null 2>&1; then",
    '  curl -fsSL -o "$tmp" "$url"',
    "elif command -v wget >/dev/null 2>&1; then",
    '  wget -q -O "$tmp" "$url"',
    "else",
    '  echo "Need curl or wget to download penopta-sync." >&2',
    "  exit 1",
    "fi",
    "",
    'mkdir -p "$INSTALL_DIR"',
    'chmod +x "$tmp"',
    'mv "$tmp" "$DEST"',
    "trap - EXIT",
    "",
    "had_config=0",
    'if [ -f "$CONFIG" ]; then',
    "  had_config=1",
    "fi",
    "",
    'version="unknown"',
    'if "$DEST" version >/dev/null 2>&1; then',
    `  version=$("$DEST" version 2>/dev/null || echo unknown)`,
    "fi",
    "",
    'case ":$PATH:" in',
    '  *":$INSTALL_DIR:"*) ;;',
    "  *)",
    '    echo "Add $INSTALL_DIR to PATH (for example: export PATH=\\"$INSTALL_DIR:\\$PATH\\")"',
    "    ;;",
    "esac",
    "",
    'if [ "$had_config" -eq 1 ]; then',
    '  echo "Updated penopta-sync ($version). Token, config, and timer were left alone."',
    "else",
    '  echo "Installed penopta-sync ($version) to $DEST"',
    '  echo "Next: run  penopta-sync login"',
    "fi",
    "",
  ].join("\n");
}
