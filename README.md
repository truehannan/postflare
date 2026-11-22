<p align="center">
  <img src="public/logo.svg" alt="Postflare" height="48" />
</p>

<h1 align="center">Postflare</h1>

<p align="center">
  One workspace for every social platform — publishing, scheduling, a unified inbox, and a visual ManyChat-style automation builder, all running on Cloudflare Workers.
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/truehannan/postflare">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

---

Postflare is a production-oriented social media management and conversational
automation platform. It is not a frontend prototype: the Cloudflare Worker is
the application backend, and every feature ships with a real database schema,
real API routes, and — where a platform's official API permits — a real
integration adapter.

## What's included

| Area | Status |
| --- | --- |
| **Composio hub** — every supported platform via one API key | ✅ |
| Quick automations attached per-post from the composer | ✅ |
| Data retention (cron-enforced purge policies) | ✅ |
| Auth (email + password, PBKDF2, session cookies) | ✅ |
| Workspaces, roles (RBAC), invitations, audit logs | ✅ |
| Dashboard-managed credentials, AES-256-GCM encrypted | ✅ |
| OAuth 2.0 + PKCE state machine (single-use, expiring) | ✅ |
| Platform adapter registry + capability matrix (28 platforms) | ✅ |
| Publishing (composer, drafts, scheduling, queue, retries) | ✅ |
| Calendar (month view) | ✅ |
| Media library (R2) | ✅ |
| Unified inbox (conversations, replies, notes, quick replies) | ✅ |
| Contacts CRM (tags, custom fields, CSV import/export) | ✅ |
| Visual automation builder (React Flow) + execution engine | ✅ |
| Automation templates & delayed resume (cron) | ✅ |
| Analytics (native metrics only, honest about gaps) | ✅ |
| Campaigns, approvals, notifications | ✅ |
| Real end-to-end adapters | Bluesky, Mastodon, Telegram, WordPress, webhook, X, Facebook, LinkedIn, Instagram |

See [docs/platforms.md](docs/platforms.md) for the exact capability status of
every platform and which publishing paths are fully implemented.

## Architecture

```
Postflare (Cloudflare Workers Static Assets)
│
├── src/                    React + TypeScript + Vite + Tailwind v4 + Kumo
│   ├── components/         App shell, page headers, modals, status badges
│   ├── features/           dashboard, publishing, inbox, contacts,
│   │                       automations, analytics, campaigns, media,
│   │                       approvals, team, settings, integrations
│   └── lib/                API client, stores, platform icons
│
├── worker/                 Hono API (the backend)
│   ├── routes/             /api/* endpoints (Zod-validated)
│   ├── middleware/         auth, workspace scoping, rate limiting
│   ├── services/           auth, credentials, oauth, accounts, posts,
│   │                       publishing, scheduling, inbox, contacts,
│   │                       automation, analytics, campaigns, approvals…
│   ├── adapters/           per-platform adapters (capability-gated)
│   ├── queues/             publishing queue consumer
│   ├── durable-objects/    InboxHub (WebSocket realtime)
│   └── cron/               due-post + delay-resume scheduler
│
├── shared/                 types + platform capability matrix + node catalog
├── db/migrations/          D1 schema (SQLite)
└── tests/                  unit tests
```

**Cloudflare services used:** Workers (Static Assets), D1, R2, Queues, Durable
Objects, Cron Triggers. No external servers, databases, or queues.

## Quick start (local)

```bash
npm install
cp .env.example .dev.vars       # then set ENCRYPTION_KEY

# generate a key
openssl rand -base64 32

# start the full stack (Worker + static assets)
npm run build:ui
npx wrangler dev

# or run migrations locally first
npm run db:migrate:local
```

Open http://localhost:8787. The API is served under `/api/*`; the React SPA is
served by the Worker's static-assets binding.

For frontend HMR against a running Worker, use `npm run dev:ui` (Vite dev server
proxies `/api` to `:8787`).

## Deploying

Deployment runs through the **GitHub Actions workflow** in
`.github/workflows/deploy.yml` — that is the mechanism the Deploy button above
uses, and it is the recommended path for every push to `main`.

### One click (Deploy to Cloudflare button)

Clicking **Deploy to Cloudflare** imports this repository and, on its first
push, runs the workflow. Each run performs these steps in CI:

1. `npm ci` — install dependencies
2. `npm run bootstrap` — create or reuse the D1 database (writes its id into
   `wrangler.jsonc` when missing), create or reuse the R2 bucket, and apply any
   pending D1 migrations
3. `npm run build` — typecheck + build the React frontend
4. `wrangler deploy` via `cloudflare/wrangler-action` — deploy the Worker,
   static assets and bindings, and set the `ENCRYPTION_KEY` Worker secret

Because the workflow needs to provision Cloudflare resources, add these three
secrets under **Settings → Secrets and variables → Actions**:

| Secret | Required | Description |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | ✅ | Cloudflare API token with **Workers**, **D1** and **R2** edit scope |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Your Cloudflare account id |
| `ENCRYPTION_KEY` | ✅ | base64-encoded 32-byte key (`openssl rand -base64 32`) |

> `ENCRYPTION_KEY` must stay stable between deploys — if it changes, existing
> encrypted credentials become unreadable. Keep it in the repo secret and reuse
> the same value if you also deploy locally.

### Manual (CLI)

If you prefer to deploy from your machine instead of CI:

```bash
npm install
npm run bootstrap                      # creates D1 + R2, applies migrations
npx wrangler secret put ENCRYPTION_KEY # paste the output of: openssl rand -base64 32
npm run deploy
```

`npm run bootstrap` is idempotent — safe to re-run on every deploy. It detects an
existing D1 database (by name) and R2 bucket and reuses them, only creating what
is missing, and only applies migrations that have not run yet.

## Encryption & secrets

Postflare uses **one** manually configured secret: `ENCRYPTION_KEY`. Every
third-party platform credential (OAuth client ids/secrets, API keys, access
tokens, bot tokens) is entered through the dashboard and encrypted at rest with
**AES-256-GCM** (Web Crypto, unique 96-bit IV per operation, versioned
envelope). Credentials are never returned to the browser after submission and
never written to logs.

`ENCRYPTION_KEY` must be a **base64-encoded 256-bit (32-byte)** key:

```bash
openssl rand -base64 32
```

This prints 44 characters (a trailing `=` is normal). If the value decodes to
anything other than 32 bytes the Worker rejects it when a credential is stored.

> **Troubleshooting** — a `Pbkdf2 failed: iteration counts above 100000 are not
> supported` error during sign-up is **not** caused by `ENCRYPTION_KEY`. It is a
> Cloudflare Workers limit on password-hashing (PBKDF2) iterations; Postflare
> already clamps to 100,000. See [docs/security.md](docs/security.md#password-hashing).

Read [docs/security.md](docs/security.md) for the full model, including key
rotation and OAuth callback security.

## Adapters

Every platform implements a common optional interface; unsupported
capabilities are surfaced honestly in the UI (never faked). The capability
matrix in `shared/capabilities.ts` is the single source of truth and drives the
composer, integration pages, and publishing pipeline.

Currently **fully implemented** (validate + publish end-to-end):

- **Bluesky** — app password → create session → create post (text, images, link embed)
- **Mastodon** — access token → statuses + media upload
- **Telegram** — bot token → sendMessage
- **WordPress** — application password → posts
- **Custom webhook** — HMAC-signed POST to any endpoint
- **X / Twitter** — OAuth 2.0 PKCE → tweets + media
- **Facebook Pages** — OAuth → page feed
- **LinkedIn** — OAuth → posts
- **Instagram** — OAuth → media container + publish

OAuth connection + token refresh + account profile are implemented for Threads,
TikTok, YouTube, Pinterest, Reddit, Twitch, Google Business Profile, Blogger and
Snapchat; their publishing endpoints are staged for later phases and report a
truthful `not_implemented` result rather than a fake success.

## Automation engine

The visual builder (`/automations/builder/:id`) uses React Flow. Flows are
stored as versioned, validated JSON (not the canvas layout), executed by a
server-side interpreter, and support triggers, message nodes, conditions,
branches, delays (resumed by cron — no held requests), contact actions,
webhooks, and human handoff. See [docs/automation.md](docs/automation.md).

## Testing

```bash
npm test              # unit tests (crypto, OAuth, capabilities, password)
npm run test:e2e      # full end-to-end suite against mock providers (21 flows)
npm run typecheck     # Worker + frontend type checking
npm run build         # full production build
```

`npm run test:e2e` boots `wrangler dev` + a mock social-provider server and walks
every feature (auth → publishing → inbox → automations → approvals → …) with fake
credentials only — see [docs/testing.md](docs/testing.md).

## Documentation

- [Security & encryption](docs/security.md)
- [Architecture](docs/architecture.md)
- [Development & bindings](docs/development.md)
- [Platform capability matrix](docs/platforms.md)
- [Automation engine](docs/automation.md)

## License

MIT