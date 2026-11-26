import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Select, Text, Textarea } from "@cloudflare/kumo";
import { ArrowRight, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import { PlatformIcon } from "@/lib/platform-icon";
import { getPlatform } from "@shared/capabilities";
import type { Campaign } from "@shared/types";

interface PlannerItem {
  id: string;
  title: string;
  notes: string | null;
  platformId: string | null;
  status: "idea" | "drafting" | "review" | "approved" | "done";
  tags: string[];
  campaignId: string | null;
  dueAt: string | null;
  postId: string | null;
  createdAt: string;
}

const COLUMNS: { key: PlannerItem["status"]; label: string }[] = [
  { key: "idea", label: "Ideas" },
  { key: "drafting", label: "Drafting" },
  { key: "review", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "done", label: "Done" },
];

const emptyForm = { title: "", notes: "", platformId: "", campaignId: "", tags: "", dueAt: "" };

export function PlannerBoardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: items } = useQuery({
    queryKey: ["planner", search, campaignFilter],
    queryFn: () =>
      api.get<PlannerItem[]>(
        `/api/planner?search=${encodeURIComponent(search)}&campaignId=${encodeURIComponent(campaignFilter)}`,
      ),
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<Campaign[]>("/api/campaigns"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["planner"] });

  const createItem = useMutation({
    mutationFn: () =>
      api.post("/api/planner", {
        title: form.title,
        notes: form.notes || null,
        platformId: form.platformId || null,
        campaignId: form.campaignId || null,
        tags: form.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      }),
    onSuccess: () => { closeModal(); invalidate(); },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Could not save"),
  });

  const updateItem = useMutation({
    mutationFn: (patch: { id: string } & Record<string, unknown>) =>
      api.patch<PlannerItem>(`/api/planner/${patch.id}`, patch),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/api/planner/${id}`),
    onSuccess: invalidate,
  });

  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(emptyForm); setError(null); };

  const openCreate = (dueAt?: string) => {
    setEditing(null);
    setForm({ ...emptyForm, dueAt: dueAt ?? "" });
    setModalOpen(true);
  };

  const openEdit = (item: PlannerItem) => {
    setEditing(item);
    setForm({
      title: item.title,
      notes: item.notes ?? "",
      platformId: item.platformId ?? "",
      campaignId: item.campaignId ?? "",
      tags: item.tags.join(", "),
      dueAt: item.dueAt ? item.dueAt.slice(0, 10) : "",
    });
    setModalOpen(true);
  };

  const byColumn = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const item of items ?? []) map.get(item.status)?.push(item);
    return map;
  }, [items]);

  const campaignName = (id: string | null) => (campaigns ?? []).find((c) => c.id === id)?.name ?? null;

  const onDropColumn = (status: PlannerItem["status"]) => {
    if (!dragId) return;
    const item = (items ?? []).find((i) => i.id === dragId);
    setDragId(null);
    if (!item || item.status === status) return;
    updateItem.mutate({ id: item.id, status });
  };

  return (
    <div>
      <PageHeader
        title="Content planner"
        description="Capture ideas, move them through your pipeline, and convert them into posts when they're ready."
        actions={
          <Button variant="primary" onClick={() => openCreate()}>
            <Plus size={15} /> New idea
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-2 px-6 pb-4">
        <div className="min-w-56 flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ideas and notes…" />
        </div>
        <div className="w-52">
          <Select
            label="Campaign"
            items={[{ value: "", label: "All campaigns" }, ...(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            value={campaignFilter || undefined}
            onValueChange={(v) => setCampaignFilter((v as string) ?? "")}
          />
        </div>
      </div>

      <div className="grid gap-3 px-6 pb-8 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const columnItems = byColumn.get(col.key) ?? [];
          return (
            <div
              key={col.key}
              className="min-h-96 rounded-lg bg-kumo-recessed p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropColumn(col.key)}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <Text DANGEROUS_className="font-medium">{col.label}</Text>
                <Badge variant="outline">{columnItems.length}</Badge>
              </div>
              <div className="grid gap-2">
                {columnItems.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`cursor-grab rounded-lg border border-kumo-line bg-kumo-elevated p-3 ${dragId === item.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Text DANGEROUS_className="text-[14px] font-medium">{item.title}</Text>
                      {item.platformId && (
                        <PlatformIcon name={getPlatform(item.platformId)?.icon ?? "Circle"} size={15} color={getPlatform(item.platformId)?.color} />
                      )}
                    </div>
                    {item.notes ? (
                      <Text variant="secondary" DANGEROUS_className="mt-1 line-clamp-3 block whitespace-pre-wrap text-[14px]">{item.notes}</Text>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {item.dueAt && (
                        <Badge variant="outline">{new Date(item.dueAt).toLocaleDateString()}</Badge>
                      )}
                      {campaignName(item.campaignId) && <Badge variant="secondary">{campaignName(item.campaignId)}</Badge>}
                      {item.tags.map((t) => (
                        <Badge key={t} variant="outline">#{t}</Badge>
                      ))}
                      {item.postId && <Badge variant="success">Post created</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {!item.postId && item.status !== "done" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/publishing/composer?idea=${item.id}`)}
                        >
                          <ArrowRight size={12} /> Convert to post
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" shape="square" onClick={() => openEdit(item)} aria-label="Edit idea">
                        <PencilSimple size={12} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        shape="square"
                        onClick={() => deleteItem.mutate(item.id)}
                        aria-label="Delete idea"
                      >
                        <Trash size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
                {columnItems.length === 0 && (
                  <Text variant="secondary" DANGEROUS_className="px-1 py-6 text-center text-[14px]">Drop ideas here</Text>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={(v) => { if (!v) closeModal(); }}
        title={editing ? "Edit idea" : "New idea"}
        description="Ideas live in the planner until you convert them into a post."
        footer={
          editing ? (
            <ModalFooter
              onClose={closeModal}
              submitLabel="Save"
              loading={updateItem.isPending}
              onSubmit={() =>
                updateItem.mutate({
                  id: editing.id,
                  title: form.title,
                  notes: form.notes || null,
                  platformId: form.platformId || null,
                  campaignId: form.campaignId || null,
                  tags: form.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
                  dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                })
              }
            />
          ) : (
            <ModalFooter onClose={closeModal} submitLabel="Add idea" loading={createItem.isPending} onSubmit={() => createItem.mutate()} />
          )
        }
      >
        {editing
          ? updateItem.isError && error ? <Text variant="error">{error}</Text> : null
          : createItem.isError && error ? <Text variant="error">{error}</Text> : null}
        <div className="grid gap-3">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Behind-the-scenes reel" />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="What should this post cover?" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Planned date" type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            <Select
              label="Platform"
              items={[{ value: "", label: "Any platform" }, ...["instagram", "x", "threads", "linkedin", "tiktok", "youtube", "facebook", "bluesky", "mastodon", "pinterest", "reddit"].map((p) => ({ value: p, label: getPlatform(p)?.name ?? p }))]}
              value={form.platformId || undefined}
              onValueChange={(v) => setForm({ ...form, platformId: (v as string) ?? "" })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Campaign"
              items={[{ value: "", label: "No campaign" }, ...(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              value={form.campaignId || undefined}
              onValueChange={(v) => setForm({ ...form, campaignId: (v as string) ?? "" })}
            />
            <Input label="Tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="education, behind-the-scenes" description="Comma separated." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
