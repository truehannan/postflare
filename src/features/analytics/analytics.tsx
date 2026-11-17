import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { ArrowClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/lib/platform-icon";
import type { ConnectedAccount } from "@shared/types";

interface Metrics { metricDate: string; metrics: Record<string, number> }

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<ConnectedAccount[]>("/api/accounts"),
  });
  const { data: metrics } = useQuery({
    queryKey: ["account-metrics", selectedId],
    queryFn: () => (selectedId ? api.get<Metrics[]>(`/api/analytics/accounts/${selectedId}`) : Promise.resolve([])),
    enabled: !!selectedId,
  });

  const sync = useMutation({
    mutationFn: (id: string) => api.post(`/api/analytics/accounts/${id}/sync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account-metrics", selectedId] }),
  });

  const latest = (metrics ?? [])[metrics?.length ? metrics.length - 1 : 0];

  return (
    <div>
      <PageHeader title="Analytics" description="Metrics aggregated from the APIs you've authorized." />
      <div className="grid gap-6 px-6 pb-8 lg:grid-cols-[320px_1fr]">
        <Surface className="overflow-hidden rounded-lg self-start">
          {(accounts ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center"><Text variant="secondary">No connected accounts.</Text></div>
          ) : (
            <div className="divide-y divide-kumo-line">
              {(accounts ?? []).map((a) => (
                <button key={a.id} onClick={() => setSelectedId(a.id)} className={`flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-kumo-tint ${selectedId === a.id ? "bg-kumo-tint" : ""}`}>
                  <PlatformIcon name={a.providerId} size={16} />
                  <span className="text-[14px]">{a.accountName}</span>
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="rounded-lg">
          {!selectedId ? (
            <div className="px-4 py-12 text-center"><Text variant="secondary">Select an account to view its metrics.</Text></div>
          ) : (
            <div>
              <div className="flex items-center justify-between border-b border-kumo-line px-4 py-3">
                <Text as="h2" variant="heading">Account metrics</Text>
                <Button variant="secondary" size="sm" onClick={() => sync.mutate(selectedId)} loading={sync.isPending}>
                  <ArrowClockwise size={14} /> Sync
                </Button>
              </div>
              {!latest ? (
                <div className="px-4 py-10 text-center">
                  <Text variant="secondary">No metrics recorded yet. Metrics are only stored when a platform exposes them through its API.</Text>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
                  {Object.entries(latest.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-kumo-recessed px-3 py-2.5">
                      <Text DANGEROUS_className="mono-nums text-[20px] font-semibold">{Number(value).toLocaleString()}</Text>
                      <Text variant="secondary" DANGEROUS_className="block text-[12px]">{key.replace(/_/g, " ")}</Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}