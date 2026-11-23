import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Select, Surface, Text, Textarea } from "@cloudflare/kumo";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock,
  PaperPlaneTilt,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import {
  AUTOMATION_NODE_TYPES,
  getNodeType,
  tryLinearizeFlow,
  type NodeConfigField,
  type SimpleStep,
  type SimpleAutomation,
} from "@shared/automation";
import type { FlowDefinition } from "@shared/types";

/** Step categories offered in the simple editor (branch/AI/flow excluded). */
const STEP_CATEGORIES: { group: string; types: string[] }[] = (() => {
  const excluded = new Set(["logic.condition", "logic.keyword", "logic.random", "logic.business_hours"]);
  const groups = new Map<string, string[]>();
  for (const node of AUTOMATION_NODE_TYPES) {
    if (node.category === "trigger" || node.category === "flow" || node.category === "ai") continue;
    if (excluded.has(node.type)) continue;
    const list = groups.get(node.category) ?? [];
    list.push(node.type);
    groups.set(node.category, list);
  }
  return [...groups.entries()].map(([group, types]) => ({ group, types }));
})();

const CATEGORY_LABELS: Record<string, string> = {
  message: "Messages",
  logic: "Logic",
  contact: "Contact",
  action: "Actions",
};

const TRIGGERS = AUTOMATION_NODE_TYPES.filter((n) => n.category === "trigger");

function newStepId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

export function AutomationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: automation } = useQuery({
    queryKey: ["automation", id],
    queryFn: () => api.get<{ id: string; name: string; status: string }>(`/api/automations/${id}`),
    enabled: !!id,
  });
  const { data: latest } = useQuery({
    queryKey: ["automation-latest", id],
    queryFn: () => api.get<{ version: number; definition: FlowDefinition | null }>(`/api/automations/${id}/latest`),
    enabled: !!id,
  });

  // ---- editable state (seeded once from the saved version) -----------------
  const [name, setName] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState("trigger.keyword");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({ keywords: "hi" });
  const [steps, setSteps] = useState<SimpleStep[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loaded && latest) {
    setLoaded(true);
    const def = latest.definition;
    const simpleDef = (def as { simple?: SimpleAutomation } | null)?.simple;
    if (simpleDef) {
      setTriggerType(simpleDef.triggerType);
      setTriggerConfig(simpleDef.triggerConfig ?? {});
      setSteps(simpleDef.steps ?? []);
    } else if (def?.nodes?.length) {
      const result = tryLinearizeFlow(def);
      setTriggerType(result.simple.triggerType);
      setTriggerConfig(result.simple.triggerConfig ?? {});
      setSteps(result.simple.steps);
      if (result.warnings.length) {
        setWarning(
          `This automation was created with the legacy canvas. ${result.warnings.join(" ")} Review the steps below before publishing.`,
        );
      }
    }
  }
  if (name === null && automation?.name) setName(automation.name);

  const simple: SimpleAutomation = useMemo(
    () => ({ triggerType, triggerConfig, steps }),
    [triggerType, triggerConfig, steps],
  );

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
      // Ensure the published version matches what's on screen, then run it.
      await api.post(`/api/automations/${id}/publish`, { simple });
      return api.post(`/api/automations/${id}/test`, { message: "hi there", variables: { message: "hi there" } });
    },
    onSuccess: (r) => {
      const result = r as unknown as { status: string };
      setMessage(`Test execution ${result.status}.`);
      queryClient.invalidateQueries({ queryKey: ["automation-latest", id] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Test failed"),
  });

  if (!id) return null;

  const triggerInfo = getNodeType(triggerType);
  const updateTrigger = (type: string) => {
    setTriggerType(type);
    setTriggerConfig({});
  };
  const updateStep = (stepId: string, patch: Partial<SimpleStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
  };
  const moveStep = (index: number, delta: number) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kumo-line px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" shape="square" onClick={() => navigate("/automations")} aria-label="Back">
            <ArrowLeft size={16} />
          </Button>
          <Input value={name ?? ""} onChange={(e) => setName(e.target.value)} placeholder="Automation name" className="w-64" />
          {automation && <StatusBadge status={automation.status} />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => test.mutate()} loading={test.isPending}>
            <Check size={14} /> Test
          </Button>
          <Button variant="primary" size="sm" onClick={() => publish.mutate()} loading={publish.isPending}>
            <PaperPlaneTilt size={14} /> Publish
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-3xl gap-4 px-6 py-6">
        {warning ? (
          <Surface className="rounded-lg p-3">
            <Text variant="secondary">{warning}</Text>
          </Surface>
        ) : null}
        {error ? <Text variant="error">{error}</Text> : null}
        {message ? <Text variant="success">{message}</Text> : null}

        {/* ---- Trigger ---- */}
        <Surface className="rounded-lg p-4">
          <Text as="h2" variant="heading" DANGEROUS_className="mb-3">When this happens</Text>
          <div className="grid gap-3">
            <Select
              label="Trigger"
              items={TRIGGERS.map((t) => ({ value: t.type, label: t.label }))}
              value={triggerType}
              onValueChange={(v) => updateTrigger(v as string)}
              description={triggerInfo?.description}
            />
            <ConfigFields
              fields={triggerInfo?.config ?? []}
              values={triggerConfig}
              onChange={(key, value) => setTriggerConfig((prev) => ({ ...prev, [key]: value }))}
            />
          </div>
        </Surface>

        {/* ---- Steps ---- */}
        <div className="grid gap-3">
          <Text as="h2" variant="heading">Then do this</Text>
          {steps.length === 0 ? (
            <Surface className="rounded-lg p-6 text-center">
              <Text variant="secondary">No steps yet — add the first action below.</Text>
            </Surface>
          ) : (
            steps.map((step, index) => {
              const info = getNodeType(step.type);
              return (
                <Surface key={step.id} className="rounded-lg p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <Text DANGEROUS_className="font-medium">{info?.label ?? step.type}</Text>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="secondary" size="sm" shape="square" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label="Move up">
                        <ArrowUp size={13} />
                      </Button>
                      <Button variant="secondary" size="sm" shape="square" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} aria-label="Move down">
                        <ArrowDown size={13} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        shape="square"
                        onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                        aria-label="Delete step"
                      >
                        <Trash size={13} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <ConfigFields
                      fields={info?.config ?? []}
                      values={step.config}
                      onChange={(key, value) => updateStep(step.id, { config: { ...step.config, [key]: value } })}
                    />

                    {/* Guard */}
                    <div className="border-t border-kumo-line pt-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!step.guard}
                          onChange={(e) =>
                            updateStep(step.id, {
                              guard: e.target.checked ? { keywords: "", match: "contains" } : undefined,
                            })
                          }
                          className="accent-[var(--color-kumo-brand)]"
                        />
                        <Text>Only run when the message contains</Text>
                      </label>
                      {step.guard && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <div className="min-w-48 flex-1">
                            <Input
                              label="Keywords"
                              value={step.guard.keywords}
                              onChange={(e) => updateStep(step.id, { guard: { ...step.guard!, keywords: e.target.value } })}
                              placeholder="PRICE, PRICING"
                              description="Comma separated."
                            />
                          </div>
                          <Select
                            label="Match"
                            items={[{ value: "contains", label: "Contains" }, { value: "exact", label: "Exact word" }]}
                            value={step.guard.match}
                            onValueChange={(v) => updateStep(step.id, { guard: { ...step.guard!, match: v as "contains" | "exact" } })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Surface>
              );
            })
          )}

          {/* Add step */}
          <div>
            {!addOpen ? (
              <Button variant="secondary" onClick={() => setAddOpen(true)}>
                <Plus size={15} /> Add step
              </Button>
            ) : (
              <Surface className="rounded-lg p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Text as="h3" variant="heading">Add a step</Text>
                  <Button variant="secondary" size="sm" shape="square" onClick={() => setAddOpen(false)} aria-label="Close">
                    <X size={14} />
                  </Button>
                </div>
                <div className="grid gap-4">
                  {STEP_CATEGORIES.map((cat) => (
                    <div key={cat.group}>
                      <Text variant="secondary" DANGEROUS_className="mb-1 block">{CATEGORY_LABELS[cat.group] ?? cat.group}</Text>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.types.map((type) => {
                          const info = getNodeType(type)!;
                          return (
                            <Button
                              key={type}
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSteps((prev) => [...prev, { id: newStepId(), type, config: {} }]);
                                setAddOpen(false);
                              }}
                              title={info.description}
                            >
                              {info.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Surface>
            )}
          </div>
        </div>

        <Text variant="secondary">
          Steps run top to bottom. A step with a keyword condition is skipped when the inbound message doesn't match.
          <Clock size={12} className="inline" /> Wait steps pause the automation and resume automatically.
        </Text>
      </div>
    </div>
  );
}

/** Render a node type's config schema as Kumo form fields. */
function ConfigFields({
  fields,
  values,
  onChange,
}: {
  fields: NodeConfigField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-3">
      {fields.map((field) => {
        const value = typeof values[field.key] === "string" ? (values[field.key] as string) : "";
        if (field.type === "textarea") {
          return (
            <Textarea
              key={field.key}
              label={field.label}
              description={field.description}
              value={value}
              onChange={(e) => onChange(field.key, e.target.value)}
              rows={3}
            />
          );
        }
        if (field.type === "select") {
          return (
            <Select
              key={field.key}
              label={field.label}
              description={field.description}
              items={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
              value={values[field.key] !== undefined ? String(values[field.key]) : undefined}
              onValueChange={(v) => onChange(field.key, v)}
            />
          );
        }
        if (field.type === "switch") {
          return (
            <label key={field.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(values[field.key])}
                onChange={(e) => onChange(field.key, e.target.checked)}
                className="accent-[var(--color-kumo-brand)]"
              />
              <Text>{field.label}</Text>
            </label>
          );
        }
        return (
          <Input
            key={field.key}
            label={field.label}
            description={field.description}
            type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
            value={field.type === "number" && values[field.key] !== undefined ? String(values[field.key]) : value}
            onChange={(e) => onChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
            placeholder={field.placeholder}
          />
        );
      })}
    </div>
  );
}
