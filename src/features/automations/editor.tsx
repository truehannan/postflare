import { useState } from "react";
import { Badge, Button, Input, Select, Surface, Text, Textarea } from "@cloudflare/kumo";
import { ArrowDown, ArrowUp, Plus, Trash, X } from "@phosphor-icons/react";
import {
  AUTOMATION_NODE_TYPES,
  getNodeType,
  type NodeConfigField,
  type SimpleAutomation,
  type SimpleStep,
} from "@shared/automation";

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

/** Render a node type's config schema as Kumo form fields. */
export function ConfigFields({
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

/**
 * The static automation editor: one trigger plus an ordered list of steps,
 * each optionally guarded by a keyword condition. Controlled — state lives in
 * the parent. Used by the template builder and the composer's per-post edit.
 */
export function SimpleAutomationEditor({
  value,
  onChange,
}: {
  value: SimpleAutomation;
  onChange: (next: SimpleAutomation) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const triggerInfo = getNodeType(value.triggerType);
  const updateTrigger = (type: string) => onChange({ ...value, triggerType: type, triggerConfig: {} });
  const updateStep = (stepId: string, patch: Partial<SimpleStep>) =>
    onChange({ ...value, steps: value.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) });
  const moveStep = (index: number, delta: number) =>
    onChange({
      ...value,
      steps: (() => {
        const next = [...value.steps];
        const target = index + delta;
        if (target < 0 || target >= next.length) return value.steps;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      })(),
    });

  return (
    <div className="grid gap-4">
      {/* ---- Trigger ---- */}
      <Surface className="rounded-lg p-4">
        <Text as="h2" variant="heading" DANGEROUS_className="mb-3">When this happens</Text>
        <div className="grid gap-3">
          <Select
            label="Trigger"
            items={TRIGGERS.map((t) => ({ value: t.type, label: t.label }))}
            value={value.triggerType}
            onValueChange={(v) => updateTrigger(v as string)}
            description={triggerInfo?.description}
          />
          <ConfigFields
            fields={triggerInfo?.config ?? []}
            values={value.triggerConfig}
            onChange={(key, fieldValue) =>
              onChange({ ...value, triggerConfig: { ...value.triggerConfig, [key]: fieldValue } })
            }
          />
        </div>
      </Surface>

      {/* ---- Steps ---- */}
      <div className="grid gap-3">
        <Text as="h2" variant="heading">Then do this</Text>
        {value.steps.length === 0 ? (
          <Surface className="rounded-lg p-6 text-center">
            <Text variant="secondary">No steps yet — add the first action below.</Text>
          </Surface>
        ) : (
          value.steps.map((step, index) => {
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
                    <Button variant="secondary" size="sm" shape="square" disabled={index === value.steps.length - 1} onClick={() => moveStep(index, 1)} aria-label="Move down">
                      <ArrowDown size={13} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      shape="square"
                      onClick={() => onChange({ ...value, steps: value.steps.filter((s) => s.id !== step.id) })}
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
                    onChange={(key, fieldValue) => updateStep(step.id, { config: { ...step.config, [key]: fieldValue } })}
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
                              onChange({ ...value, steps: [...value.steps, { id: newStepId(), type, config: {} }] });
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
    </div>
  );
}
