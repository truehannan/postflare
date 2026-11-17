import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import type { Post } from "@shared/types";

const TITLES: Record<string, string> = {
  draft: "Drafts",
  scheduled: "Scheduled",
  queued: "Queue",
  published: "Published",
};

export function PostsPage({ status }: { status: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["posts", status],
    queryFn: () => api.get<{ items: Post[]; nextCursor: string | null }>(`/api/posts?status=${status}&limit=100`),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/posts/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/posts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  const posts = data?.items ?? [];

  return (
    <div>
      <PageHeader title={TITLES[status] ?? statusLabel(status)} description={`${posts.length} post${posts.length === 1 ? "" : "s"}`} />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          {isLoading ? (
            <div className="px-4 py-8 text-center"><Text variant="secondary">Loading…</Text></div>
          ) : posts.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Text variant="secondary">Nothing here yet.</Text>
            </div>
          ) : (
            <div className="divide-y divide-kumo-line">
              {posts.map((post) => (
                <div key={post.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="grid min-w-0 gap-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={post.status} />
                      {post.scheduledFor && <Text variant="secondary" DANGEROUS_className="mono-nums">{new Date(post.scheduledFor).toLocaleString()}</Text>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {post.variants.map((v) => (
                        <div key={v.id} className="min-w-0 max-w-md truncate rounded bg-kumo-recessed px-2 py-1 text-[13px] text-kumo-subtle">
                          {v.text.slice(0, 120) || "(empty)"}
                        </div>
                      ))}
                    </div>
                    {post.targets.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-[12px] text-kumo-subtle">
                        <span>{t.providerId}</span>
                        <StatusBadge status={t.status} />
                        {t.error && <span className="truncate text-kumo-danger">{t.error}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {["scheduled", "queued", "publishing"].includes(post.status) && (
                      <Button variant="secondary" size="sm" onClick={() => cancel.mutate(post.id)}>Cancel</Button>
                    )}
                    {["draft", "failed", "cancelled"].includes(post.status) && (
                      <Button variant="secondary" size="sm" onClick={() => remove.mutate(post.id)}>Delete</Button>
                    )}
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