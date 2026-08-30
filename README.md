# Penopta

A Vercel-ready Next.js (App Router) app. Authentication is **Better Auth**
(Google + GitHub + Passkey). Organizations and product data live in Postgres.

**Hosted:** [app.penopta.com](https://app.penopta.com) · **License:** [MIT](LICENSE)

See [`docs/architecture.md`](docs/architecture.md) for the schema and env split;
[`docs/opensource-safety.md`](docs/opensource-safety.md) for public-repo and
production safety (mandatory);
[`AGENTS.md`](AGENTS.md) for agent-facing rules;
[`CONTRIBUTING.md`](CONTRIBUTING.md) to run or patch the project locally.

## Related repos

| Repo | Purpose |
| --- | --- |
| [penopta-claude-plugin](https://github.com/sshadmand/penopta-claude-plugin) | Claude plugin (public mirror) |
| [penopta-linux-sync](https://github.com/sshadmand/penopta-linux-sync) | Linux host sync CLI |

The macOS app (Penopta Sync) lives in a private repo. Publish from there with
`bash scripts/publish.sh`: that uploads `Penopta-Sync.dmg` as a GitHub Release
asset **on this repo** and writes [`public/downloads/Penopta-Sync.json`](public/downloads/Penopta-Sync.json)
(`downloadUrl`). Commit the JSON and deploy so the site and the in-app updater
pick it up. Do not commit the DMG.

You can self-host this app or use the hosted product. Self-hosting requires your
own Postgres, OAuth apps, and env secrets — see `.env.example`.

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- Better Auth (Google / GitHub OAuth + Passkeys)
- Postgres + Drizzle ORM (`pg` locally, Neon serverless on Vercel)
- Deployable to Vercel with Neon for production data

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:up                # start local Postgres (Docker, port 5434)
npm run db:migrate
npm run db:seed
npm run dev -- -p 3200
```

Open http://localhost:3200 — you’ll see Google / GitHub / Passkey sign-in until you authenticate.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | Better Auth secret (`openssl rand -base64 32`). |
| `APP_URL` | yes (prod) | Public app origin, e.g. `http://localhost:3200`. Auth, links, and OAuth use this. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes (for Google) | Google OAuth web client. Redirect: `{APP_URL}/api/auth/callback/google`. Use a separate app for local vs production. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | yes (for GitHub) | GitHub OAuth App. Callback: `{APP_URL}/api/auth/callback/github`. Use a separate app for local vs production. |
| `DATABASE_URL` | yes | Postgres URL. Local Docker or Neon. |
| `BETTER_AUTH_URL` | no | Override auth origin only if it must differ from `APP_URL`. |
| `PASSKEY_RP_ID` | no | WebAuthn rpID (defaults to hostname of `APP_URL`). |
| `APP_REVIEW_DEMO_EMAIL` | no | Enables the one restricted email/password account used by App Store Review. Email signup stays disabled. |
| `DB_DRIVER` | no | Force `pg` or `neon`. Normally inferred from the host. |

## How auth works

1. Sign-in UI on `/` calls Better Auth (`/api/auth/*`) for Google/GitHub OAuth or Passkey.
2. Sessions are Better Auth cookies; `getSession()` reads them on the server.
3. After sign-in, use **Add a passkey** in the workspace header to register a passkey
   for next time.
4. `GET|POST /api/auth/logout` signs out and returns to `/`.

Apple can be wired later via Better Auth `socialProviders`.

### Mac App Store reviewer sign-in

The Mac app normally offers Google, GitHub, and passkey sign-in. Holding Option
while clicking **Sign in to Penopta** adds the private App Review handoff switch;
only that flow displays email/password fields. Better Auth rejects email sign-in
for every address except `APP_REVIEW_DEMO_EMAIL`, and public email signup is
disabled.

Create or rotate the production reviewer account with:

```bash
npm run app-review:provision:prod
```

Set `APP_REVIEW_DEMO_EMAIL` and `APP_REVIEW_DEMO_PASSWORD` in the local,
gitignored `.env.production` before running it. Only
`APP_REVIEW_DEMO_EMAIL` belongs in the deployed Vercel environment; the password
is stored as a Better Auth hash in Postgres. Keep the credentials stable and
include the Option-click instruction in App Store Connect review notes.

## Project structure

```
src/
  app/
    api/auth/[...all]/route.ts     # Better Auth handler
    api/auth/logout/route.ts       # sign-out convenience
    page.tsx                       # sign-in / logged-in workspace
    integrations/page.tsx
    projects/[id]/page.tsx
  components/                      # SignInCard, WorkspaceEmpty, …
  lib/auth/                        # Better Auth server + client + session
  lib/db/                          # Drizzle client, schema (incl. auth tables), seed
docker-compose.yml
drizzle/
docs/architecture.md
```

## Data

Projects are Postgres rows (`project`). Reads in `src/lib/projects/data.ts`
return rows the signed-in viewer may see. Seed with `npm run db:seed`.
To re-test first-run with the same Google/GitHub account, wipe local data
(`npm run db:wipe -- --yes`) then sign in again. That script only targets
Docker Postgres on `localhost:5434` and will refuse Neon.
