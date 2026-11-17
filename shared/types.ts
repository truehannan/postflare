/**
 * Postflare — shared domain types.
 * Used by the Worker (API responses) and the frontend (TanStack Query data).
 */

// ---------------------------------------------------------------------------
// Identity & workspace
// ---------------------------------------------------------------------------

export type UserRole = "owner" | "admin" | "manager" | "editor" | "publisher" | "analyst" | "inbox_agent";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan: string;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: UserRole;
  user: PublicUser;
  createdAt: string;
}

export interface AuthSession {
  user: PublicUser;
  workspace: Workspace;
  memberships: { workspace: Workspace; role: UserRole }[];
}

// ---------------------------------------------------------------------------
// Integrations, credentials & accounts
// ---------------------------------------------------------------------------

export interface CredentialSummary {
  id: string;
  providerId: string;
  workspaceId: string;
  /** Masked field names that have values stored, e.g. ["appId", "appSecret"]. */
  fieldKeys: string[];
  /** Masked display for each field key. */
  masked: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type AccountStatus =
  | "connected"
  | "connecting"
  | "needs_attention"
  | "expired"
  | "revoked"
  | "permission_missing"
  | "error"
  | "disconnected";

export interface ConnectedAccount {
  id: string;
  workspaceId: string;
  providerId: string;
  providerName: string;
  accountName: string;
  username: string;
  avatarUrl: string | null;
  status: AccountStatus;
  isDefault: boolean;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  capabilities: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export type PostStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "scheduled"
  | "queued"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed"
  | "cancelled";

export interface PostVariant {
  id: string;
  providerId: string;
  text: string;
  title?: string | null;
  link?: string | null;
  mediaIds: string[];
}

export interface PostAccountTarget {
  id: string;
  accountId: string;
  providerId: string;
  status: PostStatus;
  remoteId: string | null;
  error: string | null;
  publishedAt: string | null;
}

export interface Post {
  id: string;
  workspaceId: string;
  status: PostStatus;
  scheduledFor: string | null;
  createdById: string;
  campaignId: string | null;
  variants: PostVariant[];
  targets: PostAccountTarget[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export interface MediaAsset {
  id: string;
  workspaceId: string;
  folderId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  url: string;
  createdAt: string;
}

export interface MediaFolder {
  id: string;
  workspaceId: string;
  name: string;
  parentId: string | null;
}

// ---------------------------------------------------------------------------
// Inbox & contacts
// ---------------------------------------------------------------------------

export type ConversationStatus = "open" | "pending" | "closed" | "archived";

export interface Contact {
  id: string;
  workspaceId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  tags: string[];
  assignedTo: string | null;
  consent: "unknown" | "granted" | "revoked";
  createdAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  accountId: string | null;
  providerId: string;
  contactId: string | null;
  status: ConversationStatus;
  unreadCount: number;
  assignedTo: string | null;
  labels: string[];
  priority: "low" | "normal" | "high";
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  mediaUrl: string | null;
  sentAt: string;
  senderName: string | null;
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables?: Record<string, string>;
}

export type AutomationStatus = "draft" | "published" | "paused";

export interface Automation {
  id: string;
  workspaceId: string;
  name: string;
  status: AutomationStatus;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  publishedVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationVersion {
  id: string;
  automationId: string;
  version: number;
  definition: FlowDefinition;
  createdAt: string;
}

export type ExecutionStatus = "running" | "completed" | "failed" | "waiting" | "stopped";

export interface AutomationExecution {
  id: string;
  workspaceId: string;
  automationId: string;
  version: number;
  status: ExecutionStatus;
  currentNodeId: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Campaigns, approvals, notifications, audit
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  objective: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested";

export interface Approval {
  id: string;
  workspaceId: string;
  postId: string;
  requestedById: string;
  reviewerId: string | null;
  status: ApprovalStatus;
  comment: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface NotificationItem {
  id: string;
  workspaceId: string;
  userId: string | null;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API conventions
// ---------------------------------------------------------------------------

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Standard envelope for list endpoints that return paginated data. */
export interface ListResponse<T> {
  items: T[];
  total: number;
}