## Template-first model

The **Automations page is a template library** — templates are designs that
never run by themselves. The built-in templates (Instagram comment-to-DM,
Telegram welcome bot, WhatsApp lead qualification, FAQ) live beside your own
custom templates (create, edit, delete them there).

**The composer is where automations become real.** Attach a template to a
post and click *Customize for this post* to open the same static editor
pre-filled from the template. Those edits apply **to that post only** — the
template is never modified, so the same template can be reused with different
keywords/messages on the next post. On publish, each attached template is
instantiated, published and bound to the post (`post_automations`), with the
customized model if one was provided. Active instances (with their execution
history) are listed under *Active automations* on the Automations page.

API surface:

- `GET/POST /api/automations/templates`, `GET/PUT/DELETE /api/automations/templates/:id`
- `POST /api/posts` accepts `attachTemplates: [{ templateId, simple? }]` (the
  optional `simple` is the per-post override; step types are validated against
  the node catalog) — `attachTemplateIds` still works without overrides
- `GET /api/automations` lists active instances only (templates excluded)

## Editor

Automations are edited with a simple, static form interface — no node canvas.
An automation is **one trigger plus an ordered list of steps**:

- **When this happens** — the trigger (type + config from the node catalog).
- **Then do this** — steps run top to bottom. Each step renders its config as
  form fields, can be reordered or removed, and can carry a keyword guard
  ("only run when the message contains …", contains or exact word).
- Wait steps pause the flow and resume via the cron sweep.

The linear model (`SimpleAutomation` in `shared/automation.ts`) is the editor's
source of truth. It **compiles into the graph format** the execution engine
already runs (`compileSimpleFlow`), so both formats share one interpreter:
guards become keyword nodes whose "not matched" edge skips the guarded step.
Legacy canvas-built automations open in the editor via a best-effort
`tryLinearizeFlow` conversion (with an honest warning when branches were
dropped). Flows are stored as versioned JSON in `automation_versions` — both
the compiled graph and the simple model — so drafts never execute.

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