import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Surface, Text } from "@cloudflare/kumo";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/lib/platform-icon";
import type { PlatformInfo } from "@shared/capabilities";

type IntegrationRow = PlatformInfo & { configured: boolean; adapterImplemented: boolean };

export function IntegrationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.get<IntegrationRow[]>("/api/integrations"),
  });

  return (
    <div>
      <PageHeader title="Integrations" description="Configure developer credentials for each platform. Everything is encrypted at rest with AES-256-GCM." />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          {isLoading ? (
            <div className="px-4 py-8 text-center"><Text variant="secondary">Loading…</Text></div>
          ) : (
            <div className="divide-y divide-kumo-line">
              {(data ?? []).map((p) => (
                <Link key={p.id} to={`/settings/integrations/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-kumo-tint">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlatformIcon name={p.icon} size={20} color={p.color} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Text DANGEROUS_className="font-medium">{p.name}</Text>
                        {p.configured && <Badge variant="success"><Check size={11} /> Configured</Badge>}
                        {!p.adapterImplemented && <Badge variant="outline">Adapter pending</Badge>}
                      </div>
                      <Text variant="secondary" DANGEROUS_className="block truncate text-[13px]">{p.description}</Text>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Text variant="secondary" DANGEROUS_className="text-[12px]">{p.category}</Text>
                    <ArrowRight size={15} className="text-kumo-subtle" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Surface>
        <Text variant="secondary" DANGEROUS_className="mt-3 block text-[13px]">
          Only platforms with a working adapter can be connected. Unsupported capabilities are surfaced honestly in the interface.
        </Text>
      </div>
    </div>
  );
}