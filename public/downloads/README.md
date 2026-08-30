# Keep folder; version manifest is not committed.

- `GET /downloads/Penopta-Sync.json` — `{ version, build, contentMd5, downloadUrl, notes, publishedAt }` for the website download button and the Mac updater
- The DMG and JSON live on GitHub Releases (versioned `macos-sync-<version>.<build>` plus a floating `macos-sync` current pointer). This app fetches the floating JSON so installed Mac apps can keep hitting this origin.

Publish from the private Mac app repo (`bash scripts/publish.sh`). No git commit or Vercel deploy is needed for a version bump. Anonymous download only works while this website repo is public.
