import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Select, Text, Textarea } from "@cloudflare/kumo";
import { ArrowLeft, FloppyDisk, PaperPlaneTilt, Plus, Trash } from "@phosphor-icons/react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "@/lib/api";
import { AUTOMATION_NODE_TYPES, getNodeType } from "@shared/automation";
import type { FlowDefinition } from "@shared/types";

const nodeColor = (category: string) =>
  ({
    trigger: "var(--color-kumo-brand)",
    message: "var(--color-kumo-info)",
    logic: "var(--color-kumo-warning)",
    contact: "var(--color-kumo-success)",
    action: "var(--color-kumo-purple)",
    ai: "var(--color-kumo-danger)",
    flow: "var(--color-kumo-subtle)",
  })[category] ?? "var(--color-kumo-subtle)";

function FlowNode({ data }: { data: { label: string; category: string; outputs: string[]; isTerminal?: boolean } }) {
  return (
    <div className="min-w-40 rounded-md border border-kumo-line bg-kumo-elevated px-3 py-2 text-[14px]">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: nodeColor(data.category) }} />
        <span className="font-medium">{data.label}</span>
      </div>
      {!data.isTerminal && (
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5" />
      )}
      {!data.category.startsWith("trigger") && data.category !== "flow" && (
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5" />
      )}
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

export function AutomationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  const initialNodes: Node[] = useMemo(
    () => (latest?.definition?.nodes ?? []).map((n) => ({
      id: n.id,
      type: "flow",
      position: n.position,
      data: {
        type: n.type,
        label: getNodeType(n.type)?.label ?? n.type,
        category: getNodeType(n.type)?.category ?? "flow",
        outputs: getNodeType(n.type)?.outputs ?? [],
        isTerminal: getNodeType(n.type)?.isTerminal ?? false,
        ...n.data,
      },
    })),
    [latest],
  );
  const initialEdges: Edge[] = useMemo(
    () => (latest?.definition?.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined })),
    [latest],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Reset local state when the fetched definition changes.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (latest && loadedKey !== `${id}-${latest.version}`) {
    setLoadedKey(`${id}-${latest.version}`);
    setNodes(initialNodes);
    setEdges(initialEdges);
  }

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge({ ...connection, id: `e-${Date.now()}-${connection.source}-${connection.target}` }, eds)), [setEdges]);

  const addNode = (type: string) => {
    const info = getNodeType(type)!;
    const node: Node = {
      id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: "flow",
      position: { x: 120 + Math.random() * 200, y: 120 + Math.random() * 200 },
      data: { type, label: info.label, category: info.category, outputs: info.outputs, isTerminal: info.isTerminal },
    };
    setNodes((nds) => [...nds, node]);
    setSelectedNodeId(node.id);
  };

  const selected = nodes.find((n) => n.id === selectedNodeId);
  const selectedType = selected ? getNodeType((selected.data as { type?: string }).type ?? inferType(selected)) : null;

  const publish = useMutation({
    mutationFn: () =>
      api.post(`/api/automations/${id}/publish`, {
        definition: {
          nodes: nodes.map((n) => ({ id: n.id, type: inferType(n), position: { x: n.position.x, y: n.position.y }, data: cleanData(n.data) })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
        } as FlowDefinition,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-latest", id] });
      queryClient.invalidateQueries({ queryKey: ["automation", id] });
    },
  });

  const test = useMutation({
    mutationFn: () => api.post(`/api/automations/${id}/test`, { message: "Test message", variables: { message: "Test message" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-latest", id] }),
  });

  const updateSelectedData = (key: string, value: unknown) => {
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, [key]: value } } : n)));
  };

  if (!id) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-kumo-line px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" shape="square" onClick={() => navigate("/automations")} aria-label="Back"><ArrowLeft size={16} /></Button>
          <Text as="h1" variant="heading">{automation?.name ?? "Automation"}</Text>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => test.mutate()} loading={test.isPending}>Test</Button>
          <Button variant="primary" size="sm" onClick={() => publish.mutate()} loading={publish.isPending}><PaperPlaneTilt size={14} /> Publish</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <div className="w-52 shrink-0 overflow-y-auto border-r border-kumo-line bg-kumo-elevated p-2 pf-scroll">
          <Text variant="secondary" DANGEROUS_className="px-1 pb-1 text-[14px] font-medium">Nodes</Text>
          <div className="grid gap-0.5">
            {AUTOMATION_NODE_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => addNode(t.type)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(t.category) }} />
                <span className="truncate">{t.label}</span>
                <Plus size={12} className="ml-auto shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/* Config panel */}
        <div className="w-72 shrink-0 overflow-y-auto border-l border-kumo-line bg-kumo-elevated p-4 pf-scroll">
          {!selected ? (
            <Text variant="secondary">Select a node to configure it.</Text>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Text as="h2" variant="heading">{(selected.data as { label?: string }).label ?? "Node"}</Text>
                <Button variant="secondary" size="sm" shape="square" onClick={() => { setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId)); setSelectedNodeId(null); }} aria-label="Delete node"><Trash size={14} /></Button>
              </div>
              {selectedType?.config.map((field) => {
                const value = (selected.data as Record<string, unknown>)[field.key];
                return (
                  <div key={field.key}>
                    {field.type === "textarea" ? (
                      <Textarea label={field.label} value={(value as string) ?? ""} onChange={(e) => updateSelectedData(field.key, e.target.value)} />
                    ) : field.type === "select" ? (
                      <Select label={field.label} items={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))} value={(value as string) ?? ""} onValueChange={(v) => updateSelectedData(field.key, v)} />
                    ) : field.type === "switch" ? (
                      <label className="flex items-center justify-between gap-2 text-[14px]">
                        <span>{field.label}</span>
                        <input type="checkbox" checked={Boolean(value)} onChange={(e) => updateSelectedData(field.key, e.target.checked)} className="accent-[var(--color-kumo-brand)]" />
                      </label>
                    ) : (
                      <Input label={field.label} value={(value as string) ?? ""} onChange={(e) => updateSelectedData(field.key, e.target.value)} type={field.type === "secret" ? "password" : "text"} />
                    )}
                    {field.description ? <Text variant="secondary" DANGEROUS_className="mt-1 block text-[14px]">{field.description}</Text> : null}
                  </div>
                );
              })}
              {!selectedType?.config.length && <Text variant="secondary">This node has no configuration.</Text>}
              <div className="flex gap-2 border-t border-kumo-line pt-3">
                <Button variant="secondary" size="sm" onClick={() => publish.mutate()} loading={publish.isPending}><FloppyDisk size={14} /> Save & publish</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function inferType(node: Node): string {
  const d = node.data as Record<string, unknown>;
  if (typeof d.type === "string") return d.type;
  return "flow.start";
}

function cleanData(data: Record<string, unknown>): Record<string, unknown> {
  const { label, category, outputs, isTerminal, ...rest } = data;
  void label;
  void category;
  void outputs;
  void isTerminal;
  return rest;
}
