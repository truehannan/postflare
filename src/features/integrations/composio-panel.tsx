import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Surface, Text } from "@cloudflare/kumo";
import { DownloadSimple, Key, Lightning, PlugsConnected } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { Modal, ModalFooter } from "@/components/modal";
import { PlatformIcon } from "@/lib/platform-icon";
import { getPlatform } from "@shared/capabilities";
import type { ComposioSupport } from "@shared/composio";

interface ComposioStatus {
  configured: boolean;
  supported: ComposioSupport[];
}

interface RemoteAccount {
  id: string;
  toolkit: string;
  providerId: string | null;
  status: string;
  name: string;
  imported: boolean;
}

export function ComposioPanel() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<RemoteAccount | null>(null);
  const [importName, setImportName] = useState("");
  const [importConfig, setImportConfig] = useState<Record<string, string>>({});
  const [returnProvider, setReturnProvider] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["composio-status"],
    queryFn: () => api.get<ComposioStatus>("/api/composio"),
  });
  const { data: remoteAccounts, refetch: refetchRemote } = useQuery({
    queryKey: ["composio-accounts"],
    queryFn: () => api.get<RemoteAccount[]>("/api/composio/connected-accounts"),
    enabled: !!status?.configured,
  });

  const saveKey = useMutation({
    mutationFn: () => api.put<{ ok: boolean; message: string }>("/api/composio/key", { apiKey }),
    onSuccess: (r) => {
      setApiKey("");
      setMessage(r.message);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["composio-status"] });
      queryClient.invalidateQueries({ queryKey: ["composio-accounts"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Could not save the Composio key"),
  });

  // Detect the return from Composio's hosted authorization and pick the flow
  // back up (auto-import, or open the config modal for FB/Reddit/Telegram).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("composio") !== "connected") return;
    const provider = params.get("provider");
    window.history.replaceState({}, "", window.location.pathname);
    setReturnProvider(provider);
  }, []);

  const connect = useMutation({
    mutationFn: (providerId: string) =>
      api.post<{ redirectUrl: string; composioAccountId: string | null; providerId: string }>("/api/composio/connect", { providerId }),
    onSuccess: (r) => {
      // Send the user to Composio's hosted authorization page.
      window.location.assign(r.redirectUrl);
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Could not start the Composio connection"),
  });

  const autoImport = useMutation({
    mutationFn: (target: RemoteAccount) =>
      api.post("/api/composio/import", { composioAccountId: target.id, providerId: target.providerId }),
    onSuccess: () => {
      setMessage("Composio account connected and imported.");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["composio-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Import failed"),
  });

  // Once accounts are loaded after a gateway return, finish the import.
  useEffect(() => {
    if (!returnProvider || !remoteAccounts) return;
    setReturnProvider(null);
    const pending = remoteAccounts.filter(
      (a) => a.providerId === returnProvider && a.status === "ACTIVE" && !a.imported,
    );
    if (pending.length === 0) {
      setMessage("Composio authorization completed — no new active account found yet. It may take a moment to become active.");
      return;
    }
    const target = pending[0];
    const needsConfig = (status?.supported.find((s) => s.platformId === target.providerId)?.accountConfigFields ?? []).some(
      (f) => f.required,
    );
    if (needsConfig) {
      setImportTarget(target);
      setImportConfig({});
      setMessage("Composio authorization completed — finish importing the account.");
    } else {
      autoImport.mutate(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnProvider, remoteAccounts]);

  const importAccount = useMutation({
    mutationFn: (target: RemoteAccount) =>
      api.post("/api/composio/import", {
        composioAccountId: target.id,
        providerId: target.providerId,
        accountName: importName || undefined,
        config: Object.keys(importConfig).length ? importConfig : undefined,
      }),
    onSuccess: () => {
      setImportTarget(null);
      setImportName("");
      setImportConfig({});
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["composio-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      refetchRemote();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Import failed"),
  });

  const importable = (remoteAccounts ?? []).filter((a) => a.providerId && a.status === "ACTIVE");
  const supportFor = (a: RemoteAccount) => status?.supported.find((s) => s.platformId === a.providerId);

  return (
    <Surface className="rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <div className="flex items-center gap-2">
            <Key size={17} className="text-kumo-subtle" />
            <Text as="h2" variant="heading">Connect everything with Composio</Text>
            {status?.configured ? <Badge variant="success">Configured</Badge> : <Badge variant="secondary">Optional</Badge>}
          </div>
          <Text DANGEROUS_className="max-w-xl">
            One Composio API key replaces per-platform developer credentials: authorize each app on Composio, then import the connected accounts here. Publishing runs through Composio's tools — the direct-credential option below keeps working independently.
          </Text>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <Input
            label="Composio API key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.configured ? "•••••••••••••••• (saved)" : "Your project API key from app.composio.dev"}
            description="Encrypted at rest with AES-256-GCM, like every other credential."
          />
        </div>
        <Button variant="primary" disabled={!apiKey.trim()} loading={saveKey.isPending} onClick={() => saveKey.mutate()}>
          <Lightning size={14} /> Save & test
        </Button>
      </div>
      {error ? <Text variant="error">{error}</Text> : null}
      {message ? <Text variant="success">{message}</Text> : null}

      {status?.configured && (
        <div className="mt-5 border-t border-kumo-line pt-4">
          <Text DANGEROUS_className="mb-1">Connect a new account</Text>
          <Text variant="secondary" DANGEROUS_className="mb-2 block max-w-xl">
            Everything is handled for you — the toolkit's auth config, the Postflare Composio user and the hosted authorization are set up automatically when you click. No developer credentials and nothing to configure in the Composio dashboard.
          </Text>
          <div className="flex flex-wrap gap-1.5">
            {status.supported.map((s) => {
              const platform = getPlatform(s.platformId);
              return (
                <Button
                  key={s.platformId}
                  variant="secondary"
                  size="sm"
                  loading={connect.isPending && connect.variables === s.platformId}
                  onClick={() => connect.mutate(s.platformId)}
                >
                  <PlugsConnected size={13} /> Connect {platform?.name ?? s.platformId}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {status?.configured && (
        <div className="mt-5 border-t border-kumo-line pt-4">
          <Text DANGEROUS_className="mb-2">Composio connected accounts</Text>
          {importable.length === 0 ? (
            <Text variant="secondary">
              No active Composio accounts yet — use the buttons above to connect a platform.
            </Text>
          ) : (
            <div className="divide-y divide-kumo-line">
              {importable.map((a) => {
                const platform = getPlatform(a.providerId!);
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <PlatformIcon name={platform?.icon ?? "Circle"} size={16} color={platform?.color} />
                      <Text DANGEROUS_className="truncate">{a.name}</Text>
                      <Badge variant="outline">{platform?.name ?? a.toolkit}</Badge>
                    </div>
                    {a.imported ? (
                      <Badge variant="success">Imported</Badge>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => { setImportTarget(a); setImportConfig({}); }}>
                        <DownloadSimple size={14} /> Import
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <Text DANGEROUS_className="mt-3 block text-[14px]">
            Supported through Composio: {status.supported.map((s) => getPlatform(s.platformId)?.name ?? s.platformId).join(", ")}.
          </Text>
        </div>
      )}

      <Modal
        open={!!importTarget}
        onOpenChange={(v) => { if (!v) setImportTarget(null); }}
        title="Import Composio account"
        description={importTarget ? `Import “${importTarget.name}” as a ${getPlatform(importTarget.providerId!)?.name} account.` : undefined}
        footer={
          <ModalFooter
            onClose={() => setImportTarget(null)}
            submitLabel="Import"
            loading={importAccount.isPending}
            onSubmit={() => importTarget && importAccount.mutate(importTarget)}
          />
        }
      >
        {importTarget && (
          <div className="grid gap-3">
            <Input
              label="Account name"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder={importTarget.name}
              description="How this account appears in Postflare."
            />
            {(supportFor(importTarget)?.accountConfigFields ?? []).map((field) => (
              <Input
                key={field.key}
                label={field.label}
                description={field.description}
                value={importConfig[field.key] ?? ""}
                onChange={(e) => setImportConfig((s) => ({ ...s, [field.key]: e.target.value }))}
              />
            ))}
            {error ? <Text variant="error">{error}</Text> : null}
          </div>
        )}
      </Modal>
    </Surface>
  );
}
