# Platform capability matrix

The matrix is defined in `shared/capabilities.ts` and is the single source of
truth for what each platform can do. The UI derives available actions from it;
unsupported actions are never shown as functional buttons.

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