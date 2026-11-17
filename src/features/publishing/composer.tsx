import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, Text, Textarea } from "@cloudflare/kumo";
import { api, ApiClientError } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/lib/platform-icon";
import { getPlatform } from "@shared/capabilities";
import type { ConnectedAccount } from "@shared/types";

export function ComposerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<ConnectedAccount[]>("/api/accounts"),
  });

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [baseText, setBaseText] = useState("");
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [link, setLink] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = (accounts ?? []).filter((a) => selectedAccounts.includes(a.id));
  const providers = useMemo(() => [...new Set(selected.map((a) => a.providerId))], [selected]);

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const applyBaseToAll = () => {
    const next: Record<string, string> = {};
    for (const p of providers) next[p] = baseText;
    setVariants(next);
  };

  const publish = useMutation({
    mutationFn: (publishNow: boolean) =>
      api.post("/api/posts", {
        variants: providers.map((p) => ({
          providerId: p,
          text: variants[p] ?? baseText,
          link: link || null,
          mediaIds: [],
        })),
        accountIds: selectedAccounts,
        scheduledFor: scheduledFor || null,
        publishNow,
      }),
    onSuccess: (_data, publishNow) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate(publishNow ? "/publishing/queue" : "/publishing/calendar");
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Failed to create post"),
  });

  return (
    <div>
      <PageHeader title="Composer" description="Create a post and publish it to one or more connected accounts." />
      <div className="grid gap-6 px-6 pb-8 lg:grid-cols-[1fr_320px]">
        <Surface className="rounded-lg p-5">
          <div className="grid gap-4">
            <div>
              <Text as="label" variant="secondary" DANGEROUS_className="mb-1.5 block text-[14px]">Caption</Text>
              <Textarea
                value={baseText}
                onChange={(e) => setBaseText(e.target.value)}
                placeholder="Write your post…"
                rows={4}
              />
              <div className="mt-1 flex items-center justify-between">
                <Text variant="secondary" DANGEROUS_className="mono-nums">{baseText.length} characters</Text>
                {providers.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={applyBaseToAll}>Apply to all platforms</Button>
                )}
              </div>
            </div>

            {providers.length > 0 && (
              <div className="grid gap-3 border-t border-kumo-line pt-4">
                <Text as="h2" variant="heading">Platform variants</Text>
                {providers.map((p) => {
                  const platform = getPlatform(p);
                  return (
                    <div key={p} className="grid gap-1.5">
                      <div className="flex items-center gap-2">
                        <PlatformIcon name={platform?.icon ?? "Circle"} size={16} />
                        <Text DANGEROUS_className="font-medium">{platform?.name ?? p}</Text>
                        <Text variant="secondary" DANGEROUS_className="mono-nums">{(variants[p] ?? baseText).length} chars</Text>
                      </div>
                      <Textarea
                        value={variants[p] ?? baseText}
                        onChange={(e) => setVariants((v) => ({ ...v, [p]: e.target.value }))}
                        rows={3}
                        placeholder={`${platform?.name ?? p} caption`}
                      />
                    </div>
                  );
                })}
                <Input label="Link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (optional)" />
              </div>
            )}

            {error ? <Text variant="error">{error}</Text> : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-kumo-line pt-4">
              <Button
                variant="primary"
                loading={publish.isPending}
                disabled={selectedAccounts.length === 0}
                onClick={() => publish.mutate(true)}
              >
                Publish now
              </Button>
              <Button variant="secondary" disabled={selectedAccounts.length === 0 || !scheduledFor} onClick={() => publish.mutate(false)}>
                Schedule
              </Button>
              <Button variant="secondary" disabled={selectedAccounts.length === 0} onClick={() => publish.mutate(false)}>
                Save draft
              </Button>
            </div>
          </div>
        </Surface>

        <div className="grid content-start gap-3">
          <Surface className="rounded-lg p-4">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-2">Accounts</Text>
            {(accounts ?? []).length === 0 ? (
              <Text variant="secondary">No connected accounts yet.</Text>
            ) : (
              <div className="grid gap-1">
                {(accounts ?? []).map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-kumo-tint">
                    <input type="checkbox" checked={selectedAccounts.includes(a.id)} onChange={() => toggleAccount(a.id)} className="accent-[var(--color-kumo-brand)]" />
                    <PlatformIcon name={getPlatform(a.providerId)?.icon ?? "Circle"} size={16} />
                    <span className="text-[14px]">{a.accountName}</span>
                  </label>
                ))}
              </div>
            )}
          </Surface>

          <Surface className="rounded-lg p-4">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-2">Schedule</Text>
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
            <Text variant="secondary" DANGEROUS_className="mt-2">Scheduled posts are enqueued by the Worker's cron trigger.</Text>
          </Surface>
        </div>
      </div>
    </div>
  );
}