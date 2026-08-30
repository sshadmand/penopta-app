# Architecture

Penopta is a Next.js App Router app. Auth is **Better Auth** (Google + GitHub + Passkey).
App data lives in Postgres via Drizzle.

Local Docker / prod Neon split and Drizzle driver selection stay the same as before.

## Schema

Organizations are the ownership layer. Membership references Better Auth user
ids. Every user gets an auto-created **personal** org, and acts in exactly one
**active** org at a time. All owned rows carry `org_id`; `owner_user_id` stays
for attribution.

```
organization
────────────
id (uuid)
slug (unique)
name
created_by_user_id (auth user id)
is_personal (bool)   # auto-created single-member org
daily_summary_enabled (bool, default true)
weekly_digest_enabled (bool, default true)   # Monday email to teammates
weekly_digest_last_week_key (text, nullable) # ISO week last emailed
created_at / updated_at

organization_membership
───────────────────────
id (uuid)
org_id → organization.id (cascade)
user_id (auth user id)
role: owner | member
unique (org_id, user_id)

user_active_org
───────────────
user_id (auth user id, PK)   # one active org at a time
org_id → organization.id (cascade)
updated_at

project
───────
id (uuid, URL id)
slug (unique)
name
summary
org_id (→ organization.id)
owner_user_id (auth user id)
visibility: public | private
created_at
updated_at

user_api_key
───────────
id (uuid)
org_id (→ organization.id)   # key syncs into this org
owner_user_id (auth user id)
key (unique opaque secret)
expires_at
created_at

host_sync_token
───────────────
id (uuid)
org_id / owner_user_id
key_hash (SHA-256 of `hst_…` secret)
key_prefix (UI, never the full secret)
hostname, label
expires_at (90 days)
last_used_at / revoked_at / created_at
Many per user (one per Linux box). Agent-sync only — not MCP.

host_sync_device_login
──────────────────────
Pending device-code or website claim. user_code, hashed device_code,
optional token_id to rotate, status pending|approved|consumed, 10-minute TTL.

agent_sync_run
──────────────
id (uuid)
org_id (→ organization.id)
owner_user_id (auth user id)
schema_version, agent_id, run_id
window_start / window_end
agent_name / agent_model / agent_effort
capture_coverage (jsonb), run_summary (jsonb)
created_at
unique (owner_user_id, run_id)

agent_thread
────────────
id (uuid)
org_id (→ organization.id)
owner_user_id + thread_id (unique, stable agent id)
title, kind, status, project_context
source_activity / working_state (jsonb)
last_agent_* facets + last_run_id / last_synced_at

agent_thread_snapshot
─────────────────────
per-run copy of a thread (history), FK → agent_sync_run
identical transcripts are not re-snapshotted

org_activity_thread
───────────────────
one analytics rollup per org + thread_id
slices / plan_slices (jsonb UTC hour buckets)
source_fingerprint (recompute when transcript, agent, project, or snapshots change)

rate_limit_bucket
─────────────────
key (text PK, `{bucket}:{ip}`)
window_started_at / hit_count
Fixed-window counters for device-code, OAuth register/token, MCP, agent-sync,
and Mac handoff exchange. Cron routes are Bearer `CRON_SECRET` instead.
Better Auth also rate-limits `/api/auth/*` (100 requests / 60s per IP).
```

Defined in `src/lib/db/schema.ts`. Queried via `src/lib/projects/data.ts` and
`src/lib/keys/data.ts`. Ingest via `src/lib/ingest/`.

One active (non-expired) key per user **per org** — the key is minted for the
active org and syncs agent data into it. Users can **re-mint** (invalidate + new
key) or **invalidate** anytime. Mint appends `key=…` to the Skillbase skill URL
on the integrations setup pages. External apps resolve the owner + org with
`resolveOwnerByApiKey` (expired/invalidated keys do not match).

Linux boxes use a separate **host token** (`hst_…`, 90-day TTL, many per user)
minted via device-code login. Do not reuse `pk_` skill keys on a VPS — remint
would break skills, and a pasteable skill secret is the wrong shape for a
long-lived machine credential.

### Agent sync ingest

`POST /api/v1/agent-sync` accepts windowed thread-context payloads from external
agents. Auth is `Authorization: Bearer` (`pat_…` OAuth, `pk_…` API key, or
`hst_…` host token) or a Better Auth session cookie (Mac app). Optional
`penopta_user_id` must match the resolved owner when present. Each `runId` is
ingested once (duplicate → 200). Threads are upserted for current-state reads;
snapshots keep per-run history for facets like agent/model over time.

Expired host tokens return 401 `{ error: "host_token_expired", refresh_url }`
pointing at `/settings/integrations/linux`.

Producers stamp `agent_id`: `penopta-sync-macos` (Mac app), `penopta-sync-linux`
(Linux CLI), `hourly-thread-context-sync` (skill). Catalog `source` follows
first writer: `penopta_sync` / `penopta_sync_linux` / `skill`.

MCP tools on `/api/mcp` share that ingest path: `sync_threads` for hourly
windowed sync of tracked projects, `penopta_sync_now` to force-start that same
flow in live chat (returns checkpoint window + instructions; the agent still
delivers via `sync_threads`), and `penopta_track_thread` for an on-demand
single-thread push (live “track this chat,” including standalone threads).

### Reads

- All project routes require a session. Logged-out users are sent to sign-in.
- Reads are scoped to the viewer's **active org**. Within that org a project is
  visible if `visibility = 'public'` **or** `owner_user_id = viewer`.
- Home sidebar agent threads are **owner-scoped** (the current user's,
  including threads they synced in another org). Source projects in
  create/add pickers are also owner-scoped (registered by the user, or
  matching one of their thread contexts in the active org). Once linked into
  a workgroup, any org member who can see that workgroup sees the mixed
  set.
- URL param `/projects/[id]` accepts the project UUID (or slug).

## Hosting split

| Env        | DB                        | Config                        |
| ---------- | ------------------------- | ----------------------------- |
| Local      | Docker Postgres (`5434`)  | `.env.local` → `DATABASE_URL` |
| Production | Neon (Vercel Marketplace) | Vercel Production env only    |

No Preview/stage Neon branch for this phase. Local never uses Neon for day-to-day
dev. The Neon integration injects many aliases; only `DATABASE_URL` is required.
Do not wire Vercel Preview to Production `DATABASE_URL` or production OAuth
secrets. This repo is public — [`docs/opensource-safety.md`](opensource-safety.md)
is mandatory.

`src/lib/db/client.ts` picks the driver: `*.neon.tech` → Neon HTTP; otherwise
`node-postgres` for Docker TCP.

### Common commands

```bash
npm run db:up        # docker compose up -d
npm run db:migrate   # apply drizzle migrations (loads .env.local)
npm run db:seed      # idempotent sample project
npm run db:wipe      # dry-run local data wipe (add -- --yes to apply)
npm run db:generate  # after schema edits
```

Production migrate/seed: run once against the Neon `DATABASE_URL` (e.g. from the
dashboard or a one-off local env that points at Neon). Do not bake that into
`.env.local`.

## Auth (Better Auth)

1. `/` shows Google + GitHub + Passkey when logged out.
2. Better Auth handler at `/api/auth/[...all]` (OAuth callback, passkey, session).
3. `getSession()` reads the Better Auth session cookie on the server.
4. Sign-out via `/api/auth/logout`.
5. Passkeys: register after sign-in (workspace header); sign in with passkey on `/`.

OAuth redirect / callback URIs:

- Google: `{APP_URL}/api/auth/callback/google`
- GitHub: `{APP_URL}/api/auth/callback/github`

Use **separate** Google and GitHub OAuth apps for local (`http://localhost:3200/...`)
and production. Do not put localhost redirects on the production client.
`BETTER_AUTH_URL` is optional and only needed if auth must use a different origin
than `APP_URL`.

## Workgroup map

```
src/
  app/
    api/auth/[...all]/route.ts
    api/auth/logout/route.ts
    api/cron/daily-project-summaries/route.ts
    api/cron/weekly-org-digest/route.ts
    api/v1/agent-sync/route.ts     # Bearer-key agent thread ingest
    api/v1/host-sync/device/       # Linux device-code login + poll
    api/install-sync/route.ts      # GET /install-sync.sh
    device/linux-sync/page.tsx     # Confirm Linux host (login-required)
    login/page.tsx                 # forwards auth errors to `/?error=`
    authenticating/page.tsx        # redirects to `/` sign-in
    page.tsx                       # sign-in (logged out) / workspace (logged in)
    integrations/page.tsx          # connect agents (auth required)
    projects/[id]/page.tsx         # workgroup detail (auth required)
  lib/
    auth/                          # Better Auth config, session, local user directory
    db/                            # client, schema (app + auth tables), seed
    keys/                          # user API key mint / resolve
    ingest/                        # agent-sync validate + persist
    projects/data.ts               # visibility-aware reads
docker-compose.yml                 # local Postgres
drizzle/                           # SQL migrations
docs/architecture.md
docs/opensource-safety.md          # public-repo / production safety (mandatory)
```
