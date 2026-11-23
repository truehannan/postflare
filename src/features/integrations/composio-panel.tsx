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
  statusReason: string | null;
  name: string;
  imported: boolean;
}

const PENDING_KEY = "pf-composio-pending";

interface PendingConnection {
  providerId: string;
  composioAccountId: string;
  startedAt: number;
}

function readPending(): PendingConnection | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingConnection) : null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function ComposioPanel() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<RemoteAccount | null>(null);
  const [importName, setImportName] = useState("");
  const [importConfig, setImportConfig] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingConnection | null>(() => readPending());
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["composio-status"],
    queryFn: () => api.get<ComposioStatus>("/api/composio"),
  });
  const { data: remoteAccounts } = useQuery({
    queryKey: ["composio-accounts"],
    queryFn: () => api.get<{ items: RemoteAccount[]; scope: "user" | "all" }>("/api/composio/connected-accounts"),
    enabled: !!status?.configured,
  });

  // Poll the exact pending connection by its Composio id — deterministic, and
  // it survives refreshes because the id lives in sessionStorage.
  const { data: pendingPoll } = useQuery({
    queryKey: ["composio-connection-status", pending?.composioAccountId],
    queryFn: () =>
      api.get<{
        id: string;
        status: string;
        statusReason: string | null;
        providerId: string | null;
        name: string;
        imported: boolean;
      }>(`/api/composio/connection-status?id=${encodeURIComponent(pending!.composioAccountId)}`),
    enabled: !!status?.configured && !!pending,
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | undefined;
      if (data && ["ACTIVE", "FAILED", "EXPIRED", "REVOKED", "NOT_FOUND"].includes(data.status ?? "")) {
        return false;
      }
      return 3000;
    },
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

  // Resume/complete the pending connection as soon as its status resolves.
  useEffect(() => {
    if (!pending || !pendingPoll || !status) return;
    setPendingStatus(pendingPoll.status);
    if (pendingPoll.imported) {
      clearPending();
      setPending(null);
      setMessage("Account connected.");
      queryClient.invalidateQueries({ queryKey: ["composio-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      return;
    }
    if (pendingPoll.status === "ACTIVE") {
      const needsConfig = (status.supported.find((s) => s.platformId === pending.providerId)?.accountConfigFields ?? []).some(
        (f) => f.required,
      );
      clearPending();
      setPending(null);
      if (needsConfig) {
        setImportTarget({
          id: pendingPoll.id,
          toolkit: "",
          providerId: pending.providerId,
          status: pendingPoll.status,
          statusReason: pendingPoll.statusReason,
          name: pendingPoll.name,
          imported: false,
        });
        setImportConfig({});
        setMessage("Composio authorization completed — finish importing the account.");
      } else {
        autoImport.mutate({
          id: pendingPoll.id,
          toolkit: "",
          providerId: pending.providerId,
          status: pendingPoll.status,
          statusReason: pendingPoll.statusReason,
          name: pendingPoll.name,
          imported: false,
        });
      }
      return;
    }
    if (["FAILED", "EXPIRED", "REVOKED", "NOT_FOUND"].includes(pendingPoll.status)) {
      clearPending();
      setPending(null);
      setError(
        `The Composio connection did not complete (status: ${pendingPoll.status}` +
          `${pendingPoll.statusReason ? ` — ${pendingPoll.statusReason}` : ""}). Try connecting again.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPoll]);

  const connect = useMutation({
    mutationFn: (providerId: string) =>
      api.post<{ redirectUrl: string; composioAccountId: string | null; providerId: string }>("/api/composio/connect", { providerId }),
    onSuccess: (r) => {
      // Remember the exact account Composio created, so the connection can be
      // finished deterministically on return (even after a refresh).
      if (r.composioAccountId) {
        try {
          sessionStorage.setItem(
            PENDING_KEY,
            JSON.stringify({ providerId: r.providerId, composioAccountId: r.composioAccountId, startedAt: Date.now() }),
          );
        } catch {
          /* storage unavailable — the list fallback still works */
        }
      }
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
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Import failed"),
  });

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

      {pending && (
        <div className="mt-4 rounded-lg bg-kumo-recessed p-3">
          <div className="flex items-center gap-2">
            <Badge variant="info">Waiting for Composio</Badge>
            <Text variant="secondary">
              {pendingStatus === "INITIATED"
                ? "The authorization was started but not completed on Composio's page. Finish it there, or reconnect."
                : `Connection status: ${pendingStatus ?? "checking…"}`}
            </Text>
          </div>
        </div>
      )}

      {status?.configured && (
        <div className="mt-5 border-t border-kumo-line pt-4">
          <div className="mb-2 flex items-center justify-between">
            <Text DANGEROUS_className="">Composio connected accounts</Text>
            {remoteAccounts?.scope === "all" && (
              <Badge variant="warning">No accounts under the Postflare user — showing all project accounts</Badge>
            )}
          </div>
          {(remoteAccounts?.items ?? []).filter((a) => a.providerId).length === 0 ? (
            <Text variant="secondary">
              No Composio accounts yet — use the buttons above to connect a platform.
            </Text>
          ) : (
            <div className="divide-y divide-kumo-line">
              {(remoteAccounts?.items ?? []).filter((a) => a.providerId).map((a) => {
                const platform = getPlatform(a.providerId!);
                const isActive = a.status === "ACTIVE";
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <PlatformIcon name={platform?.icon ?? "Circle"} size={16} color={platform?.color} />
                      <Text DANGEROUS_className="truncate">{a.name}</Text>
                      <Badge variant="outline">{platform?.name ?? a.toolkit}</Badge>
                      {a.imported ? (
                        <Badge variant="success">Connected</Badge>
                      ) : isActive ? (
                        <Badge variant="warning">Not imported</Badge>
                      ) : (
                        <Badge variant="info">{a.status.toLowerCase()}</Badge>
                      )}
                    </div>
                    {!a.imported && isActive && (
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
