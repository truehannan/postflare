import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Surface, Text, Textarea } from "@cloudflare/kumo";
import { ArrowLeft, FloppyDisk, Lightning, Trash } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { PlatformIcon } from "@/lib/platform-icon";
import { CAPABILITY_LABELS, CAPABILITY_STATUS_LABELS, type PlatformInfo } from "@shared/capabilities";
import { PlugsConnected } from "@phosphor-icons/react";

interface Detail extends PlatformInfo {
  configured: boolean;
  masked: Record<string, string>;
  fieldKeys: string[];
  adapterImplemented: boolean;
}

export function IntegrationDetailPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["integration", providerId],
    queryFn: () => api.get<Detail>(`/api/integrations/${providerId}`),
    enabled: !!providerId,
  });

  const save = useMutation({
    mutationFn: () => api.put(`/api/credentials/${providerId}`, { fields }),
    onSuccess: () => {
      setMessage("Credentials saved (encrypted at rest).");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["integration", providerId] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Save failed"),
  });
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>(`/api/credentials/${providerId}/test`, { fields }),
    onSuccess: (r) => { setMessage(r.message); setError(r.ok ? null : r.message); },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Test failed"),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/credentials/${providerId}`),
    onSuccess: () => { setFields({}); setMessage("Credentials removed."); queryClient.invalidateQueries({ queryKey: ["integration", providerId] }); },
  });
  const oauth = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/api/oauth/${providerId}/authorize`, { redirectUri: `${window.location.origin}/oauth/callback` }),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "OAuth failed"),
  });

  // Composio auth gateway: authorize on Composio's hosted page with one key.
  const { data: composioStatus } = useQuery({
    queryKey: ["composio-status"],
    queryFn: () => api.get<{ configured: boolean; supported: { platformId: string }[] }>("/api/composio"),
    enabled: !!providerId,
  });
  const composioSupported = composioStatus?.supported.some((s) => s.platformId === providerId) ?? false;
  const composioConnect = useMutation({
    mutationFn: () => api.post<{ redirectUrl: string }>("/api/composio/connect", { providerId }),
    onSuccess: (r) => window.location.assign(r.redirectUrl),
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Could not start the Composio connection"),
  });

  if (!data) return <div className="p-6"><Text variant="secondary">Loading…</Text></div>;

  const capabilities = Object.entries(data.capabilities).filter(([, v]) => v && v !== "unsupported");
  const oauthAvailable = !!data.oauth && data.adapterImplemented;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-kumo-line px-6 py-3">
        <Link to="/settings/integrations"><Button variant="secondary" size="sm" shape="square" aria-label="Back"><ArrowLeft size={16} /></Button></Link>
        <PlatformIcon name={data.icon} size={22} color={data.color} />
        <Text as="h1" variant="heading">{data.name}</Text>
        {data.configured ? <Badge variant="success">Configured</Badge> : <Badge variant="secondary">Not configured</Badge>}
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_360px]">
        <Surface className="rounded-lg p-5">
          <Text as="h2" variant="heading" DANGEROUS_className="mb-1">Credentials</Text>
          <Text variant="secondary" DANGEROUS_className="mb-4 block">{data.description}</Text>

          {composioStatus?.configured && composioSupported && (
            <div className="mb-5 rounded-lg bg-kumo-recessed p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Text DANGEROUS_className="font-medium">Connect via Composio</Text>
                  <Text variant="secondary" DANGEROUS_className="block max-w-md">
                    Authorize once on Composio's hosted gateway — no developer credentials needed. The connection is created under your Postflare Composio user and appears in Settings → Integrations.
                  </Text>
                </div>
                <Button variant="primary" onClick={() => composioConnect.mutate()} loading={composioConnect.isPending}>
                  <PlugsConnected size={14} /> Connect via Composio
                </Button>
              </div>
            </div>
          )}
          {composioStatus?.configured && !composioSupported && (
            <Text variant="secondary" DANGEROUS_className="mb-4 block">
              This platform is not available through Composio — use the direct credentials below.
            </Text>
          )}

          {oauthAvailable && (
            <div className="mb-5 rounded-lg bg-kumo-recessed p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Text DANGEROUS_className="font-medium">OAuth connection</Text>
                  <Text variant="secondary" DANGEROUS_className="block text-[14px]">
                    Redirect URI: <span className="mono-nums">{window.location.origin}/oauth/callback</span>
                  </Text>
                </div>
                <Button variant="primary" onClick={() => oauth.mutate()} loading={oauth.isPending}>
                  <Lightning size={14} /> Connect via OAuth
                </Button>
              </div>
            </div>
          )}

          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {data.credentialFields.length === 0 ? (
              <Text variant="secondary">This platform requires no credentials.</Text>
            ) : (
              data.credentialFields.map((f) => {
                const saved = data.fieldKeys.includes(f.key);
                const value = fields[f.key] ?? "";
                return f.type === "textarea" ? (
                  <Textarea
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    value={value}
                    placeholder={saved ? `${data.masked[f.key]} (saved)` : f.placeholder}
                    onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    type={f.type === "secret" ? "password" : "text"}
                    value={value}
                    placeholder={saved ? `${data.masked[f.key]} (saved)` : f.placeholder}
                    onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                );
              })
            )}
            {error ? <Text variant="error">{error}</Text> : null}
            {message ? <Text variant="success">{message}</Text> : null}

            <div className="mt-2 flex gap-2 border-t border-kumo-line pt-4">
              <Button type="submit" variant="primary" loading={save.isPending}><FloppyDisk size={14} /> Save credentials</Button>
              <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending}>Test connection</Button>
              {data.configured && (
                <Button variant="secondary" onClick={() => remove.mutate()}><Trash size={14} /> Remove</Button>
              )}
            </div>
          </form>
        </Surface>

        <div className="grid content-start gap-4">
          <Surface className="rounded-lg p-4">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-2">Capabilities</Text>
            <div className="grid gap-1.5">
              {capabilities.map(([cap, status]) => (
                <div key={cap} className="flex items-center justify-between text-[14px]">
                  <span>{CAPABILITY_LABELS[cap as keyof typeof CAPABILITY_LABELS] ?? cap}</span>
                  <Badge variant={status === "supported" ? "success" : status === "partial" ? "warning" : "neutral"}>
                    {CAPABILITY_STATUS_LABELS[status as keyof typeof CAPABILITY_STATUS_LABELS] ?? status}
                  </Badge>
                </div>
              ))}
            </div>
          </Surface>

          {data.note && (
            <Surface className="rounded-lg p-4">
              <Text as="h2" variant="heading" DANGEROUS_className="mb-1">Requirements</Text>
              <Text variant="secondary" DANGEROUS_className="text-[14px]">{data.note}</Text>
            </Surface>
          )}

          {data.docsUrl && (
            <Surface className="rounded-lg p-4">
              <Text as="h2" variant="heading" DANGEROUS_className="mb-1">Documentation</Text>
              <a href={data.docsUrl} target="_blank" rel="noreferrer" className="text-kumo-brand hover:text-kumo-brand-hover text-[14px]">Official platform docs ↗</a>
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}
