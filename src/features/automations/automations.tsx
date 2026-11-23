import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, Text } from "@cloudflare/kumo";
import { Plus, Trash, ArrowRight } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { AUTOMATION_TEMPLATES, type SimpleAutomation } from "@shared/automation";
import type { Automation } from "@shared/types";

export function AutomationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  const { data } = useQuery({
    queryKey: ["automations"],
    queryFn: () => api.get<Automation[]>("/api/automations"),
  });

  const create = useMutation({
    mutationFn: (triggerType: string) =>
      api.post<Automation>("/api/automations", {
        name,
        triggerType,
        simple: { triggerType, triggerConfig: {}, steps: [] },
      }),
    onSuccess: (auto) => {
      setModalOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      navigate(`/automations/builder/${auto.id}`);
    },
  });
  const createSimple = useMutation({
    mutationFn: (template: { triggerType: string; simple: SimpleAutomation }) =>
      api.post<Automation>("/api/automations", {
        name,
        triggerType: template.triggerType,
        simple: template.simple,
      }),
    onSuccess: (auto) => {
      setModalOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      navigate(`/automations/builder/${auto.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/automations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Visual conversational automations — the native ManyChat alternative."
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}><Plus size={15} /> New automation</Button>}
      />
      <div className="grid gap-6 px-6 pb-8 lg:grid-cols-[1fr_320px]">
        <Surface className="overflow-hidden rounded-lg">
          {(data ?? []).length === 0 ? (
            <div className="px-4 py-12 text-center"><Text variant="secondary">No automations yet. Start from a template below.</Text></div>
          ) : (
            <div className="divide-y divide-kumo-line">
              {(data ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div className="grid gap-0.5">
                    <Text DANGEROUS_className="font-medium">{a.name}</Text>
                    <Text variant="secondary" DANGEROUS_className="text-[14px]">{a.triggerType} · v{a.publishedVersion ?? 0}</Text>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    <Link to={`/automations/builder/${a.id}`}><Button variant="secondary" size="sm">Edit</Button></Link>
                    <Button variant="secondary" size="sm" shape="square" onClick={() => remove.mutate(a.id)} aria-label="Delete automation"><Trash size={14} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <div className="grid content-start gap-3">
          <Text as="h2" variant="heading">Templates</Text>
          {AUTOMATION_TEMPLATES.map((t) => (
            <Surface key={t.id} className="rounded-lg p-4">
              <Text DANGEROUS_className="font-medium">{t.name}</Text>
              <Text variant="secondary" DANGEROUS_className="mt-0.5 block text-[14px]">{t.description}</Text>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setName(t.name); createSimple.mutate(t); }}>
                Use template <ArrowRight size={13} />
              </Button>
            </Surface>
          ))}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="New automation"
        description="Create a blank automation and open the editor."
        footer={<ModalFooter onClose={() => setModalOpen(false)} onSubmit={() => create.mutate("trigger.keyword")} submitLabel="Create" loading={create.isPending} />}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome flow" />
      </Modal>
    </div>
  );
}
