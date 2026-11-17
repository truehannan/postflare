# Architecture

## Request flow

```
Browser (React SPA, Kumo UI)
   │  /api/*   (session cookie + X-Workspace-Id header)
   ▼
Cloudflare Worker (Hono)
   ├─ middleware/auth         resolve session → c.var.user
   ├─ middleware/workspace    verify membership → c.var.workspace
   ├─ middleware/rate-limit   fixed-window limiter
   ├─ routes/…                Zod validation → service → D1/R2/Queue
   └─ onError                 sanitised { error: { code, message } }
```

Static assets (the React build in `dist/`) are served by the Worker's
`assets` binding with SPA fallback (`not_found_handling`).

## Publishing pipeline

```
createPost (draft | scheduled)
   │  publishNow or cron sweep finds due post
   ▼
enqueuePost → publishing_jobs (one per account) → PUBLISH_QUEUE.send
   │
   ▼
queue consumer (worker/index.ts `queue`) → publishJob
   ├─ resolve adapter + decrypted credentials
   ├─ resolve variant media URLs (R2-backed)
   ├─ adapter.publishPost()
   ├─ record publishing_attempts (redacted)
   ├─ update post_accounts (published | failed) + publishing_jobs
   └─ recomputePostStatus (published | partially_published | failed)
```

- Idempotency keys + per-job attempts + the queue's `max_retries`/dead-letter
  queue handle transient failures with backoff.
- A post is marked published **only** after the provider confirms success;
  partial success across platforms is preserved per account.

## Automation pipeline

```
trigger event (webhook / cron / API test)
   → resolve published automation + version
   → create automation_executions
   → walk the flow graph (node handlers, MAX_STEPS guard)
   → delay node → automation_scheduled_resumes (status: waiting)
   → cron sweep resumes due executions (no held requests)
   → record per-node steps in automation_execution_steps
```

## Bindings

| Binding | Resource | Purpose |
| --- | --- | --- |
| `DB` | D1 (`postflare-db`) | relational app data |
| `MEDIA` | R2 (`postflare-media`) | media + generated assets |
| `PUBLISH_QUEUE` | Queue (`postflare-publish-queue`) | publishing jobs |
| `INBOX_HUB` | Durable Object (`InboxHub`) | realtime inbox |
| `ASSETS` | Static Assets | React build |
| `PUBLIC_BASE_URL` | var | base URL for externally-fetchable media |

## Key invariants

- Platform logic lives only in `worker/adapters/*`; the composer, inbox, and
  automation engine never contain platform-specific code.
- The capability matrix (`shared/capabilities.ts`) is shared by the Worker and
  the UI and gates every platform-specific control.
- Sensitive values never cross into the frontend after submission and are
  redacted from logs and API responses.
- Workspace ownership is enforced in SQL on every query.