import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, Table, Text } from "@cloudflare/kumo";
import { ArrowRight, Key, Plugs } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { useActiveWorkspace } from "@/lib/store";

interface AuditRow { id: string; actor_id: string | null; action: string; resource_type: string; resource_id: string | null; created_at: string }

export function SettingsPage() {
  const queryClient = useQueryClient();
  const workspace = useActiveWorkspace();
  const [name, setName] = useState(workspace?.name ?? "");
  const [timezone, setTimezone] = useState(workspace?.timezone ?? "UTC");

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.get<AuditRow[]>("/api/settings/audit-logs"),
  });

  const save = useMutation({
    mutationFn: () => api.patch("/api/settings", { settings: { timezone } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <div>
      <PageHeader title="Settings" description="Workspace configuration, credentials and accounts." />
      <div className="grid gap-6 px-6 pb-8 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Surface className="rounded-lg p-5">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-3">Workspace</Text>
            <div className="grid gap-3">
              <Input label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Europe/London" />
              <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} className="justify-self-start">Save</Button>
            </div>
          </Surface>

          <div className="grid gap-3">
            <Link to="/settings/integrations" className="group">
              <Surface className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-kumo-elevated">
                <div className="flex items-center gap-3">
                  <Key size={18} className="text-kumo-subtle" />
                  <div>
                    <Text DANGEROUS_className="font-medium">Developer credentials</Text>
                    <Text variant="secondary" DANGEROUS_className="block text-[13px]">OAuth apps, API keys and tokens — encrypted at rest</Text>
                  </div>
                </div>
                <ArrowRight size={15} className="text-kumo-subtle group-hover:text-kumo-default" />
              </Surface>
            </Link>
            <Link to="/settings/accounts" className="group">
              <Surface className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-kumo-elevated">
                <div className="flex items-center gap-3">
                  <Plugs size={18} className="text-kumo-subtle" />
                  <div>
                    <Text DANGEROUS_className="font-medium">Social accounts</Text>
                    <Text variant="secondary" DANGEROUS_className="block text-[13px]">Connect and manage accounts per platform</Text>
                  </div>
                </div>
                <ArrowRight size={15} className="text-kumo-subtle group-hover:text-kumo-default" />
              </Surface>
            </Link>
          </div>
        </div>

        <Surface className="overflow-hidden rounded-lg self-start">
          <div className="border-b border-kumo-line px-4 py-2.5"><Text as="h2" variant="heading">Audit logs</Text></div>
          <Table>
            <thead>
              <tr className="text-left text-[12px] text-kumo-subtle">
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {(auditLogs ?? []).length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center"><Text variant="secondary">No audit events yet.</Text></td></tr>
              ) : (
                (auditLogs ?? []).map((log) => (
                  <tr key={log.id} className="border-t border-kumo-line text-[13px]">
                    <td className="px-4 py-2">{log.action}</td>
                    <td className="px-4 py-2 text-kumo-subtle">{log.resource_type}{log.resource_id ? ` · ${log.resource_id.slice(0, 12)}` : ""}</td>
                    <td className="px-4 py-2 text-kumo-subtle">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Surface>
      </div>
    </div>
  );
}