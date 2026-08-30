# Contributing

Thanks for your interest in Penopta.

## Before you start

- Read [`README.md`](README.md) for local setup.
- Read [`docs/architecture.md`](docs/architecture.md) for schema, auth, and env conventions.
- Agent/automation contributors: see [`AGENTS.md`](AGENTS.md).

## Development setup

```bash
npm install
cp .env.example .env.local   # fill in auth + database values
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev -- -p 3200
```

Local Postgres runs in Docker on port **5434**. Do not point daily dev at production Neon.

## Pull requests

1. Branch from `main`.
2. Keep changes focused — one logical change per PR when possible.
3. Run `npm run lint` before opening.
4. Do not commit secrets (`.env.local`, production env files, user maps).
5. Describe what changed and why in the PR body.

## Related repositories

| Repo | Purpose |
| --- | --- |
| [sshadmand/penopta-claude-plugin](https://github.com/sshadmand/penopta-claude-plugin) | Claude plugin directory mirror |
| [sshadmand/penopta-linux-sync](https://github.com/sshadmand/penopta-linux-sync) | Linux host sync CLI |

The macOS installer is not a git file. Publish from the private Penopta Sync
repo (`bash scripts/publish.sh`), then commit `public/downloads/Penopta-Sync.json`
here and deploy. Do not commit `*.dmg`.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
