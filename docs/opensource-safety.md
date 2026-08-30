# Open-source and production safety

This repository is **public**. Production (`app.penopta.com` on Vercel) deploys
from it. Treat every committed file as world-readable and every deployed route
as attacker-reachable.

This policy is **mandatory** for humans and agents. If a change would violate
it, stop. Do not work around it with “temporary,” “local-only,” “example,” or
“the user asked for a prototype” unless they explicitly accept the production
risk in this conversation.

Related: [`AGENTS.md`](../AGENTS.md), [`SECURITY.md`](../SECURITY.md),
[`.cursor/rules/opensource-safety.mdc`](../.cursor/rules/opensource-safety.mdc).

## What “at risk” means

A change puts the **repo** at risk when git would contain secrets, private
maintainer notes, real user data, internal hostnames, or enough detail to
impersonate us.

A change puts the **site** at risk when an unauthenticated or weakly
authenticated client could read or write production data, skip org checks, call
cron/admin jobs, or reach a debug backdoor.

## Hard rules

### 1. Secrets never enter git

Do not commit, paste into docs, or hardcode:

- `.env.local`, `.env.production`, and any other `.env*` except `.env.example`
- API keys, OAuth client secrets, `BETTER_AUTH_SECRET`, `CRON_SECRET`,
  `DATABASE_URL` (other than the local Docker example), Neon connection
  strings, ACS keys, Sentry auth tokens, LLM provider keys
- User maps, reviewer passwords, emails of real people, session cookies,
  `pat_` / `pk_` / `hst_` tokens
- `scripts/.prod-user-map.json`

`.env.example` may list **names** and local Docker placeholders only. Values
must be empty or obviously fake (`change-me-…`, `postgres://penopta:penopta@localhost:5434/penopta`).

Do not add a fallback secret in code:

```ts
// Forbidden
const secret = process.env.CRON_SECRET || "dev-cron-secret";

// Required: fail closed
const secret = process.env.CRON_SECRET?.trim();
if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 500 });
```

New env vars: add an empty/commented name to `.env.example`, tell the human to
set it in Vercel **Production** (and locally). Never bake the production value
into source.

### 2. Private maintainer files stay local

Unpublished plans, hosted-site checklists, and directory-submission notes live
only in `docs/private/` (gitignored except `docs/private/README.md`).

- Do not create `docs/plans/`, `tmp/`, or other public stand-ins for that
  folder.
- Do not commit files from `docs/private/`.
- Do not cite `docs/private/…` paths in public docs, comments, commit messages,
  UI copy, or `console.log`.
- Do not copy private-plan content into `docs/` or `AGENTS.md`.

Durable public docs: `docs/*.md` (currently `architecture.md` and this file).

### 3. Do not weaken production auth or tenancy

Keep these invariants unless the user explicitly redesigns them and accepts
the public-repo impact:

- The product is **login-required**. No logged-out product UI, no public
  project list, no unauthenticated read of projects/threads/chat/stats.
- Org-owned reads stay scoped to the **active org**. Do not scope those reads
  by `owner_user_id` alone.
- Cron routes stay Bearer `CRON_SECRET` and **fail closed** if it is missing.
- `db:wipe` must keep its localhost / non-Neon guards. Never add a prod wipe.
- Provider LLM keys stay on the server (`org_llm_credential`). Never
  `NEXT_PUBLIC_` for secrets.
- Do not add email/password signup for arbitrary users.
- `APP_REVIEW_DEMO_PASSWORD` never goes in Vercel env or git. Only the reviewer
  email may be deployed.

Do not add:

- Debug, admin, or “dump env / dump user / dump DB” routes
- Auth bypasses (`?admin=1`, hardcoded emails, shared master tokens)
- Preview/stage wiring that uses the **Production** Neon database or
  production OAuth secrets
- `ignoreBuildErrors` / similar flags to ship known-broken security code

### 4. Do not leak the hosted site through git or GitHub metadata

A public GitHub **Deployments** tab publishes Vercel URLs, including the team
slug (for example `*.vercel.app` hosts under the Vercel team). Do not:

- Put those URLs, the Vercel team slug, Neon hostnames, or internal dashboard
  links in the repo
- Commit `.vercel/`
- Add GitHub Actions or app code whose purpose is to create GitHub deployment
  records
- Log or return Vercel / Neon internals in API error bodies

Production’s public origin is `https://app.penopta.com`. Use that in docs and
user-facing copy. Self-host docs may say “your `APP_URL`.”

GitHub **Releases** may hold the Mac DMG (not a git file). Commit only
`public/downloads/Penopta-Sync.json`. Do not commit `*.dmg` / `*.zip`
installers.

### 5. Logs, errors, and fixtures stay boring

Do not log Authorization headers, cookies, env objects, connection strings, or
raw tokens. Client error toasts and JSON error bodies stay generic
(`Unauthorized.`, `Not configured.`) — no stack traces, SQL, or secret names
with values.

Do not commit real thread transcripts, production screenshots of customer
data, or seed rows copied from Neon.

### 6. Client bundles stay free of server secrets

Anything under `src/app` that is a Client Component, plus
`NEXT_PUBLIC_*`, ships to the browser.

- Server-only: `DATABASE_URL`, auth secrets, cron secret, provider keys,
  ACS, encryption keys
- Allowed public: `NEXT_PUBLIC_APP_VERSION`, public `APP_URL` when it is the
  site origin

If unsure, keep the value on the server.

## Checklist before adding or editing a file

Stop and redo the change if any answer is yes:

1. Would this file be committed, and does it contain a real secret, private
   plan, or production hostname that is not `app.penopta.com`?
2. Could someone hit this route **without** a session / bearer key / cron
   secret and read or write tenant data?
3. Did I skip or widen org checks, cron auth, or `db:wipe` guards?
4. Did I add a `NEXT_PUBLIC_` or client-side import for a server secret?
5. Did I mention `docs/private/`, Vercel team URLs, or Neon hosts in a
   tracked file?

## If you already almost leaked something

1. Do not commit. Unstage the file.
2. If it was committed, tell the human immediately. Rotating the secret
   matters more than rewriting history.
3. Do not force-push `main` unless they explicitly ask.

Report product vulnerabilities to **security@penopta.com** — see
[`SECURITY.md`](../SECURITY.md). Do not open a public issue that includes
secrets or a working exploit against production.
