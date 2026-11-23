/**
 * Postflare — automation node & template catalog (shared).
 * The simple editor renders these node types; the Worker executes them.
 */

import type { FlowDefinition, FlowEdge, FlowNode } from "./types";

export type AutomationNodeCategory = "trigger" | "message" | "logic" | "contact" | "action" | "ai" | "flow";

export interface NodeConfigField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "switch" | "secret";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  description?: string;
}

export interface AutomationNodeType {
  type: string;
  label: string;
  category: AutomationNodeCategory;
  description: string;
  /** Output handle labels; an empty array means a terminal node. */
  outputs: string[];
  config: NodeConfigField[];
  /** Only trigger nodes may be roots. */
  isTrigger?: boolean;
  /** Nodes that can only appear as a root trigger. */
  isTerminal?: boolean;
}

export const AUTOMATION_NODE_TYPES: AutomationNodeType[] = [
  // ---- Triggers -----------------------------------------------------------
  { type: "trigger.instagram_dm", label: "Instagram DM received", category: "trigger", description: "Runs when a new Instagram direct message arrives.", outputs: ["Next"], config: [{ key: "accountId", label: "Account", type: "text", required: true }], isTrigger: true },
  { type: "trigger.facebook_message", label: "Facebook message received", category: "trigger", description: "Runs on a new Messenger message.", outputs: ["Next"], config: [{ key: "accountId", label: "Page", type: "text", required: true }], isTrigger: true },
  { type: "trigger.whatsapp_message", label: "WhatsApp message received", category: "trigger", description: "Runs on an incoming WhatsApp message.", outputs: ["Next"], config: [{ key: "accountId", label: "Account", type: "text", required: true }], isTrigger: true },
  { type: "trigger.telegram_message", label: "Telegram message received", category: "trigger", description: "Runs on an incoming Telegram message.", outputs: ["Next"], config: [{ key: "accountId", label: "Bot", type: "text", required: true }], isTrigger: true },
  { type: "trigger.comment", label: "Comment received", category: "trigger", description: "Runs when a comment is posted on a selected post.", outputs: ["Next"], config: [{ key: "accountId", label: "Account", type: "text", required: true }, { key: "postId", label: "Post ID", type: "text", required: true }], isTrigger: true },
  { type: "trigger.keyword", label: "Keyword detected", category: "trigger", description: "Runs when an inbound message matches a keyword.", outputs: ["Next"], config: [{ key: "keywords", label: "Keywords (comma separated)", type: "text", required: true }, { key: "match", label: "Match", type: "select", options: [{ value: "contains", label: "Contains" }, { value: "exact", label: "Exact" }] }], isTrigger: true },
  { type: "trigger.contact_created", label: "Contact created", category: "trigger", description: "Runs when a new contact is created.", outputs: ["Next"], config: [], isTrigger: true },
  { type: "trigger.webhook", label: "Webhook received", category: "trigger", description: "Runs when the automation's webhook URL is called.", outputs: ["Next"], config: [], isTrigger: true },
  { type: "trigger.schedule", label: "Schedule triggered", category: "trigger", description: "Runs on a recurring schedule.", outputs: ["Next"], config: [{ key: "cron", label: "Cron expression", type: "text", required: true }], isTrigger: true },

  // ---- Messages -----------------------------------------------------------
  { type: "message.text", label: "Send text message", category: "message", description: "Sends a text message to the contact.", outputs: ["Next"], config: [{ key: "text", label: "Message", type: "textarea", required: true, description: "Use {{variables}} for dynamic values." }] },
  { type: "message.image", label: "Send image", category: "message", description: "Sends an image.", outputs: ["Next"], config: [{ key: "url", label: "Image URL", type: "text", required: true }] },
  { type: "message.quick_replies", label: "Send quick replies", category: "message", description: "Sends a message with quick-reply buttons.", outputs: ["Next"], config: [{ key: "text", label: "Message", type: "textarea", required: true }, { key: "options", label: "Buttons (one per line)", type: "textarea", required: true }] },

  // ---- Logic --------------------------------------------------------------
  { type: "logic.condition", label: "If / else", category: "logic", description: "Branches on a variable comparison.", outputs: ["True", "False"], config: [{ key: "field", label: "Variable", type: "text", required: true }, { key: "operator", label: "Operator", type: "select", options: [{ value: "eq", label: "equals" }, { value: "neq", label: "not equals" }, { value: "contains", label: "contains" }, { value: "gt", label: "greater than" }] }, { key: "value", label: "Value", type: "text", required: true }] },
  { type: "logic.keyword", label: "Keyword condition", category: "logic", description: "Branches on message keyword match.", outputs: ["Matched", "Not matched"], config: [{ key: "keywords", label: "Keywords", type: "text", required: true }] },
  { type: "logic.random", label: "Random split", category: "logic", description: "Randomly routes between two branches.", outputs: ["A", "B"], config: [{ key: "percentageA", label: "Percent to A", type: "number", required: true }] },
  { type: "logic.delay", label: "Wait", category: "logic", description: "Pauses the flow for a duration (resumed by a scheduled mechanism).", outputs: ["Next"], config: [{ key: "minutes", label: "Minutes", type: "number", required: true }] },
  { type: "logic.business_hours", label: "Business hours condition", category: "logic", description: "Branches on whether it is within business hours.", outputs: ["In hours", "Outside"], config: [{ key: "timezone", label: "Timezone", type: "text", required: true }, { key: "start", label: "Start (HH:mm)", type: "text", required: true }, { key: "end", label: "End (HH:mm)", type: "text", required: true }] },

  // ---- Contact ------------------------------------------------------------
  { type: "contact.add_tag", label: "Add tag", category: "contact", description: "Adds a tag to the contact.", outputs: ["Next"], config: [{ key: "tag", label: "Tag", type: "text", required: true }] },
  { type: "contact.remove_tag", label: "Remove tag", category: "contact", description: "Removes a tag from the contact.", outputs: ["Next"], config: [{ key: "tag", label: "Tag", type: "text", required: true }] },
  { type: "contact.set_field", label: "Update custom field", category: "contact", description: "Sets a custom field value.", outputs: ["Next"], config: [{ key: "field", label: "Field", type: "text", required: true }, { key: "value", label: "Value", type: "text", required: true }] },
  { type: "contact.assign", label: "Assign conversation", category: "contact", description: "Assigns the conversation to a team member.", outputs: ["Next"], config: [{ key: "userId", label: "User ID", type: "text", required: true }] },

  // ---- Actions ------------------------------------------------------------
  { type: "action.webhook", label: "Send webhook", category: "action", description: "POSTs the flow context to a URL.", outputs: ["Next"], config: [{ key: "url", label: "URL", type: "text", required: true }, { key: "secret", label: "Signing secret", type: "secret", required: false }] },
  { type: "action.http", label: "HTTP request", category: "action", description: "Calls an external API.", outputs: ["Next"], config: [{ key: "url", label: "URL", type: "text", required: true }, { key: "method", label: "Method", type: "select", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }] }, { key: "body", label: "JSON body", type: "textarea", required: false }] },
  { type: "action.trigger_automation", label: "Start another automation", category: "action", description: "Triggers another automation.", outputs: ["Next"], config: [{ key: "automationId", label: "Automation", type: "text", required: true }] },
  { type: "action.notify_team", label: "Notify team member", category: "action", description: "Sends an in-app notification.", outputs: ["Next"], config: [{ key: "userId", label: "User ID", type: "text", required: true }, { key: "message", label: "Message", type: "textarea", required: true }] },

  // ---- AI -----------------------------------------------------------------
  { type: "ai.response", label: "AI response", category: "ai", description: "Generates a response using a configured AI provider.", outputs: ["Next"], config: [{ key: "prompt", label: "Prompt", type: "textarea", required: true, description: "Use {{message}} for the inbound message." }] },
  { type: "ai.intent", label: "Intent detection", category: "ai", description: "Classifies the message into an intent and routes.", outputs: ["Matched", "Other"], config: [{ key: "intent", label: "Intent to detect", type: "text", required: true }] },
  { type: "ai.handoff", label: "Route to human", category: "ai", description: "Flags the conversation for human review.", outputs: ["Next"], config: [] },

  // ---- Flow control -------------------------------------------------------
  { type: "flow.start", label: "Start", category: "flow", description: "Entry point of the flow.", outputs: ["Next"], config: [], isTrigger: true },
  { type: "flow.end", label: "End", category: "flow", description: "Ends the flow.", outputs: [], config: [], isTerminal: true },
  { type: "flow.stop", label: "Stop automation", category: "flow", description: "Stops the current execution.", outputs: [], config: [], isTerminal: true },
];

export function getNodeType(type: string): AutomationNodeType | undefined {
  return AUTOMATION_NODE_TYPES.find((n) => n.type === type);
}

// ---------------------------------------------------------------------------
// Simple (linear) automation model — the editor's source of truth.
// An automation is one trigger plus an ordered list of steps; any step can
// carry a keyword guard ("only run when the message contains …"). The model
// compiles into the graph format the execution engine already runs.
// ---------------------------------------------------------------------------

export type GuardMatch = "contains" | "exact";

export interface StepGuard {
  /** Comma-separated keywords. */
  keywords: string;
  match: GuardMatch;
}

export interface SimpleStep {
  /** UI-only key. */
  id: string;
  /** Node type (message.text, contact.add_tag, logic.delay, …). */
  type: string;
  config: Record<string, unknown>;
  /** Optional keyword guard — the step only runs when the guard matches. */
  guard?: StepGuard;
}

export interface SimpleAutomation {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: SimpleStep[];
}

let compileCounter = 0;

/**
 * Compile the linear model into a graph definition (nodes + edges) that the
 * existing execution engine interprets unchanged. Guards become keyword
 * nodes whose "not matched" edge skips the guarded step.
 */
export function compileSimpleFlow(simple: SimpleAutomation): FlowDefinition {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let y = 0;

  const addNode = (type: string, data: Record<string, unknown>): string => {
    compileCounter += 1;
    const id = `n${compileCounter}`;
    nodes.push({ id, type, position: { x: 40, y }, data });
    y += 120;
    return id;
  };
  const link = (source: string, target: string, handle?: string) => {
    edges.push({ id: `e${edges.length + 1}`, source, target, sourceHandle: handle ?? null, targetHandle: null });
  };

  const triggerId = addNode(simple.triggerType, simple.triggerConfig ?? {});

  // Walk the steps, wiring the main path as we go. A guard's "not matched"
  // edge is deferred until we know the next step's entry node id.
  interface PlannedGuard {
    guardId: string;
    stepIndex: number;
  }
  const stepEntryIds: string[] = [];
  const plannedGuards: PlannedGuard[] = [];

  let prev = triggerId;
  simple.steps.forEach((step, i) => {
    if (step.guard) {
      const guardId = addNode("logic.keyword", { keywords: step.guard.keywords, match: step.guard.match });
      link(prev, guardId);
      const stepId = addNode(step.type, step.config ?? {});
      link(guardId, stepId, "matched");
      stepEntryIds.push(guardId);
      plannedGuards.push({ guardId, stepIndex: i });
      prev = stepId;
    } else {
      const stepId = addNode(step.type, step.config ?? {});
      link(prev, stepId);
      stepEntryIds.push(stepId);
      prev = stepId;
    }
  });

  const endId = addNode("flow.end", {});
  link(prev, endId);

  for (const g of plannedGuards) {
    const nextIndex = g.stepIndex + 1;
    const target = nextIndex < stepEntryIds.length ? stepEntryIds[nextIndex] : endId;
    link(g.guardId, target, "not-matched");
  }

  return { nodes, edges };
}

export interface LinearizeResult {
  simple: SimpleAutomation;
  /** Honest notes when the graph couldn't be fully represented. */
  warnings: string[];
}

/**
 * Convert an existing graph definition into the linear model so legacy
 * (canvas-built) automations open in the simple editor. Best effort: the
 * recognized guard pattern (condition → matched → step, both paths rejoining)
 * becomes a guarded step; anything else is followed along its first edge with
 * a warning.
 */
export function tryLinearizeFlow(def: FlowDefinition): LinearizeResult {
  const warnings: string[] = [];
  const nodes = new Map(def.nodes.map((n) => [n.id, n] as const));
  const start = def.nodes.find((n) => n.type.startsWith("trigger."));
  if (!start) {
    return {
      simple: { triggerType: "trigger.keyword", triggerConfig: { keywords: "hi" }, steps: [] },
      warnings: ["No trigger node was found in the saved flow."],
    };
  }

  const outgoing = new Map<string, FlowEdge[]>();
  for (const e of def.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e);
    outgoing.set(e.source, list);
  }
  const firstOut = (id: string): FlowEdge | undefined => (outgoing.get(id) ?? [])[0];

  const steps: SimpleStep[] = [];
  let current: string | undefined = start.id;
  let stepKey = 0;

  while (current) {
    const node = nodes.get(current);
    if (!node) break;
    if (node.type === "flow.end" || node.type === "flow.stop") break;
    if (node.type.startsWith("trigger.")) {
      current = firstOut(node.id)?.target;
      continue;
    }

    const edges = outgoing.get(node.id) ?? [];
    if (node.type === "logic.keyword" || node.type === "logic.condition") {
      const matched = edges.find(
        (e) => (e.sourceHandle ?? "").toLowerCase() === "matched" || (e.sourceHandle ?? "").toLowerCase() === "true",
      );
      const other = edges.find((e) => e !== matched);
      const stepNode = matched ? nodes.get(matched.target) : undefined;
      const stepAfter = stepNode ? firstOut(stepNode.id)?.target : undefined;
      if (edges.length === 2 && stepNode && other && stepAfter === other.target && !stepNode.type.startsWith("logic.")) {
        // Recognized guard → step pattern.
        stepKey += 1;
        steps.push({
          id: `s${stepKey}`,
          type: stepNode.type,
          config: (stepNode.data ?? {}) as Record<string, unknown>,
          guard: {
            keywords: String((node.data as Record<string, unknown>)?.keywords ?? ""),
            match: (((node.data as Record<string, unknown>)?.match as GuardMatch) ?? "contains"),
          },
        });
        current = stepAfter;
        continue;
      }
      warnings.push("A branch step could not be represented as a simple condition and was dropped.");
      current = matched?.target ?? edges[0]?.target;
      continue;
    }

    stepKey += 1;
    steps.push({ id: `s${stepKey}`, type: node.type, config: (node.data ?? {}) as Record<string, unknown> });
    if (edges.length > 1) {
      warnings.push(`A step had multiple outgoing paths; only the first was kept.`);
    }
    current = edges[0]?.target;
  }

  return {
    simple: {
      triggerType: start.type,
      triggerConfig: (start.data ?? {}) as Record<string, unknown>,
      steps,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
// Templates are defined in the simple (linear) format and compiled into the
// graph format on save/attach — one source of truth.

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  /** Postflare platform ids this template is relevant to; empty = generic. */
  platforms: string[];
  simple: SimpleAutomation;
}

const commentToDm: AutomationTemplate = {
  id: "instagram-comment-to-dm",
  name: "Instagram comment-to-DM",
  description: "Reply to commenters who use a specific keyword, tag them, and start a follow-up.",
  triggerType: "trigger.comment",
  platforms: ["instagram"],
  simple: {
    triggerType: "trigger.comment",
    triggerConfig: { accountId: "", postId: "" },
    steps: [
      {
        id: "s1",
        type: "contact.add_tag",
        config: { tag: "pricing-interest" },
        guard: { keywords: "PRICE, PRICING", match: "contains" },
      },
      {
        id: "s2",
        type: "message.text",
        config: { text: "Thanks for your interest! Here's our pricing…" },
      },
    ],
  },
};

const welcomeBot: AutomationTemplate = {
  id: "telegram-welcome-bot",
  name: "Telegram welcome bot",
  description: "Send a welcome message and offer quick replies to new Telegram chats.",
  triggerType: "trigger.telegram_message",
  platforms: ["telegram"],
  simple: {
    triggerType: "trigger.telegram_message",
    triggerConfig: {},
    steps: [
      { id: "s1", type: "message.text", config: { text: "👋 Welcome! How can we help today?" } },
      { id: "s2", type: "message.quick_replies", config: { text: "Choose an option:", options: "Pricing\nSupport\nTalk to a human" } },
    ],
  },
};

const leadQualification: AutomationTemplate = {
  id: "whatsapp-lead-qualification",
  name: "WhatsApp lead qualification",
  description: "Ask a qualification question and tag the contact based on their answer.",
  triggerType: "trigger.whatsapp_message",
  platforms: ["whatsapp"],
  simple: {
    triggerType: "trigger.whatsapp_message",
    triggerConfig: {},
    steps: [
      { id: "s1", type: "message.text", config: { text: "Are you interested in a demo? Reply YES or NO." } },
      {
        id: "s2",
        type: "contact.add_tag",
        config: { tag: "hot-lead" },
        guard: { keywords: "yes", match: "contains" },
      },
    ],
  },
};

const faqAutomation: AutomationTemplate = {
  id: "faq-automation",
  name: "FAQ automation",
  description: "Answer common questions with a keyword-based router.",
  triggerType: "trigger.keyword",
  platforms: [],
  simple: {
    triggerType: "trigger.keyword",
    triggerConfig: { keywords: "hours, price, refund" },
    steps: [
      {
        id: "s1",
        type: "message.text",
        config: { text: "We're open 9am–6pm, Monday to Friday." },
        guard: { keywords: "hours", match: "contains" },
      },
    ],
  },
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  commentToDm,
  welcomeBot,
  leadQualification,
  faqAutomation,
];
