<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Penopta — agent notes

Deeper rationale: [`docs/architecture.md`](docs/architecture.md). Human how-to: [`README.md`](README.md).
Durable docs stay in [`docs/`](docs/). Unpublished plans and hosted-site notes
go in `docs/private/` (local only). Do not commit that folder or cite it in
public docs, comments, or commits.

## Public repo (mandatory)

This repository is **public** and production deploys from it. Follow
[`docs/opensource-safety.md`](docs/opensource-safety.md) on every change.
Cursor also loads [`.cursor/rules/opensource-safety.mdc`](.cursor/rules/opensource-safety.mdc).

Do not add files or code that would leak secrets, private maintainer notes,
Vercel/Neon internals, or a way to skip auth / org checks on the live site.
If a request needs that, stop and say so. Do not “prototype” around it.

## Non-negotiable decisions

### Auth

- Penopta owns identity via **Better Auth** (Google, GitHub, Passkey).
- Providers: **Google**, **GitHub**, and **Passkey** now; Apple can be added later.
- The app is **login-required**. There is no logged-out product UI and no public project list.
- `/` is the sign-in page when logged out (Google + GitHub + Passkey). After sign-in it is the workspace.
- Mac app sign-in uses a Safari sheet (`ASWebAuthenticationSession`) at
  `/auth/macos-handoff?src=macos`, then `POST /api/auth/macos/exchange` to
  copy a session cookie into WKWebView. Do not send website users through
  those routes; `/` Google / GitHub / Passkey stays as-is.
- Sign-in CTAs for protected routes use `loginStartHref(returnTo)` → `/?returnTo=…`.
  `/authenticating` only forwards to that. `/login` only forwards auth errors onto `/?error=…`.
- Session user id comes from Better Auth (`session.user.id`). Use that string as `owner_user_id`.

### Data model

- Plain Postgres + Drizzle. Auth users live in Better Auth tables (`user`, `session`,
  `account`, `verification`, `passkey`). Orgs and app data reference those user ids.
- **Organizations are the ownership layer.** `organization` + `organization_membership` (role `owner`|`member`) are local tables keyed by auth user ids. Every user gets an auto-created **personal** org; they can belong to many orgs but act in exactly one **active** org at a time (`user_active_org`). Resolve it with `resolveActiveOrg(userId)` (guarantees a personal org, validates/falls back). Never scope reads by `owner_user_id` alone — scope by the active org.
- Every owned row carries `org_id` (`project`, `user_api_key`, `host_sync_token`, `agent_sync_run`, `agent_thread`, `agent_thread_snapshot`). `owner_user_id` remains for attribution. Never scope **org-owned** reads by `owner_user_id` alone — scope by the active org. A member's own threads/catalog for home and add/create pickers are owner-scoped across orgs so joining a team does not hide work they already synced.
- `project` is the starter owned entity (`public` | `private`). Reads require a session and are scoped to the active org; within an org a project is visible when `public` or `owner_user_id = viewer`.
- `user_api_key`: one active opaque key per user **per org** (30-day TTL), minted for the active org. Re-mint (rotate) or invalidate anytime. Appended to the skill URL as `key=…`; `resolveOwnerByApiKey` returns `{ ownerUserId, orgId }`. Expired/invalidated keys fail lookup.
- `host_sync_token`: many `hst_…` machine credentials per user (one per Linux box, 90-day TTL). Minted via device-code / claim login. `resolveOwnerFromBearer` tries `pat_…`, then `pk_…`, then `hst_…`. Host tokens are agent-sync only — MCP still accepts OAuth + `pk_` only.
- **Org LLM BYOK** (`org_llm_credential`): encrypted Anthropic/OpenAI keys scoped to the org. Owners manage keys under Integrations → AI models. Server helpers (`resolveLlmForOrg`, `answerProjectChat`, `summarizeProjectThreads`, `captureProjectContinueWork`) call providers directly with the org key — usable from UI (project chat, `/summary 24h`, `/continue`) or background jobs. Never put provider keys in the client.
- **Project chat**: free-form questions use a slim brief (latest continue-work post + per-thread `workingState` + recent chat turns) and optionally retrieve a few matching thread activity excerpts. `/summary [window]` dumps timestamped turns in that window. Both omit **lead-up** (assistant play-by-play before the last reply in a run). `/continue [source project]` captures unfinished human objectives and a next prompt per source project. All post as `project_chat_message` on the timeline. MCP `penopta_get_project_context` includes the latest `/continue` brief when one exists.
- **Project AI trust boundary**: chat/summary/continue have no tools — they only see data the server loads for the visible project in the active org (`listProjectThreads(projectId, orgId)`, org-scoped chat rows). Prompt guardrails tell the model to refuse “other project / other workspace” asks and to treat transcripts as untrusted data.
- **Daily project summaries**: Vercel Cron hits `/api/cron/daily-project-summaries` (Bearer `CRON_SECRET`). For each org with `daily_summary_enabled` (default on) and an LLM key, posts a 24h summary as an assistant `project_chat_message` on each active project's timeline. Toggle under Integrations → AI models.
- **Weekly team email snapshot**: Vercel Cron hits `/api/cron/weekly-org-digest` Mondays at 14:00 UTC (Bearer `CRON_SECRET`). For each **team** org with `weekly_digest_enabled` (default off), an LLM key, and ACS email configured, emails every member a **rollup of that week's daily timeline summaries** (not a fresh pass over threads). Shared (`public`) projects go to everyone; a member's own `private` projects go only to them. Personal orgs are skipped. Toggle and “send now” live under Integrations → AI models.
- Agent ingest: `POST /api/v1/agent-sync`. Auth is a Bearer token (`pat_…`
  OAuth, same as MCP, `pk_…` API key, or `hst_…` host token) **or** the Better
  Auth session cookie (Mac app window — same login as the website). Identity +
  target org come from that credential; `penopta_user_id` in the body is optional
  and only checked for mismatch when present. Persists `agent_sync_run` + upserts
  `agent_thread` (+ snapshots), all stamped with the resolved `org_id`. OAuth and
  session cookies use the user's **active** org at request time; API keys use the
  org stamped at mint; host tokens use the org stamped at mint and are
  **agent-sync only** (not MCP). Expired `hst_` tokens return 401
  `{ error: "host_token_expired", refresh_url }` instead of a silent skip.
- Linux host sync (`penopta-sync-linux`) is a headless CLI. Device-code login
  (`POST /api/v1/host-sync/device`) + confirm at `/device/linux-sync`; tokens
  live in `host_sync_token` (90-day `hst_…`, many per user). Catalog source
  `penopta_sync_linux` / UI label “Linux sync”. Do not reuse
  `penopta-sync-macos`. Install: `curl -fsSL https://app.penopta.com/install-sync.sh | sh`.
- Mac app installer: package from the private Penopta Sync repo
  (`bash scripts/publish.sh`). The DMG and JSON are GitHub Release assets on
  **this** repo (`macos-sync-<version>.<build>` plus a floating `macos-sync`
  pointer). This app fetches that JSON and keeps serving
  `/downloads/Penopta-Sync.json`. Do not commit the DMG or JSON. Version bumps
  do not need a git push or Vercel deploy.
- Any org member can add/remove **their own** agent threads and source
  (provider) projects on a visible project in the active org. Other members'
  links are left alone. Home sidebar and add/create pickers only show the
  current user's threads/source projects (including ones they synced in
  another org, usually their personal space); mixed content appears inside a
  Penopta project after linking. Project rename / delete / visibility stay
  owner-only.
- MCP also exposes `penopta_track_thread` for on-demand single-thread pushes
  (live “track this chat”); it wraps the same ingest path. `penopta_sync_now`
  force-starts a full tracked-project sync in live chat (returns window +
  instructions; agent still delivers with `sync_threads`). Hourly skill
  delivery still uses `sync_threads` for tracked projects only.
  `penopta_get_stats` returns estimated token/effort stats for the connected
  user (or `person=all` for the org).

### Environments

- **Local:** Docker Postgres via `docker compose` (`localhost:5434`). Use `.env.local`. Do not point daily local work at Neon. `npm run db:wipe` truncates that local DB only (refuses Neon / non-localhost).
- **Production:** Neon via Vercel Marketplace. Only the **Production** env is wired for now — no Preview/stage DB.
- Neon creates many env aliases (`DATABASE_POSTGRES_*`, `DATABASE_PG*`, etc.). The app only reads **`DATABASE_URL`**. Ignore the rest.
- Driver is auto-selected from the URL in `src/lib/db/client.ts` (Neon host → neon-http; else `pg`). Override with `DB_DRIVER=pg|neon` only if needed.
- Do not dump Neon vars into `.env.local`. Only add Neon `DATABASE_URL` to a local production env file when deliberately migrating/seeding prod from a laptop.

### Stack defaults

- Drizzle ORM + `@neondatabase/serverless` (prod) + `pg` (local).
- Stay within Vercel Hobby + Neon free unless the user explicitly opts out.
- Drizzle + Postgres: local Docker via `docker compose`, Neon on Vercel in production.

### UI / styling

- Prefer Tailwind scale tokens over arbitrary values when creating components or adding styles.
  Use `text-xs` / `text-2xs` / `text-3xs` not `text-[11px]`, `gap-2` not `gap-[7px]`, theme
  colors (`text-muted`, `bg-surface`, `border-border`) not one-offs like `text-[#71717a]`.
  Custom type scale: `text-2xs` (10px) and `text-3xs` (8px) live in `src/app/globals.css`
  `@theme`. If a real new token is needed, extend `@theme` / `:root` there instead of
  scattering arbitrary classes.
- Clickable `button` / `a[href]` / `[role="button"]` already get `cursor-pointer` from
  `globals.css`; do not sprinkle `cursor-pointer` unless overriding a non-standard control.

### Dependencies

- Before writing new helpers/utilities, check `package.json` for an existing dependency that already covers the need.
- Prefer adding a well-maintained NPM package over a custom implementation when the problem is solved by a common library.
