import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Select, Surface, Text } from "@cloudflare/kumo";
import { ArrowClockwise, Plus, Trash } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import { PlatformIcon } from "@/lib/platform-icon";
import { StatusBadge } from "@/components/status-badge";
import { getPlatform } from "@shared/capabilities";
import type { ConnectedAccount } from "@shared/types";

interface ProviderInfo { id: string; name: string; icon: string; credentialFields: { key: string; label: string; type: string; required: boolean; description?: string; placeholder?: string }[] }

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [providerId, setProviderId] = useState("bluesky");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<ConnectedAccount[]>("/api/accounts"),
  });
  const { data: providers } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.get<ProviderInfo[]>("/api/integrations"),
  });

  const connect = useMutation({
    mutationFn: () => api.post("/api/accounts/connect", { providerId, fields }),
    onSuccess: () => { setModalOpen(false); setFields({}); setError(null); queryClient.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Connection failed"),
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/api/accounts/${id}/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.post(`/api/accounts/${id}/default`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const currentProvider = (providers ?? []).find((p) => p.id === providerId);
  const connectableProviders = (providers ?? []).filter((p) => p.credentialFields.length > 0 || p.id === "rss");

  return (
    <div>
      <PageHeader
        title="Social accounts"
        description="Connect and manage accounts for each platform."
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}><Plus size={15} /> Connect account</Button>}
      />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          {(accounts ?? []).length === 0 ? (
            <div className="px-4 py-12 text-center"><Text variant="secondary">No connected accounts. Connect your first account to start publishing.</Text></div>
          ) : (
            <div className="divide-y divide-kumo-line">
              {(accounts ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PlatformIcon name={getPlatform(a.providerId)?.icon ?? "Circle"} size={20} />
                    <div>
                      <Text DANGEROUS_className="font-medium">{a.accountName}</Text>
                      <Text variant="secondary" DANGEROUS_className="block text-[14px]">{a.providerName}{a.username ? ` · @${a.username}` : ""}</Text>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {a.connectionMode === "composio" && <Badge variant="info">Via Composio</Badge>}
                    {a.isDefault && <Text variant="secondary" DANGEROUS_className="text-[14px]">Default</Text>}
                    <Button variant="secondary" size="sm" onClick={() => test.mutate(a.id)} loading={test.isPending}><ArrowClockwise size={14} /> Test</Button>
                    <Button variant="secondary" size="sm" onClick={() => setDefault.mutate(a.id)}>Set default</Button>
                    <Button variant="secondary" size="sm" shape="square" onClick={() => remove.mutate(a.id)} aria-label="Disconnect"><Trash size={14} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Connect account"
        description="Enter platform credentials. They are encrypted and never returned to the browser."
        footer={<ModalFooter onClose={() => setModalOpen(false)} onSubmit={() => connect.mutate()} submitLabel="Connect" loading={connect.isPending} />}
      >
        <div className="grid gap-3">
          <Select
            label="Platform"
            items={connectableProviders.map((p) => ({ value: p.id, label: p.name }))}
            value={providerId}
            onValueChange={(v) => { setProviderId(v as string); setFields({}); }}
          />
          {(currentProvider?.credentialFields ?? []).map((f) => (
            <Input
              key={f.key}
              label={f.label}
              description={f.description}
              type={f.type === "secret" ? "password" : "text"}
              placeholder={f.placeholder}
              value={fields[f.key] ?? ""}
              onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}
          {error ? <Text variant="error">{error}</Text> : null}
        </div>
      </Modal>
    </div>
  );
}
