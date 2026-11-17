# MASTER BUILD PROMPT — ALL-IN-ONE SOCIAL MEDIA MANAGEMENT & CONVERSATIONAL AUTOMATION PLATFORM

## 1. Your role

Act as a principal software architect, senior full-stack engineer, Cloudflare Workers specialist, API integration engineer, security engineer, and product designer.

Build a complete, production-oriented SaaS platform that combines:

1. A comprehensive social media management and publishing platform.
2. A powerful social media scheduling and content calendar.
3. A unified social inbox for managing conversations and comments.
4. A native ManyChat alternative for building visual conversational automations.
5. Analytics, reporting, audience management, and engagement tools.
6. Team collaboration, client workspaces, and multi-brand management.
7. A centralized integrations and credentials management system.

The product should feel like a serious commercial alternative to Buffer, Hootsuite, Publer, Metricool, SocialBee, Later, and ManyChat.

Do not build a simple MVP dashboard with buttons that do nothing. Build the application around real, functional systems, with a modular architecture that allows every feature to evolve independently.

The product must be designed specifically for Cloudflare's infrastructure and must be deployable without requiring a traditional Node.js server, VPS, Docker host, or external backend server.

**Primary requirement: Cloudflare Workers is the application backend, not merely a deployment target.**

---

# 2. Core product philosophy

The application should follow these principles:

- One workspace for managing almost every major social platform.
- One publishing calendar for all connected accounts.
- One inbox for incoming conversations and engagement.
- One visual automation builder for creating conversational flows.
- One centralized credentials manager.
- One media library for all content.
- One analytics system for performance tracking.
- One consistent interface across all features.

Users should be able to manage multiple brands, social accounts, campaigns, conversations, and automations from one application.

The application should be modular. Every social platform must have its own adapter, every messaging channel must have its own capabilities, and every automation trigger must be independently extensible.

Never assume that all social networks offer the same API capabilities.

Never fake functionality that a platform does not officially support.

---

# 3. Technology stack and infrastructure

Use the following stack as the default architecture.

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS v4
- @cloudflare/kumo
- @phosphor-icons/react
- React Router
- TanStack Query for server state
- Zustand or a similarly lightweight state solution where global client state is required
- React Hook Form
- Zod for validation
- A suitable visual node-editor library for the automation builder, such as React Flow / @xyflow/react

Use Kumo components wherever possible.

Do not create an unnecessary collection of custom UI primitives when Kumo already provides an appropriate component.

## Backend

- Cloudflare Workers
- TypeScript
- Hono for API routing
- Cloudflare D1 for relational application data
- Cloudflare R2 for uploaded media and generated assets
- Cloudflare Queues for background jobs
- Cloudflare Durable Objects for stateful real-time systems where needed
- Cloudflare Workflows for long-running or multi-step processes where appropriate
- Cloudflare Cron Triggers for recurring maintenance and scheduled checks
- Cloudflare Workers Static Assets for frontend deployment
- Cloudflare Browser Rendering only when a legitimate feature requires it

Use Cloudflare services according to their actual capabilities and current plan limitations.

Do not introduce Redis, PostgreSQL, MongoDB, Firebase, Supabase, or an external queue system unless there is a compelling, explicitly documented reason.

Avoid unnecessary external dependencies.

## Deployment

The complete application must deploy through Wrangler.

The project must include:

- wrangler.jsonc
- D1 migration files
- R2 binding configuration
- Queue producer and consumer configuration
- Durable Object bindings and migrations where needed
- Workflow bindings where needed
- Cron configuration
- Environment type definitions
- Build and deployment scripts
- Local development configuration
- A comprehensive README
- A deployment guide

Do not assume that local development and production environments have identical infrastructure.

---

# 4. Absolute credential and secrets architecture

THIS IS A CRITICAL REQUIREMENT. DO NOT IGNORE OR SIMPLIFY IT.

I want practically all third-party platform credentials to be entered, configured, tested, updated, and managed directly through the application's dashboard.

The only manually configured environment secret for encryption must be:

ENCRYPTION_KEY

This key must be configured as a Cloudflare Worker secret, never stored in D1, R2, source code, frontend code, or a committed environment file.

It must be used to encrypt and decrypt all sensitive credentials stored in the application.

Do not require users to edit wrangler.jsonc, .env, .dev.vars, or source files whenever they want to connect another social platform.

## 4.1 Dashboard-managed credentials

Create a centralized Settings → Integrations → Developer credentials section.

Users should be able to configure credentials for individual platforms, including:

- OAuth client IDs
- OAuth client secrets
- Application IDs
- API keys
- API tokens
- Access tokens
- Refresh tokens
- Webhook verification tokens
- Webhook signing secrets
- Bot tokens
- Page tokens
- Business account credentials
- Other platform-specific sensitive configuration

Not every platform uses all these fields. The integration adapter must define its own required and optional fields.

Support both:

1. OAuth-based account connections.
2. Manually entered credentials where the platform supports them.

Where a platform requires OAuth application credentials before OAuth can begin, the user should first enter the relevant client ID and client secret through the dashboard.

## 4.2 Encryption implementation

Implement secure authenticated encryption using Web Crypto API.

Preferred approach:

- AES-256-GCM.
- 96-bit unique random IV for each encryption operation.
- Authentication tag validation.
- Versioned ciphertext envelope.
- Key derivation or direct key import using a well-defined and documented approach.
- Web Crypto API only; no Node.js crypto dependency.

Use a versioned storage format, for example:

{
  "version": 1,
  "algorithm": "AES-GCM",
  "iv": "...",
  "ciphertext": "..."
}

The actual stored structure may be normalized into database columns, but it must retain version and algorithm metadata.

Never reuse an IV with the same encryption key.

Never store plaintext credentials in logs, exception messages, analytics events, or API responses.

## 4.3 Encryption service

Create a centralized CredentialVault service with functions such as:

- encryptSecret()
- decryptSecret()
- storeCredential()
- updateCredential()
- retrieveCredential()
- deleteCredential()
- rotateEncryptionKey()
- validateCredential()
- testConnection()

Only trusted backend code should be allowed to call decryption functions.

The frontend must never receive decrypted credentials after initial submission.

For existing credentials, display masked values such as:

••••••••••••••••

Never return the actual stored token when loading integration settings.

## 4.4 Encryption key rotation

Support future encryption-key rotation.

Include a versioned key strategy so that credentials encrypted using an older key can be migrated safely.

Document a secure migration procedure.

Never silently replace the encryption key and make existing credentials inaccessible.

## 4.5 OAuth callback security

Implement:

- Cryptographically random state.
- PKCE where supported.
- Strict redirect URI validation.
- State expiration.
- Single-use OAuth state.
- Account ownership validation.
- CSRF protection.
- Secure token exchange.
- Encrypted access and refresh token storage.
- Token refresh before expiration.
- Refresh locking to avoid simultaneous refresh races.

## 4.6 Multi-tenant credential isolation

Every credential must belong to the correct workspace and, where applicable, the connected social account.

Never allow one tenant to access another tenant's credentials.

All queries involving credentials must enforce workspace authorization.

Use strict workspace-scoped access policies.

## 4.7 Other security requirements

The encryption key is not a substitute for authentication.

Implement proper authentication, session security, authorization, rate limiting, CSRF protection, webhook verification, and audit logging.

Use secure password hashing such as Argon2id where passwords are managed locally, or use a well-established identity provider.

Do not implement weak custom cryptography.

---

# 5. Supported social platforms

Create a large and extensible platform ecosystem.

The platform selection screen should support the following traditional social networks and publishing destinations.

Do not reduce the product to just Instagram, Facebook, and LinkedIn.

## 5.1 Primary social platforms

1. Instagram
2. Facebook
3. Facebook Pages
4. Facebook Groups, only where official APIs and permissions allow
5. Threads
6. X / Twitter
7. LinkedIn
8. LinkedIn Company Pages
9. TikTok
10. YouTube
11. YouTube Shorts
12. Pinterest
13. Snapchat
14. Reddit
15. Tumblr
16. Telegram
17. WhatsApp Business
18. Discord
19. Mastodon
20. Bluesky
21. Twitch
22. Google Business Profile
23. WordPress
24. Medium, where supported by an official integration
25. VK
26. LINE
27. WeChat, subject to available official API access
28. Flickr

## 5.2 Additional publishing destinations

Design an extensible connector system for:

- Ghost
- Blogger
- Substack, only through supported integrations
- RSS feeds
- Custom webhook destinations
- Custom API publishing destinations
- Other future social networks

Do not claim that a platform supports direct publishing if it does not.

## 5.3 Platform capability matrix

Build a dynamic capability registry for every platform.

Each adapter should explicitly declare its supported capabilities:

- Account connection
- OAuth
- Manual credentials
- Text publishing
- Image publishing
- Multi-image publishing
- Video publishing
- Short-form video
- Reels
- Stories
- Carousel publishing
- Link publishing
- Polls
- Hashtags
- Location tagging
- First-comment publishing
- Scheduled publishing
- Immediate publishing
- Drafts
- Post editing
- Post deletion
- Comment retrieval
- Comment replies
- Direct messaging
- Conversation retrieval
- Analytics
- Audience insights
- Webhooks
- Media uploads
- Multiple account support

Use statuses such as:

- Supported
- Partially supported
- Requires additional permissions
- Requires manual setup
- Not supported
- Deprecated

The interface must derive available options from this capability registry.

Do not show unsupported actions as functional buttons.

When a capability is unavailable, explain why and provide the official documentation or setup requirements.

---

# 6. Social account management

Create a comprehensive connected accounts system.

Features:

- Connect social accounts.
- Disconnect accounts.
- Reconnect expired accounts.
- Refresh OAuth tokens.
- Display connection status.
- Show account name, username, profile image, platform, and workspace.
- Show token expiration status without revealing tokens.
- Detect revoked permissions.
- Display required permissions.
- Test account connectivity.
- Manage multiple accounts on the same platform.
- Group accounts by brand.
- Assign accounts to team members.
- Set default publishing accounts.
- View account-specific publishing capabilities.
- Track integration errors.
- Show the last successful synchronization.
- Display account-specific rate-limit status where available.

Account states:

- Connected
- Connecting
- Needs attention
- Expired
- Revoked
- Permission missing
- Error
- Disconnected

Allow multiple workspaces and multiple brands per workspace.

---

# 7. Social media publishing system

This is one of the core product modules.

Build a comprehensive post composer.

## 7.1 Composer interface

The composer should include:

- Multi-platform selection.
- Multi-account selection.
- Platform-specific content customization.
- Caption editor.
- Character counter.
- Hashtag manager.
- Emoji insertion.
- Mention support where available.
- Link insertion.
- Media attachments.
- Media library selection.
- Upload progress.
- Alt text.
- Thumbnail selection.
- First-comment configuration where supported.
- Location tagging where supported.
- Post preview.
- Scheduling options.
- Draft saving.
- Immediate publishing.
- Queue publishing.
- Approval workflow.
- Content labels.
- Campaign association.

## 7.2 Platform-specific content

One post should be capable of containing multiple platform variants.

For example:

- Instagram caption.
- Facebook caption.
- LinkedIn text.
- X post.
- Threads text.
- TikTok caption.
- YouTube title and description.
- Pinterest title and description.

Never assume that a single caption can be used everywhere.

Validate character limits, media requirements, aspect ratios, supported formats, and platform-specific restrictions.

Show validation errors before scheduling or publishing.

## 7.3 Media handling

Support:

- JPEG
- PNG
- WebP
- GIF where supported
- MP4
- MOV where supported
- Other platform-approved media types

Use R2 for durable media storage.

Implement:

- File type validation.
- File size validation.
- Image dimension validation.
- Video metadata extraction.
- Thumbnail generation where supported.
- Upload progress.
- Media processing status.
- Asset reuse.
- Media deduplication.
- Storage quotas.
- Secure signed download URLs.

Do not proxy large video files through a Worker unnecessarily.

Use direct or multipart R2 uploads where appropriate.

## 7.4 Scheduling engine

Create a reliable scheduling system.

Features:

- Schedule at a specific time.
- Schedule in the workspace timezone.
- Schedule in the account timezone.
- Queue-based publishing.
- Best-time suggestions when analytics support them.
- Recurring scheduling rules.
- Bulk scheduling.
- Reschedule.
- Cancel.
- Duplicate posts.
- Retry failed posts.
- Pause queued posts.
- Approval-based scheduling.

Use D1 for scheduled post metadata and Cloudflare Queues for publishing jobs.

Use Cron Triggers to find posts that are due and enqueue them.

Do not depend on a long-running Worker request to wait for a scheduled publishing time.

## 7.5 Reliable publishing

Implement:

- Idempotency keys.
- Job locking.
- Retry policies.
- Exponential backoff.
- Dead-letter queue handling.
- Platform rate-limit handling.
- Token refresh.
- Partial failure handling.
- Publishing status synchronization.
- API response storage.
- Error classification.

Post states:

- Draft
- Awaiting approval
- Approved
- Scheduled
- Queued
- Publishing
- Published
- Partially published
- Failed
- Cancelled

If a multi-platform post succeeds on three platforms and fails on one, preserve the individual platform statuses.

Never mark a post as published simply because a request was sent.

---

# 8. Unified social inbox

Build a unified inbox that combines supported social conversations and engagement into one interface.

The inbox should support available official APIs for:

- Instagram DMs
- Facebook Messenger
- Facebook Page messages
- WhatsApp Business messages
- Telegram messages
- YouTube comments
- Facebook comments
- Instagram comments
- TikTok comments where supported
- LinkedIn comments where supported
- X replies and mentions where supported
- Other supported messaging channels

## 8.1 Inbox interface

Create a three-panel interface:

Left:
- Conversation list.
- Search.
- Filters.
- Platform indicators.
- Unread counts.
- Assigned user.
- Labels.
- Priority.
- Last message preview.

Center:
- Message history.
- Message composer.
- Attachments.
- Quick replies.
- Automation status.
- Internal notes.
- Conversation timeline.

Right:
- Contact profile.
- Social profiles.
- Tags.
- Custom fields.
- Conversation history.
- Assigned team member.
- Automation information.
- Contact activity.

## 8.2 Inbox capabilities

- Reply to messages.
- Reply to comments.
- Mark as read/unread.
- Assign conversations.
- Add internal notes.
- Add tags.
- Search conversations.
- Filter by channel.
- Filter by status.
- Filter by assignee.
- Filter by unread state.
- Close conversations.
- Reopen conversations.
- Archive conversations.
- Merge duplicate contacts where appropriate.
- Save replies.
- Create quick replies.
- Track response times.
- Track unresolved conversations.

## 8.3 Real-time synchronization

Use Durable Objects where appropriate for real-time workspace updates and conversation synchronization.

Use WebSockets for live inbox updates.

Use webhooks for incoming messages whenever supported.

Implement webhook signature verification, event deduplication, and replay protection.

Use polling only where necessary and respect platform rate limits.

Never scrape social websites or simulate user interactions through unauthorized browser automation.

---

# 9. Native ManyChat alternative — visual automation builder

This is a major differentiating feature.

Build a full visual conversational automation system, not a simple keyword autoresponder.

The automation builder should be a first-class product module.

Use React Flow or another appropriate node-editor library.

The interface should have:

- Visual canvas.
- Draggable nodes.
- Node connection handles.
- Zoom and pan.
- Minimap.
- Node configuration panel.
- Flow validation.
- Undo/redo.
- Save and publish controls.
- Test mode.
- Execution logs.
- Flow versioning.
- Reusable templates.

## 9.1 Automation triggers

Provide a trigger registry.

Possible triggers:

### Instagram

- New direct message.
- Specific keyword received.
- Story reply.
- Story mention.
- Post comment.
- Reel comment.
- Mention.
- New follower, only where officially supported.
- Supported messaging referral events.

### Facebook

- New Messenger message.
- Keyword received.
- Page post comment.
- Post reaction, where available.
- Page message event.
- Lead form submission.
- Supported engagement event.

### WhatsApp

- Incoming message.
- Keyword received.
- Button response.
- Interactive message response.
- Template message response.
- Supported status events.

### Telegram

- New bot message.
- Command received.
- Callback query.
- Keyword received.
- Group message, subject to bot permissions.

### Other channels

- YouTube comment.
- Website chat message.
- Custom webhook event.
- Form submission.
- API-triggered automation.
- Scheduled trigger.
- Contact created.
- Tag added.
- Contact field updated.

Each trigger must declare its actual platform requirements.

## 9.2 Automation node types

Implement a node registry with these node categories.

### Trigger nodes

- Instagram DM received.
- Facebook message received.
- WhatsApp message received.
- Telegram message received.
- Comment received.
- Keyword detected.
- Contact created.
- Form submitted.
- Webhook received.
- Schedule triggered.
- API trigger.

### Message nodes

- Send text message.
- Send image.
- Send video.
- Send audio.
- Send document.
- Send carousel.
- Send interactive buttons.
- Send quick replies.
- Send WhatsApp template.
- Send Telegram inline keyboard.
- Send platform-supported interactive content.

### Logic nodes

- If/else.
- Condition.
- Keyword condition.
- Random split.
- Percentage split.
- Switch.
- Filter.
- Wait.
- Delay.
- Time window.
- Business hours condition.
- User input condition.

### Contact nodes

- Add tag.
- Remove tag.
- Update custom field.
- Set contact property.
- Assign conversation.
- Add internal note.
- Create contact.
- Update contact.
- Subscribe to sequence.
- Unsubscribe from sequence.

### Action nodes

- Send webhook.
- HTTP request.
- Call external API.
- Create task.
- Notify team member.
- Send email through a configured provider.
- Trigger another automation.
- Update campaign.
- Add to audience.
- Generate tracking event.

### AI nodes

- AI response.
- AI classification.
- Intent detection.
- Sentiment detection.
- Extract structured information.
- Generate response from knowledge base.
- Summarize conversation.
- Route to human.
- AI decision node.

AI nodes must use a configurable provider architecture. Provider API keys must also be managed through the dashboard and encrypted using the same credential vault.

### Flow control nodes

- Start.
- End.
- Go to another flow.
- Jump to node.
- Stop automation.
- Exit sequence.
- Human handoff.

## 9.3 Automation editor experience

Every node must have:

- Unique ID.
- Node type.
- Configuration schema.
- Input handles.
- Output handles.
- Validation rules.
- Execution handler.
- Error handling.
- Documentation.
- Visual representation.

When a user clicks a node, open its configuration panel.

The configuration panel must update based on the selected node type.

Support:

- Required fields.
- Dynamic variables.
- Conditional branches.
- Input validation.
- Preview.
- Error indicators.
- Node duplication.
- Node deletion.
- Copy/paste.
- Multi-node selection.
- Keyboard shortcuts.
- Auto-save.
- Explicit publishing.

Do not save the visual layout as the only source of truth.

Store a validated, versioned flow definition as structured JSON.

## 9.4 Automation execution engine

Create a server-side automation interpreter.

It must:

1. Receive a valid trigger event.
2. Resolve the matching published automation.
3. Create an execution instance.
4. Load the published flow version.
5. Execute nodes in the correct order.
6. Evaluate conditional branches.
7. Persist execution state.
8. Handle delays without holding open a Worker request.
9. Resume delayed executions safely.
10. Handle failures and retry policies.
11. Record node-level logs.
12. Stop execution when required.
13. Prevent infinite loops.
14. Respect execution limits.
15. Enforce platform messaging policies.

Use Queues, D1, Durable Objects, and Workflows according to the requirements of each execution path.

Do not hold a Worker request open during a multi-hour delay.

A delay node must persist a continuation state and resume through a scheduled mechanism.

## 9.5 ManyChat-style comment automation

Implement a dedicated comment-to-DM automation feature.

User should be able to:

- Select a connected social account.
- Select a supported post.
- Choose specific keywords.
- Match all comments or selected keywords.
- Set case-insensitive matching.
- Configure exact or partial matches.
- Send a public comment reply where supported.
- Send a private message where supported.
- Add a contact tag.
- Start another automation.
- Capture user information.
- Assign a conversation.
- Track conversion events.

Example:

Trigger:
Someone comments "PRICE" on a selected Instagram post.

Actions:
1. Check whether the comment matches the configured keyword.
2. Verify platform permissions and messaging eligibility.
3. Send an approved private response if the platform allows it.
4. Add the contact tag "pricing-interest".
5. Start a follow-up flow.
6. Record execution details.

Respect messaging windows, platform restrictions, opt-in requirements, and anti-spam rules.

Never promise a DM can be sent to every commenter when the platform restricts private replies.

## 9.6 Automation templates

Create reusable templates for:

- Instagram comment-to-DM.
- Instagram keyword DM.
- Facebook lead capture.
- WhatsApp lead qualification.
- Telegram welcome bot.
- Customer support routing.
- Product inquiry.
- Pricing inquiry.
- Appointment request.
- FAQ automation.
- Giveaway engagement.
- Lead magnet delivery.
- Newsletter subscription.
- Abandoned conversation follow-up.

Templates must be editable before activation.

## 9.7 Automation analytics

Track:

- Total executions.
- Successful executions.
- Failed executions.
- Messages sent.
- Contacts created.
- Contacts tagged.
- Branch distribution.
- Completion rate.
- Drop-off rate.
- Average execution duration.
- Conversion events.
- Human handoffs.

Provide execution history with expandable node-level logs.

---

# 10. Contact CRM and audience management

Create a lightweight built-in CRM.

Contact fields:

- Name.
- Username.
- Email.
- Phone number.
- Platform profiles.
- Profile image.
- Source.
- Tags.
- Custom fields.
- Assigned team member.
- First interaction.
- Last interaction.
- Created date.
- Conversation count.
- Consent status.
- Subscription status.

Features:

- Contact search.
- Segmentation.
- Tag management.
- Custom field builder.
- Contact import.
- CSV export.
- Duplicate detection.
- Contact activity timeline.
- Conversation association.
- Audience filters.
- Saved segments.
- Bulk tagging.
- Consent tracking.
- Data deletion requests.

Do not merge contacts from different social networks based on weak assumptions.

---

# 11. Content calendar

Build a complete visual calendar.

Views:

- Month.
- Week.
- Day.
- List.
- Queue.

Features:

- Drag-and-drop rescheduling.
- Platform filters.
- Account filters.
- Brand filters.
- Campaign filters.
- Draft indicators.
- Scheduled indicators.
- Published indicators.
- Failed indicators.
- Approval indicators.
- Quick-create post.
- Duplicate post.
- Bulk rescheduling.
- Timezone display.
- Calendar navigation.

Calendar cards should display:

- Platform icon.
- Account name.
- Post preview.
- Scheduled time.
- Publishing status.

Provide clear visual differences between drafts, scheduled posts, and published posts.

---

# 12. Media library

Create a centralized media asset manager.

Features:

- Grid and list views.
- Folder organization.
- Search.
- Tags.
- File type filters.
- Upload.
- Drag and drop.
- Preview.
- Rename.
- Delete.
- Download.
- Asset metadata.
- Dimensions.
- File size.
- Duration.
- Upload date.
- Workspace ownership.

Support R2-backed storage.

Allow assets to be reused across posts and campaigns.

Ensure deleted assets are not silently removed while they are still referenced by scheduled content.

---

# 13. Analytics and reporting

Create an analytics system that aggregates only metrics available through authorized platform APIs.

Dashboard metrics:

- Total followers.
- Follower growth.
- Reach.
- Impressions.
- Engagement.
- Engagement rate.
- Likes.
- Comments.
- Shares.
- Saves.
- Video views.
- Clicks.
- Profile visits.
- Published posts.
- Top-performing posts.

Provide:

- Platform comparisons.
- Account comparisons.
- Date filters.
- Post performance.
- Audience growth charts.
- Engagement charts.
- Best-performing content.
- Campaign performance.
- Exportable reports.

Do not invent missing metrics.

When a platform does not expose a metric, display "Not available through this integration."

Clearly distinguish between:

- Native platform metrics.
- Derived metrics.
- Estimated metrics.

Never present estimated values as official platform data.

Support CSV exports and a future PDF report system.

---

# 14. Campaign management

Create a campaign management module.

Users should be able to:

- Create campaigns.
- Assign social accounts.
- Add posts.
- Add automation flows.
- Set start and end dates.
- Add campaign descriptions.
- Define campaign objectives.
- Assign team members.
- Track performance.
- Add internal notes.
- Monitor publishing progress.

A campaign should be able to connect publishing, engagement, and automation activities.

---

# 15. Team collaboration

Support multiple team members per workspace.

Roles:

- Owner.
- Administrator.
- Manager.
- Editor.
- Publisher.
- Analyst.
- Inbox agent.
- Custom roles in a future-compatible permission system.

Features:

- Invite members.
- Remove members.
- Assign conversations.
- Assign posts.
- Review drafts.
- Approve posts.
- Comment internally.
- View activity history.
- Manage role permissions.

Implement workspace-level RBAC on the backend.

Do not rely on hiding frontend buttons for authorization.

---

# 16. Approval workflows

Create optional publishing approval workflows.

Examples:

- Editor creates a post.
- Manager reviews it.
- Manager requests changes or approves.
- Publisher schedules or publishes it.

Features:

- Submit for approval.
- Approve.
- Reject.
- Request revisions.
- Internal comments.
- Approval history.
- Notification events.

Allow workspace administrators to configure whether approvals are mandatory.

---

# 17. Notifications

Build a notification center.

Notification types:

- Post published.
- Post failed.
- Account disconnected.
- Token expired.
- New conversation.
- Assigned conversation.
- Automation failed.
- Automation completed.
- Approval requested.
- Approval completed.
- Team invitation.
- Storage limit warning.
- Integration permission warning.

Support in-app notifications first.

Design an extensible notification provider architecture for email and other channels.

---

# 18. Dashboard and application navigation

Create a refined, compact dashboard.

Main navigation:

- Overview
- Publishing
  - Composer
  - Calendar
  - Queue
  - Drafts
  - Published posts
- Inbox
- Automations
  - All automations
  - Flow builder
  - Templates
  - Execution history
- Contacts
- Analytics
- Campaigns
- Media library
- Approvals
- Team
- Settings

Settings:

- General
- Workspace
- Social accounts
- Integrations
- Developer credentials
- Webhooks
- Notifications
- Team and permissions
- Billing-ready architecture
- Security
- Audit logs

The sidebar should be collapsible.

The application should have workspace switching and brand/account filtering.

The overview should display useful information, not meaningless decorative statistics.

Examples:

- Scheduled posts.
- Posts awaiting approval.
- Recent publishing failures.
- Unread conversations.
- Active automations.
- Recent automation errors.
- Connected accounts requiring attention.
- Publishing activity.
- Top-performing posts.

---

# 19. Kumo UI design system — mandatory

Use Cloudflare Kumo as the foundation of the entire interface.

Official resources:

- https://kumo-ui.com/
- https://kumo-ui.com/skill/
- https://github.com/cloudflare/kumo

Install and use the actual @cloudflare/kumo package.

Do not simply imitate Kumo with generic Tailwind components.

Use its actual component library, semantic design tokens, and accessible interaction patterns.

## 19.1 Design philosophy

The interface should look like a mature infrastructure or productivity product.

Think:

- Cloudflare dashboard.
- Linear.
- Modern developer tools.
- Refined business applications.

Avoid:

- Generic AI SaaS dashboards.
- Excessive gradients.
- Huge rounded cards.
- Oversized headings.
- Excessive whitespace.
- Decorative graphs without meaning.
- Glassmorphism.
- Random colored backgrounds.
- Excessive shadows.
- Unnecessary animations.
- Huge sidebar icons.
- Gradient buttons.
- Every section inside a separate card.

Use a restrained, minimal, high-information-density interface.

## 19.2 Kumo typography rules

Follow these rules:

- Default content text: 14px.
- 16px and above reserved for headings and subheadings.
- Use sentence case for headings.
- Never uppercase ordinary section headings.
- Use font-semibold for headings.
- Use font-medium for inline emphasis.
- Never use font-bold.
- Never change font tracking.
- Keep related labels and descriptions close together.
- Use consistent line heights.

## 19.3 Kumo color rules

Use Kumo semantic tokens.

Examples:

- bg-kumo-base
- bg-kumo-elevated
- bg-kumo-recessed
- text-kumo-default
- text-kumo-subtle
- border-kumo-line
- ring-kumo-hairline

Do not use arbitrary Tailwind color classes when a semantic token exists.

Do not implement dark mode through arbitrary dark: variants. Follow Kumo's theme and data-mode conventions.

Support light and dark modes.

## 19.4 Component rules

Prefer:

- Kumo Button.
- Kumo Input.
- Kumo Dialog.
- Kumo Select.
- Kumo Tabs.
- Kumo Badge.
- Kumo Surface.
- Kumo Table.
- Kumo Tooltip.
- Kumo Toast.
- Other appropriate documented Kumo components.

Use Base UI primitives re-exported by Kumo only when a suitable styled Kumo component does not exist.

Use Phosphor icons.

Use consistent icon sizes.

Avoid mixing several unrelated icon libraries.

## 19.5 Layout rules

- Compact sidebar.
- Consistent page headers.
- Clear content hierarchy.
- Restrained borders.
- Minimal card usage.
- Compact tables.
- Clear empty states.
- Consistent form layouts.
- Useful loading states.
- Accessible dialogs.
- Proper keyboard navigation.

Never combine borders with drop shadows.

Use sharp, clean surface separation.

Use immediate color changes on hover rather than sluggish color transitions.

Maintain proper focus indicators.

Do not conditionally mount dialogs in ways that break their open/close behavior.

## 19.6 Responsive behavior

Support:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

The desktop experience should be optimized first because the product is operationally complex.

The mobile experience should remain usable for inbox management, approvals, notifications, and basic publishing.

The visual automation builder can have a simplified mobile editing experience.

---

# 20. Database architecture

Design a normalized, workspace-aware D1 schema.

Create migrations for the necessary tables.

At minimum, consider:

## Identity and workspace

- users
- sessions
- workspaces
- workspace_members
- workspace_roles
- workspace_invitations
- workspace_settings

## Integrations

- integration_providers
- integration_credentials
- connected_accounts
- account_permissions
- oauth_states
- token_refresh_logs
- webhook_endpoints
- webhook_events

## Publishing

- posts
- post_variants
- post_accounts
- post_media
- scheduled_jobs
- publishing_attempts
- publishing_results
- publishing_queue_settings

## Media

- media_assets
- media_folders
- media_tags
- media_asset_tags

## Inbox

- contacts
- contact_profiles
- contact_tags
- contact_custom_fields
- conversations
- conversation_participants
- messages
- message_attachments
- conversation_assignments
- internal_notes
- quick_replies

## Automation

- automations
- automation_versions
- automation_triggers
- automation_executions
- automation_execution_steps
- automation_scheduled_resumes
- automation_templates
- automation_variables
- automation_errors

## Analytics

- account_metrics
- post_metrics
- metric_snapshots
- campaign_metrics

## Collaboration

- campaigns
- campaign_posts
- campaign_automations
- approvals
- approval_history
- notifications
- audit_logs

The final schema may be expanded or reorganized based on proper normalization.

Important database requirements:

- Primary keys.
- Foreign keys.
- Appropriate indexes.
- Unique constraints.
- Workspace ownership.
- Created and updated timestamps.
- Soft deletion where appropriate.
- Idempotency constraints.
- Pagination support.
- Efficient queries.
- Migration versioning.

Do not store every piece of data in one giant JSON column.

Use JSON for genuinely dynamic platform payloads and flexible automation definitions, not as a replacement for relational modeling.

---

# 21. Platform adapter architecture

This is essential for long-term maintainability.

Do not write social platform logic directly into the publishing composer, inbox, or automation engine.

Build a provider/adapter system.

Every platform should implement a consistent interface.

Conceptually:

SocialPlatformAdapter:

- providerId
- displayName
- capabilities
- credentialSchema
- validateCredentials()
- getAuthorizationUrl()
- exchangeAuthorizationCode()
- refreshAccessToken()
- getConnectedAccounts()
- getAccountProfile()
- publishPost()
- uploadMedia()
- getPostStatus()
- getComments()
- replyToComment()
- getConversations()
- getMessages()
- sendMessage()
- getAnalytics()
- registerWebhook()
- verifyWebhook()
- normalizeWebhookEvent()

All methods should be optional when the platform does not support the relevant functionality.

Use typed capability declarations rather than assuming every method is implemented.

Create a central adapter registry.

Example architecture:

- adapters/instagram/
- adapters/facebook/
- adapters/threads/
- adapters/x/
- adapters/linkedin/
- adapters/tiktok/
- adapters/youtube/
- adapters/pinterest/
- adapters/reddit/
- adapters/telegram/
- adapters/whatsapp/
- adapters/discord/
- adapters/mastodon/
- adapters/bluesky/
- adapters/wordpress/
- adapters/google-business/
- adapters/shared/

Each adapter must own:

- API client.
- OAuth implementation.
- Credential validation.
- Token lifecycle.
- API request handling.
- Platform-specific media processing.
- Capability declarations.
- Error mapping.
- Rate-limit handling.
- Webhook handling.
- Documentation.

Normalize platform responses into shared internal types.

Keep original provider response data when useful for debugging, but redact sensitive values.

---

# 22. API architecture

Use Hono for the Worker API.

Organize endpoints by domain.

Example:

/api/auth/*
/api/workspaces/*
/api/accounts/*
/api/integrations/*
/api/credentials/*
/api/posts/*
/api/calendar/*
/api/media/*
/api/inbox/*
/api/conversations/*
/api/contacts/*
/api/automations/*
/api/automation-executions/*
/api/analytics/*
/api/campaigns/*
/api/approvals/*
/api/team/*
/api/notifications/*
/api/webhooks/*
/api/settings/*

Requirements:

- Zod validation.
- Typed responses.
- Consistent error structure.
- Authentication middleware.
- Workspace authorization middleware.
- Rate limiting.
- Request logging with secret redaction.
- Pagination.
- API versioning.
- Idempotency support.
- Webhook-specific authentication.

Never trust workspace IDs or account IDs sent by the frontend without verifying authorization.

---

# 23. Webhook architecture

Implement a centralized webhook ingestion system.

Requirements:

- Provider-specific signature verification.
- Raw body preservation when signature verification requires it.
- Event normalization.
- Duplicate event detection.
- Event persistence.
- Queue-based processing.
- Retry handling.
- Failed event tracking.
- Replay protection.
- Workspace and account resolution.

Webhook routes should be separate from normal authenticated application routes.

Never accept arbitrary unsigned webhook events as trusted platform events.

---

# 24. Rate limiting and API reliability

Every provider must have rate-limit awareness.

Implement:

- Provider-level rate limits.
- Account-level rate limits.
- Endpoint-level rate limits where appropriate.
- Retry-After support.
- Exponential backoff.
- Jitter.
- Circuit-breaking behavior where useful.
- Token expiration handling.
- Error categorization.
- Dead-letter queues.
- Manual retry controls.

Do not retry permanent authorization errors indefinitely.

Do not create publishing loops.

Do not overwhelm third-party APIs with simultaneous requests.

---

# 25. AI functionality

Design an optional AI-assisted layer.

All AI provider credentials must be configured in the dashboard and encrypted.

Provider architecture should be extensible.

Potential providers:

- OpenAI
- Anthropic
- Google Gemini
- Other compatible API providers

Possible features:

- Caption generation.
- Content rewriting.
- Hashtag suggestions.
- Platform-specific rewriting.
- Content idea generation.
- Post summarization.
- Comment classification.
- Sentiment classification.
- AI inbox suggestions.
- Automation AI responses.
- Lead qualification.
- Conversation summaries.

AI must be optional.

The application should continue to function without an AI API key.

AI actions should be explicit and user-controlled, particularly when sending messages or publishing content.

---

# 26. Error handling and observability

Build an application-wide error system.

Track:

- API errors.
- Provider errors.
- OAuth errors.
- Publishing failures.
- Token refresh failures.
- Webhook failures.
- Automation failures.
- Queue failures.
- Media processing failures.

Create an admin-friendly error interface.

Every failure should include:

- Timestamp.
- Workspace.
- Related account.
- Provider.
- Operation.
- Error category.
- Safe error message.
- Retry availability.
- Related job ID.

Never expose secrets, authorization headers, access tokens, or full sensitive payloads in error logs.

---

# 27. Testing requirements

Testing is mandatory.

Include:

## Unit tests

- Encryption and decryption.
- Credential validation.
- OAuth state verification.
- Platform adapter logic.
- Capability checks.
- Scheduling calculations.
- Timezone conversions.
- Automation conditions.
- Automation node execution.
- Webhook signature verification.
- Permission checks.

## Integration tests

- D1 operations.
- Queue processing.
- R2 uploads.
- Token refresh.
- Publishing workflows.
- Webhook ingestion.
- Automation execution.

## End-to-end tests

- Register and sign in.
- Create workspace.
- Add credentials.
- Connect a social account.
- Create a post.
- Save a draft.
- Schedule a post.
- View publishing status.
- Receive a simulated webhook.
- Create an automation.
- Execute a test automation.
- Assign a conversation.
- Update contact information.

Use mock providers for automated testing.

Do not require live social credentials to run the test suite.

---

# 28. Performance and scalability

The application should be designed to support multiple workspaces and potentially thousands of connected accounts.

Focus on:

- Efficient D1 queries.
- Proper indexing.
- Cursor pagination.
- Queue-based asynchronous processing.
- Minimal frontend bundle size.
- Lazy loading.
- Efficient media delivery.
- Avoiding N+1 queries.
- Batching where safe.
- Connection and API request concurrency control.
- Durable execution state.
- Appropriate caching.

Do not use caching for sensitive decrypted credentials.

Never assume unlimited Cloudflare resources.

Document expected resource consumption and platform-specific limits.

---

# 29. User experience details

Every module must have:

- Loading states.
- Empty states.
- Error states.
- Success feedback.
- Confirmation dialogs for destructive operations.
- Search where appropriate.
- Filters where appropriate.
- Pagination for large datasets.
- Helpful contextual descriptions.
- Clear permission requirements.
- Useful onboarding.

Create a first-time onboarding flow:

1. Create workspace.
2. Configure workspace details.
3. Add a brand.
4. Configure a platform's developer credentials.
5. Connect a social account.
6. Upload media.
7. Create the first post.
8. Explore automation templates.

Users should not be forced to connect every platform during onboarding.

Allow them to start with one platform and add others later.

---

# 30. Integration setup experience

For every platform, create an integration detail page.

Display:

- Platform logo.
- Platform name.
- Connection status.
- Required credentials.
- Optional credentials.
- OAuth setup instructions.
- Official developer documentation.
- Redirect URI.
- Required permissions.
- API limitations.
- Available capabilities.
- Test connection button.
- Save credentials button.
- Connect account button.
- Reconnect button.
- Disconnect button.

The platform's credential schema should dynamically generate its form.

For example, one platform might require:

- App ID.
- App Secret.
- Access Token.

Another might require:

- Client ID.
- Client Secret.
- Redirect URI configuration.
- OAuth permissions.

Another might require:

- Bot Token.

Never force every platform into an identical credential form.

Provide field-level descriptions.

Use password-style fields for sensitive values.

Allow credentials to be replaced without exposing existing stored values.

---

# 31. Subscription and monetization readiness

Do not make billing the first development priority.

However, design a future-compatible subscription system.

Support future concepts such as:

- Workspaces.
- Team seats.
- Connected accounts.
- Monthly publishing volume.
- Automation executions.
- Contact limits.
- Storage limits.
- AI usage.
- Analytics retention.

Implement usage counters and quota-checking interfaces without making the entire application dependent on a payment provider.

Do not hardcode arbitrary restrictions throughout the codebase.

---

# 32. Suggested project structure

Use a clean modular structure similar to:

src/
  app/
    routes/
    layouts/
    providers/
  components/
    ui/
    navigation/
    shared/
    forms/
  features/
    dashboard/
    publishing/
    composer/
    calendar/
    inbox/
    contacts/
    automations/
    analytics/
    campaigns/
    media/
    approvals/
    accounts/
    integrations/
    settings/
    team/
  hooks/
  lib/
  services/
  types/

worker/
  index.ts
  routes/
  middleware/
  services/
    auth/
    credentials/
    encryption/
    oauth/
    publishing/
    scheduling/
    inbox/
    automation/
    analytics/
    media/
    webhooks/
    notifications/
  adapters/
    instagram/
    facebook/
    threads/
    x/
    linkedin/
    tiktok/
    youtube/
    pinterest/
    reddit/
    telegram/
    whatsapp/
    discord/
    mastodon/
    bluesky/
    wordpress/
    shared/
  queues/
  workflows/
  durable-objects/
  cron/
  utils/

db/
  migrations/

tests/
  unit/
  integration/
  e2e/

public/
  assets/

This is a starting structure, not an inflexible requirement.

Keep frontend business logic out of UI components and provider API logic out of generic application services.

---

# 33. Implementation strategy

Do not attempt to implement 25 social integrations simultaneously and then claim the application is complete.

Build the architecture first and implement real integrations in a staged sequence.

## Phase 1 — Foundation

- Project setup.
- Kumo UI installation.
- Application shell.
- Authentication.
- Workspaces.
- D1 schema.
- CredentialVault.
- ENCRYPTION_KEY handling.
- Integrations dashboard.
- Adapter registry.
- API architecture.
- Error handling.

Deliverable: A working, deployable application foundation.

## Phase 2 — Core publishing

Implement the first group of real integrations:

- Instagram.
- Facebook Pages.
- Threads.
- LinkedIn.
- X.
- TikTok.
- YouTube.
- Pinterest.

Prioritize supported publishing capabilities.

Build:

- Account connections.
- Composer.
- Media library.
- Platform-specific variants.
- Drafts.
- Scheduling.
- Queue processing.
- Publishing status.

Deliverable: A functioning multi-platform publishing application.

## Phase 3 — Calendar and analytics

- Visual calendar.
- Queue.
- Rescheduling.
- Publishing history.
- Platform metrics.
- Post performance.
- Reports.

Deliverable: Complete core social media management workflow.

## Phase 4 — Unified inbox

Implement real supported integrations for:

- Instagram.
- Facebook Messenger.
- WhatsApp Business.
- Telegram.
- YouTube comments.
- Other platforms as their APIs permit.

Build:

- Conversation storage.
- Message synchronization.
- Reply functionality.
- Webhooks.
- Assignments.
- Tags.
- Internal notes.
- Real-time updates.

Deliverable: A functional unified inbox.

## Phase 5 — Automation engine

Build:

- Visual flow builder.
- Node registry.
- Trigger registry.
- Execution engine.
- Conditions.
- Delays.
- Contact management.
- Messaging nodes.
- Webhooks.
- Execution logs.
- Versioning.
- Test mode.

Deliverable: A real ManyChat-style automation platform.

## Phase 6 — Comment automation

Implement supported comment triggers and comment-to-DM flows.

Prioritize Instagram and Facebook where API permissions permit.

Deliverable: Functional engagement-to-conversation automation.

## Phase 7 — Remaining integrations

Expand adapters to:

- Reddit.
- Snapchat.
- Tumblr.
- Mastodon.
- Bluesky.
- Discord.
- Twitch.
- Google Business Profile.
- WordPress.
- Medium.
- VK.
- LINE.
- WeChat.
- Flickr.
- Other destinations.

Only implement functionality actually supported by official APIs.

## Phase 8 — Advanced features

- AI assistance.
- Campaigns.
- Approvals.
- Advanced analytics.
- Team roles.
- Notifications.
- Subscription readiness.
- Usage management.

---

# 34. Strict development rules

These instructions override any tendency to prioritize appearance over functionality.

1. Never build fake buttons.
2. Never use placeholder data in production interfaces.
3. Never claim an API integration is functional unless it has been implemented and tested.
4. Never hardcode social credentials.
5. Never put sensitive credentials into frontend bundles.
6. Never store credentials in plaintext.
7. Never put encryption keys into D1 or R2.
8. Never require additional environment secrets for individual platform integrations.
9. Use ENCRYPTION_KEY as the sole manually configured application environment secret for credential encryption.
10. Never bypass official platform API permissions.
11. Never scrape social networks.
12. Never simulate unauthorized browser interactions.
13. Never assume every platform supports the same publishing and messaging features.
14. Never silently discard failed publishing jobs.
15. Never mark an unsuccessful post as published.
16. Never allow cross-workspace data access.
17. Never expose decrypted credentials in API responses.
18. Never hold Worker requests open for long-running automation delays.
19. Never make all database operations synchronous in the request path when background execution is appropriate.
20. Never build the entire application in one giant component.
21. Never create arbitrary custom UI components when Kumo provides an appropriate component.
22. Never sacrifice accessibility for visual appearance.
23. Never use excessive gradients, shadows, or decorative cards.
24. Never build only a frontend prototype.
25. Never leave critical functionality as TODO comments while describing it as complete.

---

# 35. Documentation and developer experience

Create documentation for:

- Architecture.
- Local setup.
- Cloudflare deployment.
- D1 migrations.
- R2 configuration.
- Queue setup.
- Durable Object setup.
- Workflow configuration.
- ENCRYPTION_KEY generation.
- Credential encryption.
- OAuth application configuration.
- Each social platform's integration setup.
- Webhook setup.
- Automation engine.
- Adapter development.
- Database schema.
- Testing.
- Troubleshooting.

Provide an .env.example only for non-secret local configuration placeholders where needed. Do not put actual secrets in it.

Explain how to generate ENCRYPTION_KEY securely.

Ensure local development can receive the key through an appropriate local Worker secret mechanism without committing it.

---

# 36. Final acceptance criteria

The application should not be considered complete until the following are true:

- The frontend builds successfully.
- The Worker builds successfully.
- The application deploys to Cloudflare.
- D1 migrations execute successfully.
- R2 uploads work.
- Background jobs execute.
- Credentials are encrypted and decrypted correctly.
- No plaintext secrets leak through APIs or logs.
- OAuth state validation works.
- Workspace isolation is tested.
- At least one complete publishing integration works end-to-end.
- Multiple connected accounts can be managed.
- Scheduled posts are actually published through the provider API.
- Publishing failures are recorded accurately.
- The inbox can receive and send messages through at least one real supported channel.
- A visual automation can be created, saved, published, and executed.
- Delayed automation execution resumes correctly.
- Comment automation works where the relevant platform permissions permit it.
- Platform limitations are accurately displayed.
- The application has no critical fake or inert controls.
- The UI consistently follows Kumo design principles.
- The project has useful developer documentation.

---

# 37. How you should work

Before writing large amounts of code:

1. Inspect the existing repository.
2. Identify the existing framework and deployment setup.
3. Inspect the current Cloudflare bindings and configuration.
4. Review the current Kumo documentation and component APIs.
5. Research the current official developer documentation for each target platform.
6. Identify which APIs require application review, business verification, permissions, or special access.
7. Design the architecture and database schema.
8. Produce a phased implementation checklist.

Then begin implementation.

Work directly in the repository.

Do not stop after generating an architecture document.

Do not ask me to manually implement individual backend functions.

When a feature is too large to complete in one pass, finish a coherent, working phase and clearly document what remains.

After each phase:

- Run type checking.
- Run linting.
- Run relevant tests.
- Fix build errors.
- Verify the implementation.
- Update the documentation.
- Update the completion checklist.

Do not silently skip failed tests.

If you encounter a platform API limitation, implement the adapter capability correctly, explain the limitation in the interface, and move on to the next supported capability.

**Final objective:** Deliver a unified, modular, production-oriented social media management platform with a genuinely functional native ManyChat alternative, built around Cloudflare Workers and secured through dashboard-managed encrypted credentials, with only ENCRYPTION_KEY manually configured as an application encryption secret.
