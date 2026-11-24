import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Surface, Text } from "@cloudflare/kumo";
import { PencilSimple, Plus, Trash, ArrowRight } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import { StatusBadge } from "@/components/status-badge";
import { PlatformIcon } from "@/lib/platform-icon";
import { getNodeType, type SimpleAutomation } from "@shared/automation";
import { getPlatform } from "@shared/capabilities";
import type { Automation } from "@shared/types";

interface TemplateView {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  platforms: string[];
  builtin: boolean;
  simple: SimpleAutomation;
}

export function AutomationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  const { data: templates } = useQuery({
    queryKey: ["automation-templates"],
    queryFn: () => api.get<TemplateView[]>("/api/automations/templates"),
  });
  const { data: instances } = useQuery({
    queryKey: ["automations"],
    queryFn: () => api.get<Automation[]>("/api/automations"),
  });

  const createTemplate = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/automations/templates", {
        name,
        triggerType: "trigger.keyword",
        simple: { triggerType: "trigger.keyword", triggerConfig: { keywords: "hi" }, steps: [] },
      }),
    onSuccess: (r) => {
      setModalOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["automation-templates"] });
      navigate(`/automations/builder/${r.id}`);
    },
    onError: (e) => window.alert(e instanceof ApiClientError ? e.message : "Could not create the template"),
  });

  const duplicateTemplate = useMutation({
    mutationFn: (template: TemplateView) =>
      api.post<{ id: string }>("/api/automations/templates", {
        name: `${template.name} (copy)`,
        triggerType: template.triggerType,
        simple: template.simple,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["automation-templates"] });
      navigate(`/automations/builder/${r.id}`);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/api/automations/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-templates"] }),
  });

  const deleteInstance = useMutation({
    mutationFn: (id: string) => api.delete(`/api/automations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Design templates here, then attach and customize them per post from the composer."
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus size={15} /> New template
          </Button>
        }
      />
      <div className="grid gap-8 px-6 pb-8">
        {/* ---- Template library ---- */}
        <section className="grid gap-3">
          <Text as="h2" variant="heading">Templates</Text>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(templates ?? []).map((t) => (
              <Surface key={t.id} className="rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <Text DANGEROUS_className="font-medium">{t.name}</Text>
                  <Badge variant={t.builtin ? "info" : "secondary"}>{t.builtin ? "Built-in" : "Custom"}</Badge>
                </div>
                <Text variant="secondary" DANGEROUS_className="mt-1 block text-[14px]">{t.description}</Text>
                <div className="mt-2 flex items-center gap-1.5">
                  <Text variant="secondary" DANGEROUS_className="text-[14px]">
                    {getNodeType(t.triggerType)?.label ?? t.triggerType}
                  </Text>
                  <Text variant="secondary" DANGEROUS_className="text-[14px]">· {t.simple.steps.length} steps</Text>
                  {t.platforms.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      {t.platforms.map((p) => (
                        <PlatformIcon key={p} name={getPlatform(p)?.icon ?? "Circle"} size={13} color={getPlatform(p)?.color} />
                      ))}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => navigate("/publishing/composer")}>
                    Use in composer <ArrowRight size={13} />
                  </Button>
                  {t.builtin ? (
                    <Button variant="secondary" size="sm" onClick={() => duplicateTemplate.mutate(t)} loading={duplicateTemplate.isPending && duplicateTemplate.variables === t}>
                      <PencilSimple size={13} /> Duplicate & edit
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/automations/builder/${t.id}`)}>
                      <PencilSimple size={13} /> Edit
                    </Button>
                  )}
                  {!t.builtin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      shape="square"
                      onClick={() => deleteTemplate.mutate(t.id)}
                      aria-label="Delete template"
                    >
                      <Trash size={13} />
                    </Button>
                  )}
                </div>
              </Surface>
            ))}
          </div>
        </section>

        {/* ---- Active per-post instances ---- */}
        <section className="grid gap-3">
          <Text as="h2" variant="heading">Active automations</Text>
          <Text variant="secondary" DANGEROUS_className="-mt-2 block text-[14px]">
            These are instantiated from templates when you publish posts — each is bound to a single post.
          </Text>
          <Surface className="overflow-hidden rounded-lg">
            {(instances ?? []).length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Text variant="secondary">No active automations yet — attach a template from the composer.</Text>
              </div>
            ) : (
              <div className="divide-y divide-kumo-line">
                {(instances ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="grid gap-0.5">
                      <Text DANGEROUS_className="font-medium">{a.name}</Text>
                      <Text variant="secondary" DANGEROUS_className="text-[14px]">{a.triggerType.replace("trigger.", "").replace(/_/g, " ")}</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/automations/builder/${a.id}`)}>View</Button>
                      <Button variant="secondary" size="sm" shape="square" onClick={() => deleteInstance.mutate(a.id)} aria-label="Delete automation">
                        <Trash size={13} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </section>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="New template"
        description="Create a blank template and design it in the editor."
        footer={<ModalFooter onClose={() => setModalOpen(false)} onSubmit={() => createTemplate.mutate()} submitLabel="Create" loading={createTemplate.isPending} />}
      >
        <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comment-to-DM" />
      </Modal>
    </div>
  );
}
