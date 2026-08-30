# Sync skill sources

Edit these markdown files — do not paste them raw into schedules.

| File | Role |
| --- | --- |
| `shared.md` | Common skill body (`{{provider_*}}` markers) |
| `chatgpt.md` | ChatGPT preamble + discovery |
| `claude.md` | Claude preamble + discovery |

`composeSyncSkill(provider)` in `../skill.ts` resolves a provider-specific skill for the Integrations paste UI and `/api/v1/sync-skill.md?provider=…`.

For ChatGPT/Codex plugin packaging, run `npm run plugins:publish` — it writes both the query skill (`query-skill.md` → `penopta-context`) and the composed ChatGPT hourly sync skill into `plugins/penopta/` (see `plugins/openai/README.md`).

Bump `SYNC_SKILL_VERSION` in `../skill-version.ts` when shared or either overlay changes in a way that matters.
