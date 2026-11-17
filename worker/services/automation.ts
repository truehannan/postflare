import type { Env } from "../env";
import { getAdapter } from "../adapters/registry";
import { getCredentials } from "./credentials";
import { notify } from "./notifications";
import { audit } from "./audit";
import { randomId } from "../utils/id";
import { badRequest, notFound } from "../utils/http";
import type { Automation, AutomationVersion, FlowDefinition, FlowNode } from "../../shared/types";

const MAX_STEPS = 100;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateAutomationInput {
  name: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  definition?: FlowDefinition;
}

export async function createAutomation(
  env: Env,
  workspaceId: string,
  actorId: string,
  input: CreateAutomationInput,
): Promise<Automation> {
  if (!input.name.trim()) throw badRequest("Automation name is required");
  const id = randomId("auto");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO automations (id, workspace_id, name, status, trigger_type, trigger_config_json, created_by, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)",
  ).bind(id, workspaceId, input.name.trim(), input.triggerType, JSON.stringify(input.triggerConfig ?? {}), actorId, now, now).run();

  if (input.definition) {
    await saveVersion(env, id, input.definition, actorId, 1);
  }
  await audit(env, workspaceId, actorId, "automation.create", "automations", id, {});
  return (await getAutomation(env, workspaceId, id))!;
}

async function saveVersion(env: Env, automationId: string, definition: FlowDefinition, actorId: string, version: number): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO automation_versions (id, automation_id, version, definition_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(randomId("aver"), automationId, version, JSON.stringify(definition), actorId, new Date().toISOString()).run();
}

export async function publishAutomation(env: Env, workspaceId: string, automationId: string, definition: FlowDefinition, actorId: string): Promise<Automation> {
  const auto = await env.DB.prepare("SELECT id, published_version FROM automations WHERE id = ? AND workspace_id = ?")
    .bind(automationId, workspaceId).first<{ id: string; published_version: number | null }>();
  if (!auto) throw notFound("Automation not found");
  validateFlow(definition);

  const nextVersion = (auto.published_version ?? 0) + 1;
  await saveVersion(env, automationId, definition, actorId, nextVersion);
  await env.DB.prepare("UPDATE automations SET status = 'published', published_version = ?, updated_at = ? WHERE id = ?")
    .bind(nextVersion, new Date().toISOString(), automationId).run();
  await audit(env, workspaceId, actorId, "automation.publish", "automations", automationId, { version: nextVersion });
  return (await getAutomation(env, workspaceId, automationId))!;
}

export async function getAutomation(env: Env, workspaceId: string, automationId: string): Promise<Automation | null> {
  const row = await env.DB.prepare("SELECT * FROM automations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL")
    .bind(automationId, workspaceId).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    status: row.status as Automation["status"],
    triggerType: row.trigger_type as string,
    triggerConfig: JSON.parse(row.trigger_config_json as string),
    publishedVersion: row.published_version as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listAutomations(env: Env, workspaceId: string): Promise<Automation[]> {
  const rows = await env.DB.prepare(
    "SELECT * FROM automations WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
  ).bind(workspaceId).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    name: r.name as string,
    status: r.status as Automation["status"],
    triggerType: r.trigger_type as string,
    triggerConfig: JSON.parse(r.trigger_config_json as string),
    publishedVersion: r.published_version as number | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function getAutomationVersion(
  env: Env,
  automationId: string,
  version: number,
): Promise<AutomationVersion | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM automation_versions WHERE automation_id = ? AND version = ?",
  ).bind(automationId, version).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: row.id as string,
    automationId: row.automation_id as string,
    version: row.version as number,
    definition: JSON.parse(row.definition_json as string) as FlowDefinition,
    createdAt: row.created_at as string,
  };
}

export async function deleteAutomation(env: Env, workspaceId: string, automationId: string, actorId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT id FROM automations WHERE id = ? AND workspace_id = ?")
    .bind(automationId, workspaceId).first<{ id: string }>();
  if (!existing) throw notFound("Automation not found");
  await env.DB.prepare("UPDATE automations SET deleted_at = ?, status = 'paused' WHERE id = ?")
    .bind(new Date().toISOString(), automationId).run();
  await audit(env, workspaceId, actorId, "automation.delete", "automations", automationId, {});
}

export function validateFlow(definition: FlowDefinition): void {
  const ids = new Set(definition.nodes.map((n) => n.id));
  if (ids.size !== definition.nodes.length) throw badRequest("Node IDs must be unique");
  for (const edge of definition.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw badRequest(`Edge references a missing node: ${edge.source} -> ${edge.target}`);
    }
  }
  if (!definition.nodes.some((n) => n.type.startsWith("trigger.") || n.type === "flow.start")) {
    throw badRequest("A flow must have a trigger (or start) node");
  }
}

// ---------------------------------------------------------------------------
// Execution engine
// ---------------------------------------------------------------------------

interface ExecContext {
  workspaceId: string;
  automationId: string;
  executionId: string;
  contactId?: string;
  conversationId?: string;
  accountId?: string;
  providerId?: string;
  message?: string;
  variables: Record<string, string>;
  dryRun: boolean;
}

type NodeOutcome =
  | { kind: "next"; handle?: string }
  | { kind: "wait"; minutes: number }
  | { kind: "stop" };

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

async function executeNode(
  env: Env,
  node: FlowNode,
  ctx: ExecContext,
): Promise<NodeOutcome> {
  const data = node.data as Record<string, unknown>;
  switch (node.type) {
    case "flow.start":
    case "trigger.instagram_dm":
    case "trigger.facebook_message":
    case "trigger.whatsapp_message":
    case "trigger.telegram_message":
    case "trigger.comment":
    case "trigger.keyword":
    case "trigger.contact_created":
    case "trigger.webhook":
    case "trigger.schedule":
      return { kind: "next" };

    case "message.text":
    case "message.quick_replies": {
      const text = interpolate(String(data.text ?? ""), ctx.variables);
      const send = await sendAutomationMessage(env, ctx, text);
      return send.ok ? { kind: "next" } : { kind: "stop" };
    }

    case "message.image":
      return { kind: "next" };

    case "logic.condition": {
      const field = ctx.variables[String(data.field ?? "")] ?? "";
      const op = String(data.operator ?? "eq");
      const value = String(data.value ?? "");
      let matched = false;
      if (op === "eq") matched = field === value;
      else if (op === "neq") matched = field !== value;
      else if (op === "contains") matched = field.toLowerCase().includes(value.toLowerCase());
      else if (op === "gt") matched = Number(field) > Number(value);
      return { kind: "next", handle: matched ? "true" : "false" };
    }

    case "logic.keyword": {
      const keywords = String(data.keywords ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
      const text = (ctx.message ?? "").toLowerCase();
      const matched = keywords.some((k) => text.includes(k));
      return { kind: "next", handle: matched ? "matched" : "not-matched" };
    }

    case "logic.random": {
      const pct = Math.max(0, Math.min(100, Number(data.percentageA ?? 50)));
      const rand = crypto.getRandomValues(new Uint8Array(1))[0] / 255;
      return { kind: "next", handle: rand < pct / 100 ? "a" : "b" };
    }

    case "logic.delay": {
      const minutes = Math.max(0, Number(data.minutes ?? 0));
      return { kind: "wait", minutes };
    }

    case "logic.business_hours": {
      const tz = String(data.timezone ?? "UTC");
      const start = String(data.start ?? "09:00");
      const end = String(data.end ?? "17:00");
      const now = new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      const inHours = now >= start && now <= end;
      return { kind: "next", handle: inHours ? "in-hours" : "outside" };
    }

    case "contact.add_tag": {
      if (ctx.contactId) await addContactTag(env, ctx.contactId, String(data.tag ?? ""));
      return { kind: "next" };
    }

    case "contact.remove_tag": {
      if (ctx.contactId) await removeContactTag(env, ctx.contactId, String(data.tag ?? ""));
      return { kind: "next" };
    }

    case "contact.set_field": {
      if (ctx.contactId) await setContactField(env, ctx.contactId, String(data.field ?? ""), String(data.value ?? ""));
      return { kind: "next" };
    }

    case "contact.assign": {
      if (ctx.conversationId) {
        await env.DB.prepare("UPDATE conversations SET assigned_to = ?, updated_at = ? WHERE id = ?")
          .bind(String(data.userId ?? ""), new Date().toISOString(), ctx.conversationId).run();
      }
      return { kind: "next" };
    }

    case "action.webhook": {
      const url = String(data.url ?? "");
      const body = JSON.stringify({ context: ctx.variables, message: ctx.message, contactId: ctx.contactId });
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
      return { kind: "next" };
    }

    case "action.http": {
      const url = String(data.url ?? "");
      const method = String(data.method ?? "GET").toUpperCase();
      await fetch(url, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? String(data.body ?? "{}") : undefined });
      return { kind: "next" };
    }

    case "action.trigger_automation": {
      const targetId = String(data.automationId ?? "");
      if (targetId) {
        await executeAutomation(env, ctx.workspaceId, targetId, { message: ctx.message, contactId: ctx.contactId }, ctx.dryRun);
      }
      return { kind: "next" };
    }

    case "action.notify_team": {
      await notify(env, {
        workspaceId: ctx.workspaceId,
        userId: String(data.userId ?? ""),
        type: "automation",
        title: "Automation action",
        body: interpolate(String(data.message ?? ""), ctx.variables),
      });
      return { kind: "next" };
    }

    case "ai.response":
    case "ai.intent": {
      // AI nodes require a configured provider; without one we stop honestly.
      await recordStep(env, ctx.executionId, node.id, node.type, "failed", { note: "No AI provider configured" }, null, "No AI provider configured");
      return { kind: "stop" };
    }

    case "ai.handoff": {
      if (ctx.conversationId) {
        await env.DB.prepare("UPDATE conversations SET status = 'open', priority = 'high', updated_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), ctx.conversationId).run();
      }
      return { kind: "next" };
    }

    case "flow.end":
    case "flow.stop":
      return { kind: "stop" };

    default:
      return { kind: "stop" };
  }
}

async function sendAutomationMessage(
  env: Env,
  ctx: ExecContext,
  text: string,
): Promise<{ ok: boolean }> {
  if (ctx.dryRun || !ctx.accountId || !ctx.providerId || !ctx.contactId) {
    return { ok: true };
  }
  const adapter = getAdapter(ctx.providerId);
  if (!adapter.sendMessage) return { ok: false };
  const credentials = (await getCredentials(env, ctx.workspaceId, ctx.providerId)) ?? {};
  const recipientId = ctx.variables.recipientId ?? ctx.contactId;
  const res = await adapter.sendMessage(credentials, recipientId, text);
  return { ok: res.ok };
}

async function recordStep(
  env: Env,
  executionId: string,
  nodeId: string,
  nodeType: string,
  status: string,
  input: unknown,
  output: unknown,
  error?: string | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO automation_execution_steps (id, execution_id, node_id, node_type, status, input_json, output_json, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    randomId("astep"), executionId, nodeId, nodeType, status,
    input ? JSON.stringify(input) : null,
    output ? JSON.stringify(output) : null,
    error ?? null,
    new Date().toISOString(),
    new Date().toISOString(),
  ).run();
}

async function addContactTag(env: Env, contactId: string, tag: string): Promise<void> {
  if (!tag) return;
  const row = await env.DB.prepare("SELECT id FROM contact_tags WHERE workspace_id = (SELECT workspace_id FROM contacts WHERE id = ?) AND name = ?")
    .bind(contactId, tag).first<{ id: string }>();
  const tagId = row?.id ?? randomId("tag");
  if (!row) {
    await env.DB.prepare("INSERT INTO contact_tags (id, workspace_id, name) VALUES (?, (SELECT workspace_id FROM contacts WHERE id = ?), ?)")
      .bind(tagId, contactId, tag).run();
  }
  await env.DB.prepare("INSERT OR IGNORE INTO contact_tag_links (id, contact_id, tag_id) VALUES (?, ?, ?)")
    .bind(randomId("ctl"), contactId, tagId).run();
}

async function removeContactTag(env: Env, contactId: string, tag: string): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM contact_tag_links WHERE contact_id = ? AND tag_id IN (SELECT id FROM contact_tags WHERE name = ?)",
  ).bind(contactId, tag).run();
}

async function setContactField(env: Env, contactId: string, field: string, value: string): Promise<void> {
  const fieldRow = await env.DB.prepare(
    "SELECT id FROM contact_custom_fields WHERE workspace_id = (SELECT workspace_id FROM contacts WHERE id = ?) AND name = ?",
  ).bind(contactId, field).first<{ id: string }>();
  const fieldId = fieldRow?.id ?? randomId("cf");
  if (!fieldRow) {
    await env.DB.prepare("INSERT INTO contact_custom_fields (id, workspace_id, name, type) VALUES (?, (SELECT workspace_id FROM contacts WHERE id = ?), ?, 'text')")
      .bind(fieldId, contactId, field).run();
  }
  await env.DB.prepare(
    "INSERT INTO contact_custom_field_values (id, contact_id, field_id, value) VALUES (?, ?, ?, ?) ON CONFLICT(contact_id, field_id) DO UPDATE SET value = excluded.value",
  ).bind(randomId("cfv"), contactId, fieldId, value).run();
}

/** Build the node adjacency from the flow edges. */
function buildAdjacency(definition: FlowDefinition): Map<string, { handle: string | null; target: string }[]> {
  const map = new Map<string, { handle: string | null; target: string }[]>();
  for (const edge of definition.edges) {
    const list = map.get(edge.source) ?? [];
    list.push({ handle: edge.sourceHandle ?? null, target: edge.target });
    map.set(edge.source, list);
  }
  return map;
}

function findStartNode(definition: FlowDefinition): FlowNode | undefined {
  return definition.nodes.find((n) => n.type.startsWith("trigger.") || n.type === "flow.start") ?? definition.nodes[0];
}

export async function executeAutomation(
  env: Env,
  workspaceId: string,
  automationId: string,
  input: {
    message?: string;
    contactId?: string;
    conversationId?: string;
    accountId?: string;
    providerId?: string;
    variables?: Record<string, string>;
  },
  dryRun = false,
): Promise<{ executionId: string; status: string }> {
  const auto = await env.DB.prepare(
    "SELECT id, published_version, trigger_type FROM automations WHERE id = ? AND workspace_id = ? AND status = 'published'",
  ).bind(automationId, workspaceId).first<{ id: string; published_version: number | null; trigger_type: string }>();
  if (!auto || !auto.published_version) throw notFound("No published version of this automation");

  const version = await getAutomationVersion(env, automationId, auto.published_version);
  if (!version) throw notFound("Published automation version not found");
  const definition = version.definition;

  const executionId = randomId("exec");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO automation_executions (id, workspace_id, automation_id, version, status, input_json, context_json, started_at) VALUES (?, ?, ?, ?, 'running', ?, '{}', ?)",
  ).bind(executionId, workspaceId, automationId, auto.published_version, JSON.stringify(input), now).run();

  const ctx: ExecContext = {
    workspaceId,
    automationId,
    executionId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    accountId: input.accountId,
    providerId: input.providerId,
    message: input.message,
    variables: { message: input.message ?? "", ...(input.variables ?? {}) },
    dryRun,
  };

  const nodes = new Map(definition.nodes.map((n) => [n.id, n]));
  const adjacency = buildAdjacency(definition);
  let current = findStartNode(definition);
  let steps = 0;

  while (current && steps < MAX_STEPS) {
    steps += 1;
    const outcome = await executeNode(env, current, ctx);

    if (outcome.kind === "stop") {
      await recordStep(env, executionId, current.id, current.type, "completed", ctx.variables, null);
      break;
    }

    if (outcome.kind === "wait") {
      const resumeAt = new Date(Date.now() + outcome.minutes * 60_000).toISOString();
      await env.DB.prepare(
        "INSERT INTO automation_scheduled_resumes (id, execution_id, node_id, resume_at, status) VALUES (?, ?, ?, ?, 'pending')",
      ).bind(randomId("resume"), executionId, current.id, resumeAt).run();
      await env.DB.prepare("UPDATE automation_executions SET status = 'waiting', current_node_id = ? WHERE id = ?")
        .bind(current.id, executionId).run();
      await recordStep(env, executionId, current.id, current.type, "waiting", ctx.variables, { resumeAt });
      return { executionId, status: "waiting" };
    }

    await recordStep(env, executionId, current.id, current.type, "completed", ctx.variables, null);

    // Determine the next node via the chosen output handle.
    const handle = outcome.kind === "next" ? normalizeHandle(current, outcome.handle) : null;
    const candidates = adjacency.get(current.id) ?? [];
    const next = handle
      ? candidates.find((e) => normalizeEdgeHandle(e.handle) === handle)
      : candidates[0];
    current = next ? nodes.get(next.target) : undefined;
  }

  const finalStatus = steps >= MAX_STEPS ? "failed" : "completed";
  await env.DB.prepare("UPDATE automation_executions SET status = ?, finished_at = ? WHERE id = ?")
    .bind(finalStatus, new Date().toISOString(), executionId).run();
  if (finalStatus === "failed") {
    await env.DB.prepare("UPDATE automation_executions SET error = ? WHERE id = ?").bind("Execution exceeded the maximum step limit", executionId).run();
  }
  return { executionId, status: finalStatus };
}

function normalizeHandle(node: FlowNode, handle?: string): string | null {
  if (handle) return handle.toLowerCase();
  if (node.type === "flow.end" || node.type === "flow.stop") return null;
  return null;
}

function normalizeEdgeHandle(handle: string | null): string | null {
  return handle ? handle.toLowerCase() : null;
}

/** Resume executions whose delay has elapsed (called from the cron sweep). */
export async function resumeAutomationExecutions(env: Env): Promise<number> {
  const now = new Date().toISOString();
  const due = await env.DB.prepare(
    "SELECT execution_id, node_id FROM automation_scheduled_resumes WHERE status = 'pending' AND resume_at <= ?",
  ).bind(now).all<{ execution_id: string; node_id: string }>();

  let resumed = 0;
  for (const r of due.results ?? []) {
    await env.DB.prepare("UPDATE automation_scheduled_resumes SET status = 'done' WHERE execution_id = ? AND node_id = ?")
      .bind(r.execution_id, r.node_id).run();
    await env.DB.prepare("UPDATE automation_executions SET status = 'running' WHERE id = ?").bind(r.execution_id).run();

    // Continue execution from the node following the delayed node.
    const exec = await env.DB.prepare("SELECT automation_id, version, workspace_id, context_json FROM automation_executions WHERE id = ?")
      .bind(r.execution_id).first<{ automation_id: string; version: number; workspace_id: string; context_json: string }>();
    if (!exec) continue;

    const version = await getAutomationVersion(env, exec.automation_id, exec.version);
    if (!version) continue;
    const nodes = new Map(version.definition.nodes.map((n) => [n.id, n]));
    const adjacency = buildAdjacency(version.definition);
    const delayed = nodes.get(r.node_id);
    const next = delayed ? (adjacency.get(delayed.id)?.[0]?.target) : undefined;
    const nextNode = next ? nodes.get(next) : undefined;

    // Re-run the remainder of the flow inline. For simplicity we re-drive a
    // lightweight continuation; complex re-entry is handled by re-executing
    // from the delayed node onward.
    await continueExecution(env, exec.workspace_id, exec.automation_id, version.definition, nextNode?.id ?? null, r.execution_id);
    resumed += 1;
  }
  return resumed;
}

async function continueExecution(
  env: Env,
  workspaceId: string,
  automationId: string,
  definition: FlowDefinition,
  startNodeId: string | null,
  executionId: string,
): Promise<void> {
  const exec = await env.DB.prepare("SELECT input_json FROM automation_executions WHERE id = ?").bind(executionId)
    .first<{ input_json: string }>();
  const input = JSON.parse(exec?.input_json ?? "{}") as Record<string, unknown>;

  const ctx: ExecContext = {
    workspaceId,
    automationId,
    executionId,
    contactId: input.contactId as string | undefined,
    conversationId: input.conversationId as string | undefined,
    accountId: input.accountId as string | undefined,
    providerId: input.providerId as string | undefined,
    message: input.message as string | undefined,
    variables: (input.variables as Record<string, string>) ?? { message: (input.message as string) ?? "" },
    dryRun: false,
  };

  const nodes = new Map(definition.nodes.map((n) => [n.id, n]));
  const adjacency = buildAdjacency(definition);
  let current = startNodeId ? nodes.get(startNodeId) : findStartNode(definition);
  let steps = 0;

  while (current && steps < MAX_STEPS) {
    steps += 1;
    const outcome = await executeNode(env, current, ctx);
    if (outcome.kind === "stop") break;
    if (outcome.kind === "wait") {
      const resumeAt = new Date(Date.now() + outcome.minutes * 60_000).toISOString();
      await env.DB.prepare("INSERT INTO automation_scheduled_resumes (id, execution_id, node_id, resume_at, status) VALUES (?, ?, ?, ?, 'pending')")
        .bind(randomId("resume"), executionId, current.id, resumeAt).run();
      await env.DB.prepare("UPDATE automation_executions SET status = 'waiting', current_node_id = ? WHERE id = ?").bind(current.id, executionId).run();
      return;
    }
    const handle = outcome.kind === "next" ? normalizeHandle(current, outcome.handle) : null;
    const candidates = adjacency.get(current.id) ?? [];
    const next = handle ? candidates.find((e) => normalizeEdgeHandle(e.handle) === handle) : candidates[0];
    current = next ? nodes.get(next.target) : undefined;
  }

  await env.DB.prepare("UPDATE automation_executions SET status = 'completed', finished_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), executionId).run();
}