import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Text } from "@cloudflare/kumo";
import { ArrowLeft, Check, FloppyDisk, PaperPlaneTilt } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { SimpleAutomationEditor } from "@/features/automations/editor";
import { tryLinearizeFlow, type SimpleAutomation } from "@shared/automation";
import type { FlowDefinition } from "@shared/types";

interface TemplateView {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  platforms: string[];
  builtin: boolean;
  simple: SimpleAutomation;
}

const EMPTY_SIMPLE: SimpleAutomation = {
  triggerType: "trigger.keyword",
  triggerConfig: { keywords: "hi" },
  steps: [],
};

export function AutomationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: automation } = useQuery({
    queryKey: ["automation", id],
    queryFn: () => api.get<{ id: string; name: string; status: string }>(`/api/automations/${id}`),
    enabled: !!id,
  });

  const isTemplate = automation?.status === "template";

  // Templates: load the simple model from the template endpoint. Instances:
  // from the latest saved version (with legacy linearization fallback).
  const { data: template } = useQuery({
    queryKey: ["automation-template", id],
    queryFn: () => api.get<TemplateView>(`/api/automations/templates/${id}`),
    enabled: !!id && isTemplate,
  });
  const { data: latest } = useQuery({
    queryKey: ["automation-latest", id],
    queryFn: () => api.get<{ version: number; definition: FlowDefinition | null }>(`/api/automations/${id}/latest`),
    enabled: !!id && !isTemplate,
  });

  const [name, setName] = useState<string | null>(null);
  const [simple, setSimple] = useState<SimpleAutomation | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed state once the data arrives.
  if (simple === null && (template || latest)) {
    if (template) {
      setSimple(template.simple);
      if (name === null) setName(template.name);
    } else if (latest) {
      const def = latest.definition;
      const simpleDef = (def as { simple?: SimpleAutomation } | null)?.simple;
      if (simpleDef) {
        setSimple(simpleDef);
      } else if (def?.nodes?.length) {
        const result = tryLinearizeFlow(def);
        setSimple(result.simple);
        if (result.warnings.length) {
          setWarning(
            `This automation was created with the legacy canvas. ${result.warnings.join(" ")} Review the steps below before publishing.`,
          );
        }
      } else {
        setSimple(EMPTY_SIMPLE);
      }
    }
  }
  if (name === null && automation?.name) setName(automation.name);

  const saveTemplate = useMutation({
    mutationFn: () =>
      api.put(`/api/automations/templates/${id}`, { name: name ?? "", simple }),
    onSuccess: () => {
      setMessage("Template saved.");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["automation-template", id] });
      queryClient.invalidateQueries({ queryKey: ["automation-templates"] });
      queryClient.invalidateQueries({ queryKey: ["automation", id] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Save failed"),
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/api/automations/${id}/publish`, { simple }),
    onSuccess: () => {
      setMessage("Published.");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["automation-latest", id] });
      queryClient.invalidateQueries({ queryKey: ["automation", id] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Publish failed"),
  });

  const test = useMutation({
    mutationFn: async () => {
      await api.post(`/api/automations/${id}/publish`, { simple });
      return api.post(`/api/automations/${id}/test`, {
        message: "hi there",
        variables: { message: "hi there" },
      });
    },
    onSuccess: (r) => {
      const result = r as unknown as { status: string };
      setMessage(`Test execution ${result.status}.`);
      queryClient.invalidateQueries({ queryKey: ["automation-latest", id] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Test failed"),
  });

  if (!id || !simple) {
    return (
      <div className="p-6">
        <Text variant="secondary">Loading…</Text>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kumo-line px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" shape="square" onClick={() => navigate("/automations")} aria-label="Back">
            <ArrowLeft size={16} />
          </Button>
          <Input value={name ?? ""} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-64" />
          {isTemplate ? <Badge variant="info">Template</Badge> : automation ? <StatusBadge status={automation.status} /> : null}
        </div>
        <div className="flex items-center gap-2">
          {isTemplate ? (
            <Button variant="primary" size="sm" onClick={() => saveTemplate.mutate()} loading={saveTemplate.isPending}>
              <FloppyDisk size={14} /> Save template
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => test.mutate()} loading={test.isPending}>
                <Check size={14} /> Test
              </Button>
              <Button variant="primary" size="sm" onClick={() => publish.mutate()} loading={publish.isPending}>
                <PaperPlaneTilt size={14} /> Publish
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-3xl gap-4 px-6 py-6">
        {warning ? (
          <Text variant="secondary" DANGEROUS_className="rounded-lg bg-kumo-recessed p-3">{warning}</Text>
        ) : null}
        {error ? <Text variant="error">{error}</Text> : null}
        {message ? <Text variant="success">{message}</Text> : null}
        {isTemplate ? (
          <Text variant="secondary">
            Templates are designs — they never run by themselves. They are instantiated (with any per-post edits) when
            attached to a post in the composer.
          </Text>
        ) : null}

        <SimpleAutomationEditor value={simple} onChange={setSimple} />
      </div>
    </div>
  );
}
