import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Select, Surface, Table, Text } from "@cloudflare/kumo";
import { Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";

interface Member { id: string; userId: string; role: string; user: { id: string; email: string; name: string; avatarUrl: string | null } }

const ROLES = [
  { value: "admin", label: "Administrator" },
  { value: "manager", label: "Manager" },
  { value: "editor", label: "Editor" },
  { value: "publisher", label: "Publisher" },
  { value: "analyst", label: "Analyst" },
  { value: "inbox_agent", label: "Inbox agent" },
];

export function TeamPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");

  const { data: members } = useQuery({
    queryKey: ["team"],
    queryFn: () => api.get<Member[]>("/api/team"),
  });
  const { data: invitations } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => api.get<{ id: string; email: string; role: string }[]>("/api/team/invitations"),
  });

  const invite = useMutation({
    mutationFn: () => api.post("/api/team/invite", { email, role }),
    onSuccess: () => { setModalOpen(false); setEmail(""); queryClient.invalidateQueries({ queryKey: ["invitations"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/team/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage workspace members and roles."
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}><Plus size={15} /> Invite member</Button>}
      />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          <Table>
            <thead>
              <tr className="text-left text-[14px] text-kumo-subtle">
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id} className="border-t border-kumo-line text-[14px]">
                  <td className="px-4 py-2.5">{m.user.name} <span className="text-kumo-subtle">({m.user.email})</span></td>
                  <td className="px-4 py-2.5">{m.role.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-right">
                    {m.role !== "owner" && (
                      <Button variant="secondary" size="sm" shape="square" onClick={() => remove.mutate(m.id)} aria-label="Remove member"><Trash size={14} /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Surface>

        {(invitations ?? []).length > 0 && (
          <Surface className="mt-4 overflow-hidden rounded-lg">
            <div className="border-b border-kumo-line px-4 py-2.5"><Text as="h2" variant="heading">Pending invitations</Text></div>
            <div className="divide-y divide-kumo-line">
              {(invitations ?? []).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
                  <span>{inv.email}</span>
                  <Text variant="secondary">{inv.role.replace(/_/g, " ")}</Text>
                </div>
              ))}
            </div>
          </Surface>
        )}
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Invite member"
        description="Send an invitation to join this workspace."
        footer={<ModalFooter onClose={() => setModalOpen(false)} onSubmit={() => invite.mutate()} submitLabel="Invite" loading={invite.isPending} />}
      >
        <div className="grid gap-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" />
          <Select label="Role" items={ROLES} value={role} onValueChange={(v) => setRole(v as string)} />
        </div>
      </Modal>
    </div>
  );
}
