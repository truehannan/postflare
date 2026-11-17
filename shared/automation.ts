/**
 * Postflare — automation node & template catalog (shared).
 * The visual builder renders these node types; the Worker executes them.
 */

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
// Templates
// ---------------------------------------------------------------------------

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  definition: { nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[]; edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[] };
}

const commentToDm: AutomationTemplate = {
  id: "instagram-comment-to-dm",
  name: "Instagram comment-to-DM",
  description: "Reply to commenters who use a specific keyword, tag them, and start a follow-up.",
  triggerType: "trigger.comment",
  definition: {
    nodes: [
      { id: "n1", type: "trigger.comment", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", type: "logic.keyword", position: { x: 220, y: 0 }, data: { keywords: "PRICE, PRICING" } },
      { id: "n3", type: "contact.add_tag", position: { x: 440, y: -60 }, data: { tag: "pricing-interest" } },
      { id: "n4", type: "message.text", position: { x: 660, y: -60 }, data: { text: "Thanks for your interest! Here's our pricing…" } },
      { id: "n5", type: "flow.end", position: { x: 880, y: -60 }, data: {} },
      { id: "n6", type: "flow.end", position: { x: 440, y: 80 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "matched", targetHandle: "in" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
      { id: "e5", source: "n2", target: "n6", sourceHandle: "not-matched", targetHandle: "in" },
    ],
  },
};

const welcomeBot: AutomationTemplate = {
  id: "telegram-welcome-bot",
  name: "Telegram welcome bot",
  description: "Send a welcome message and offer quick replies to new Telegram chats.",
  triggerType: "trigger.telegram_message",
  definition: {
    nodes: [
      { id: "n1", type: "trigger.telegram_message", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", type: "message.text", position: { x: 220, y: 0 }, data: { text: "👋 Welcome! How can we help today?" } },
      { id: "n3", type: "message.quick_replies", position: { x: 440, y: 0 }, data: { text: "Choose an option:", options: "Pricing\nSupport\nTalk to a human" } },
      { id: "n4", type: "flow.end", position: { x: 660, y: 0 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
};

const leadQualification: AutomationTemplate = {
  id: "whatsapp-lead-qualification",
  name: "WhatsApp lead qualification",
  description: "Ask a qualification question and tag the contact based on their answer.",
  triggerType: "trigger.whatsapp_message",
  definition: {
    nodes: [
      { id: "n1", type: "trigger.whatsapp_message", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", type: "message.text", position: { x: 220, y: 0 }, data: { text: "Are you interested in a demo? Reply YES or NO." } },
      { id: "n3", type: "logic.keyword", position: { x: 440, y: 0 }, data: { keywords: "yes" } },
      { id: "n4", type: "contact.add_tag", position: { x: 660, y: -60 }, data: { tag: "hot-lead" } },
      { id: "n5", type: "flow.end", position: { x: 880, y: -60 }, data: {} },
      { id: "n6", type: "flow.end", position: { x: 660, y: 80 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", sourceHandle: "matched", targetHandle: "in" },
      { id: "e4", source: "n4", target: "n5" },
      { id: "e5", source: "n3", target: "n6", sourceHandle: "not-matched", targetHandle: "in" },
    ],
  },
};

const faqAutomation: AutomationTemplate = {
  id: "faq-automation",
  name: "FAQ automation",
  description: "Answer common questions with a keyword-based router.",
  triggerType: "trigger.keyword",
  definition: {
    nodes: [
      { id: "n1", type: "trigger.keyword", position: { x: 0, y: 0 }, data: { keywords: "hours, price, refund" } },
      { id: "n2", type: "logic.keyword", position: { x: 220, y: 0 }, data: { keywords: "hours" } },
      { id: "n3", type: "message.text", position: { x: 440, y: -60 }, data: { text: "We're open 9am–6pm, Monday to Friday." } },
      { id: "n4", type: "flow.end", position: { x: 660, y: -60 }, data: {} },
      { id: "n5", type: "flow.end", position: { x: 440, y: 80 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "matched", targetHandle: "in" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n2", target: "n5", sourceHandle: "not-matched", targetHandle: "in" },
    ],
  },
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  commentToDm,
  welcomeBot,
  leadQualification,
  faqAutomation,
];