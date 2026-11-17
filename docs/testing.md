# Testing

Postflare is tested at three levels. The goal is to prove behaviour with
**fakes only** — no live social credentials are ever required.

## Feature / flow map

| # | Area | Flows covered |
| --- | --- | --- |
| 1 | Auth | register → session cookie → `me`; login; logout |
| 2 | Workspaces | list, create |
| 3 | Integrations | platform registry (28+), per-platform detail |
| 4 | Credentials | store (AES-256-GCM), masked list (no plaintext leak), test connection |
| 5 | Accounts | connect, list, test connectivity |
| 6 | Media | R2 upload, list |
| 7 | Composer | draft with variants + link + first comment + location + alt text + media |
| 8 | Scheduling | scheduled post + calendar |
| 9 | Publishing | publish-now → queue → adapters → mock providers; media embed |
| 10 | Inbox | webhook ingestion → conversation → messages → reply (real send) |
| 11 | Contacts | create, tag, CSV export |
| 12 | Automations | create → publish → execute → execution log |
| 13 | Campaigns | create, list |
| 14 | Approvals | request → resolve (approve) → post approved |
| 15 | Team | invite, list invitations |
| 16 | Notifications / settings / audit | list, read-all, patch settings, audit log |
| 17 | Security | workspace isolation (cross-tenant 403) |

## Unit tests

```bash
npm test
```

Vitest covers encryption round-trips and IV uniqueness, tamper detection,
PBKDF2 hashing (including the Workers 100k iteration clamp), OAuth/PKCE URL
building, and the platform capability matrix.

## End-to-end (mock providers)

```bash
npm run test:e2e
```

`scripts/e2e.mjs` boots everything itself:

1. ensures `.dev.vars` (ENCRYPTION_KEY) and a `dist/` stub,
2. applies local D1 migrations,
3. starts `wrangler dev` on port 8788 (with `PUBLIC_BASE_URL` pointed at it),
4. starts `scripts/mock-provider.mjs` on port 4000,
5. runs the full flow map above, asserting on both the Worker API **and** the
   mock provider's inspection endpoint (`/__inspect`) so we know publishes
   really happened,
6. tears everything down.

The mock provider simulates Bluesky (AT Protocol), Mastodon, Telegram and
WordPress APIs plus a webhook receiver. Adapters are pointed at it using the
optional `apiBaseUrl` / `baseUrl` credential fields, so **real provider URLs are
never contacted**.

Run the mock provider standalone (useful while developing adapters):

```bash
npm run mock:provider
# then http://localhost:4000/__inspect shows everything "published" so far
```

## Troubleshooting

- If `npm run test:e2e` fails with a port conflict, set `WORKER_PORT`/`MOCK_PORT`.
- `wrangler dev` is spawned by the runner; make sure no other dev server holds
  port 8788.
- The runner restores `wrangler.jsonc` and kills child processes on exit, even
  on failure.