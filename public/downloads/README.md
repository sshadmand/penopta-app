# Keep folder; version manifest is updated by `bash scripts/publish.sh` in the
# private Mac app repo (Penopta Sync).

- `Penopta-Sync.json` — `{ version, build, contentMd5, downloadUrl, notes, publishedAt }` for the website download button and the Mac updater
- The DMG is **not** in this tree. Publish uploads it as a GitHub Release asset on this repo; `downloadUrl` points there.

After publish, commit this JSON and **deploy the web app** so the hosted manifest updates. Anonymous download only works once this website repo is public.
