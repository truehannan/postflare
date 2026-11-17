# Automation engine

Postflare includes a native ManyChat-style visual automation system.

## Editor

- Built with **React Flow** (`@xyflow/react`) at `/automations/builder/:id`.
- Node palette, drag-and-drop canvas, minimap, zoom/pan, per-node config panel.
- Flows are stored as **versioned, validated JSON** (`automation_versions`), not
  as the canvas layout. Publishing validates node id uniqueness, edge integrity,
  and the presence of a trigger/start node.

## Node catalog

`shared/automation.ts` defines the node registry with categories and
configuration schemas:

- **Triggers** — Instagram DM, Facebook/WhatsApp/Telegram message, comment,
  keyword, contact created, webhook, schedule.
- **Messages** — text, image, quick replies.
- **Logic** — if/else, keyword, random split, delay, business hours.
- **Contact** — add/remove tag, set custom field, assign conversation.
- **Actions** — webhook, HTTP request, start another automation, notify team.
- **AI** — response, intent, human handoff (requires a configured AI provider).
- **Flow** — start, end, stop.

## Execution

1. A trigger event resolves the automation's published version.
2. An `automation_executions` row is created with its input context.
3. The server-side interpreter walks the flow graph, evaluating conditions and
   executing node handlers in order (bounded by `MAX_STEPS` to prevent loops).
4. **Delay nodes** persist a `automation_scheduled_resumes` row and set the
   execution to `waiting`; the cron sweep resumes it later. A Worker request is
   never held open for a delay.
5. Every node records a step in `automation_execution_steps` for expandable
   execution history.

## Comment automation

The `instagram-comment-to-dm` template demonstrates the ManyChat-style flow:
match a keyword on a comment → tag the contact → send a private reply where the
platform permits → start a follow-up. Messaging windows and anti-spam rules are
respected; Postflare never promises a DM to commenters when the platform
restricts private replies.

## Templates

`shared/automation.ts` ships editable templates: Instagram comment-to-DM,
Telegram welcome bot, WhatsApp lead qualification, and FAQ automation. Use them
as starting points from the Automations page.