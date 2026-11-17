import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { Check, X, ChatCircle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import type { Approval } from "@shared/types";

export function ApprovalsPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.get<Approval[]>("/api/approvals"),
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "request_changes" }) =>
      api.post(`/api/approvals/${id}/resolve`, { action, comment: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const pending = (data ?? []).filter((a) => a.status === "pending");

  return (
    <div>
      <PageHeader title="Approvals" description="Review and approve posts before they go out." />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          {pending.length === 0 ? (
            <div className="px-4 py-12 text-center"><Text variant="secondary">Nothing awaiting approval.</Text></div>
          ) : (
            <div className="divide-y divide-kumo-line">
              {pending.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="grid gap-0.5">
                    <Text DANGEROUS_className="font-medium mono-nums">{a.postId.slice(0, 14)}</Text>
                    <Text variant="secondary" DANGEROUS_className="text-[12px]">Requested {new Date(a.createdAt).toLocaleString()}</Text>
                  </div>
                  <StatusBadge status={a.status} />
                  <div className="flex gap-1">
                    <Button variant="primary" size="sm" onClick={() => resolve.mutate({ id: a.id, action: "approve" })}><Check size={14} /> Approve</Button>
                    <Button variant="secondary" size="sm" onClick={() => resolve.mutate({ id: a.id, action: "request_changes" })}><ChatCircle size={14} /> Request changes</Button>
                    <Button variant="secondary" size="sm" onClick={() => resolve.mutate({ id: a.id, action: "reject" })}><X size={14} /> Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}