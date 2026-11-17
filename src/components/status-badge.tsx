import { Badge } from "@cloudflare/kumo";

const STATUS_VARIANTS: Record<string, "success" | "error" | "warning" | "info" | "secondary" | "neutral"> = {
  connected: "success",
  published: "success",
  completed: "success",
  approved: "success",
  open: "info",
  running: "info",
  publishing: "info",
  queued: "info",
  scheduled: "info",
  pending: "warning",
  waiting: "warning",
  awaiting_approval: "warning",
  changes_requested: "warning",
  needs_attention: "warning",
  partially_published: "warning",
  draft: "neutral",
  paused: "neutral",
  disconnected: "neutral",
  expired: "error",
  revoked: "error",
  failed: "error",
  error: "error",
  closed: "neutral",
  archived: "neutral",
  cancelled: "neutral",
  permission_missing: "error",
};

const LABELS: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  changes_requested: "Changes requested",
  partially_published: "Partially published",
  needs_attention: "Needs attention",
  permission_missing: "Permission missing",
  inbox_agent: "Inbox agent",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? "neutral";
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}
