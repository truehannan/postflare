# Development

## Prerequisites

- Node 20+ (developed on 22)
- npm
- A Cloudflare account (for deployment; local dev works without one for D1/R2/Queues)

## Install & run

```bash
npm install
cp .env.example .dev.vars
# set ENCRYPTION_KEY in .dev.vars
npm run db:migrate:local     # apply D1 migrations to local SQLite
npm run build:ui             # build the React app to dist/
npx wrangler dev             # Worker + static assets on :8787
```

For frontend hot-reload against the running Worker:

```bash
npm run dev:ui               # Vite dev server on :5173, proxies /api → :8787
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | build UI + start `wrangler dev` |
| `npm run dev:ui` | Vite HMR dev server |
| `npm run build` | typecheck + `vite build` |
| `npm run typecheck` | Worker + frontend `tsc --noEmit` |
| `npm run test` | vitest unit tests |
| `npm run bootstrap` | create D1/R2 + apply remote migrations |
| `npm run deploy` | build + `wrangler deploy` |
| `npm run db:migrate:local` | apply migrations to local D1 |

## Local bindings

Wrangler provides local, persistent emulation for D1 (SQLite) and R2 (files on
disk) automatically. Queues and Durable Objects run locally. The only value you
must supply for local development is `ENCRYPTION_KEY` in `.dev.vars`.

## Environment

- `.env.example` — documentation-only template (no secrets).
- `.dev.vars` — local secrets, gitignored.
- `ENCRYPTION_KEY` — see [security.md](security.md).
- `PUBLIC_BASE_URL` (var in `wrangler.jsonc`) — public origin used to build
  absolute media URLs for providers that ingest media by URL (Instagram,
  Facebook). Leave empty for text-only publishing during local development;
  set it to `https://<your-worker>.workers.dev` (or your custom domain) to
  publish media.

## Adding a platform adapter

1. Add the platform to `shared/capabilities.ts` (name, icon, capability matrix,
   credential fields, optional OAuth config).
2. Implement the optional `SocialPlatformAdapter` methods in
   `worker/adapters/<platform>.ts`.
3. Register it in `worker/adapters/registry.ts`.

Unimplemented methods are surfaced honestly — a missing `publishPost` means the
platform does not support publishing, and the UI reflects the capability
matrix rather than showing a fake button.

## Database migrations

Migrations live in `db/migrations/` and are applied with:

```bash
npm run db:migrate:local       # local
npm run db:migrate:remote      # production
```

Add a new `NNNN_description.sql` file for schema changes; never edit an applied
migration.