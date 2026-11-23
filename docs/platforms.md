# Platform capability matrix

The matrix is defined in `shared/capabilities.ts` and is the single source of
truth for what each platform can do. The UI derives available actions from it;
unsupported actions are never shown as functional buttons.

## Two ways to connect

Every platform can be connected **directly** (per-platform developer credentials,
the table below) or — for the platforms Composio supports — through the
**Composio hub**: one workspace API key, hosted OAuth on Composio's side, and
publishing via Composio tools (`shared/composio.ts` maps verified tool slugs):

| Platform | Composio toolkit | Publish tool |
| --- | --- | --- |
| X / Twitter | `TWITTER` | `TWITTER_CREATION_OF_A_POST` |
| Instagram | `INSTAGRAM` | `INSTAGRAM_POST_IG_USER_MEDIA` → `…_PUBLISH` (two-step) |
| Facebook | `FACEBOOK` | `FACEBOOK_CREATE_POST` (needs Page ID) |
| LinkedIn | `LINKEDIN` | `LINKEDIN_CREATE_LINKED_IN_POST` (author resolved at import) |
| Threads | `THREADS` | `THREADS_CREATE_POST` |
| Reddit | `REDDIT` | `REDDIT_CREATE_REDDIT_POST` (needs subreddit) |
| Telegram | `TELEGRAM` | `TELEGRAM_SEND_MESSAGE` (needs chat ID) |

Mastodon, Bluesky, YouTube and the rest stay direct-only — Composio has no
first-party toolkits for them, so Postflare does not pretend otherwise.

### Composio auth gateway

You never need to open the Composio dashboard. From Postflare (Settings →
Integrations → Composio panel, or a platform's configure page), clicking
**Connect via Composio** handles everything automatically:

1. finds the toolkit's enabled Composio auth config — and if the project has
   none, **creates a Composio-managed one itself** via `POST /auth_configs`
   (`type: use_composio_managed_auth`),
2. creates a link under the **Postflare user** (`user_id: "postflare"` —
   Composio creates the user on first use) via `POST /connected_accounts/link`
   with a callback back to Postflare,
3. redirects you to Composio's hosted authorization page,
4. on return, the new account is auto-imported (Facebook/Reddit/Telegram ask
   for their required per-account setting: Page ID, subreddit, chat ID).

Only a Composio project API key is needed, and the flow is fully serverless —
Composio's own docs prescribe exactly this pattern ("redirect the user to the
returned hosted link and wait for the resulting connected account to become
active"): HTTP requests, browser redirects, and polling. No webhooks, no
persistent server, no long-held connections.

### Finishing the connection (deterministic)

When the link is created, Composio returns the exact `connected_account_id`.
Postflare remembers it (sessionStorage) and, after the hosted authorization
returns, polls that **one account by id** (`GET /connected_accounts/{id}`)
every 3 seconds until it is `ACTIVE` — then imports it automatically (or opens
the config modal for Facebook Page ID / Reddit subreddit / Telegram chat ID).
This survives refreshes: on any later visit the pending connection resumes.

If the authorization doesn't complete, Composio's status and `status_reason`
are surfaced honestly:

| Status | Meaning |
| --- | --- |
| `ACTIVE` | Connected — imported automatically. |
| `INITIALIZING` | Composio is processing — keep waiting. |
| `INITIATED` | The OAuth was started but never completed on Composio's page — reconnect. |
| `FAILED` / `EXPIRED` / `REVOKED` | Terminal — the reason is shown. |

Account listings prefer the Postflare user (`user_ids=postflare`); if that
filter matches nothing, Postflare falls back to listing all project accounts
(flagged in the UI) so a connection is never silently hidden by a user-id
mismatch.

## Adapter implementation status

| Platform | Connection | Validate | Publish | Notes |
| --- | --- | --- | --- | --- |
| Bluesky | ✅ manual | ✅ | ✅ text, images, link | App password |
| Mastodon | ✅ manual | ✅ | ✅ text, images | Access token |
| Telegram | ✅ manual | ✅ | ✅ message | Bot token (+ chatId) |
| WordPress | ✅ manual | ✅ | ✅ posts | Application password |
| Custom webhook | ✅ manual | ✅ | ✅ POST | Optional HMAC signature |
| X / Twitter | ✅ OAuth | ✅ | ✅ tweets + media | Free tier limited |
| Facebook Pages | ✅ OAuth | ✅ | ✅ feed | Requires pageId |
| Instagram | ✅ OAuth | ✅ | ✅ media container | Requires business account id |
| LinkedIn | ✅ OAuth | ✅ | ✅ posts | `/rest/posts` |
| Threads | ✅ OAuth | ✅ | ✅ text | Threads API |
| TikTok | ✅ OAuth | ⏳ | ⏳ | Audited app required |
| YouTube | ✅ OAuth | ✅ | ⏳ | Resumable upload pending |
| Pinterest | ✅ OAuth | ⏳ | ⏳ | |
| Reddit | ✅ OAuth | ⏳ | ⏳ | |
| Twitch | ✅ OAuth | ⏳ | ⏳ | |
| Google Business Profile | ✅ OAuth | ⏳ | ⏳ | Verification required |
| Blogger | ✅ OAuth | ⏳ | ⏳ | |
| Snapchat | ✅ OAuth | ⏳ | ⏳ | Marketing API approval |
| Tumblr | ⏳ | ⏳ | ⏳ | OAuth 1.0a tokens |
| Discord, WhatsApp, VK, LINE, WeChat, Flickr, Medium, Ghost | catalogued | ⏳ | ⏳ | staged |

✅ = implemented · ⏳ = capability declared, adapter staged for a later phase.

## Honest limits

- **Instagram** personal profiles cannot be published to via the API — a
  business/creator account linked to a Facebook Page is required.
- **Bluesky** has no native scheduling or analytics API; Postflare schedules via
  its own queue and reports "Not available through this integration" for those
  metrics.
- **Substack** exposes no official publishing API and is therefore not offered
  as a publishing destination.
- **Telegram** bots can only message users who started the conversation first.
- **WhatsApp** business-initiated conversations require approved templates.

When a platform requires app review or special access, the integration page
shows the requirement and links to the official documentation rather than
pretending the capability works.