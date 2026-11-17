import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, Text, Textarea } from "@cloudflare/kumo";
import { Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import type { Campaign } from "@shared/types";

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", objective: "" });

  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<Campaign[]>("/api/campaigns"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/campaigns", form),
    onSuccess: () => { setModalOpen(false); setForm({ name: "", description: "", objective: "" }); queryClient.invalidateQueries({ queryKey: ["campaigns"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/campaigns/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Organize posts and automations around shared objectives."
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}><Plus size={15} /> New campaign</Button>}
      />
      <div className="px-6 pb-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((c) => (
            <Surface key={c.id} className="rounded-lg p-4">
              <div className="flex items-start justify-between">
                <Text DANGEROUS_className="font-medium">{c.name}</Text>
                <Button variant="secondary" size="sm" shape="square" onClick={() => remove.mutate(c.id)} aria-label="Delete campaign"><Trash size={14} /></Button>
              </div>
              {c.description ? <Text variant="secondary" DANGEROUS_className="mt-1 block text-[13px]">{c.description}</Text> : null}
              {c.objective ? <Text variant="secondary" DANGEROUS_className="mt-2 block text-[12px]">Objective: {c.objective}</Text> : null}
            </Surface>
          ))}
          {(data ?? []).length === 0 && (
            <Surface className="rounded-lg p-4"><Text variant="secondary">No campaigns yet.</Text></Surface>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="New campaign"
        description="Group posts and automations under an objective."
        footer={<ModalFooter onClose={() => setModalOpen(false)} onSubmit={() => create.mutate()} submitLabel="Create" loading={create.isPending} />}
      >
        <div className="grid gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <Input label="Objective" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="e.g. Product launch awareness" />
        </div>
      </Modal>
    </div>
  );
}