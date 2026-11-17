import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Select, Surface, Tabs, Text, Textarea } from "@cloudflare/kumo";
import {
  CalendarBlank,
  Check,
  Clock,
  Hash,
  ImageSquare,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  Tag,
  Upload,
  X,
} from "@phosphor-icons/react";
import { api, ApiClientError } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import { PlatformIcon } from "@/lib/platform-icon";
import { getPlatform, getPlatformLimit, supports } from "@shared/capabilities";
import type { Campaign, ConnectedAccount, MediaAsset } from "@shared/types";

const EMOJIS = ["😀", "🔥", "🎉", "❤️", "👍", "🚀", "✨", "📣", "💡", "📈", "👏", "🙌", "😊", "📷", "🎯", "✅"];

const DEFAULT_PLATFORM = "bluesky";

interface VariantState {
  text: string;
  link: string;
  firstComment: string;
  location: string;
  altText: string;
}

const emptyVariant = (text = ""): VariantState => ({ text, link: "", firstComment: "", location: "", altText: "" });

export function ComposerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<ConnectedAccount[]>("/api/accounts"),
  });
  const { data: mediaData } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: MediaAsset[]; nextCursor: string | null }>("/api/media?limit=100"),
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<Campaign[]>("/api/campaigns"),
  });

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [variants, setVariants] = useState<Record<string, VariantState>>({ [DEFAULT_PLATFORM]: emptyVariant() });
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_PLATFORM);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaAssets = mediaData?.items ?? [];

  // Derived from stable inputs only — `accounts` (query cache) and
  // `selectedAccounts` (state). A new array here would re-trigger the effect
  // below every render and cause an infinite loop (React error #185).
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const a of accounts ?? []) {
      if (selectedAccounts.includes(a.id)) set.add(a.providerId);
    }
    if (set.size === 0) set.add(DEFAULT_PLATFORM);
    return [...set].sort();
  }, [accounts, selectedAccounts]);

  const selectedMedia = useMemo(
    () => mediaAssets.filter((m) => mediaIds.includes(m.id)),
    [mediaAssets, mediaIds],
  );

  // Ensure every platform has a variant entry and the active tab stays valid.
  // Returning `prev` unchanged lets React bail out instead of re-rendering.
  useEffect(() => {
    setVariants((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of platforms) {
        if (!next[p]) {
          next[p] = emptyVariant(prev[DEFAULT_PLATFORM]?.text ?? "");
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (!platforms.includes(activeTab)) setActiveTab(platforms[0] ?? DEFAULT_PLATFORM);
  }, [platforms, activeTab]);

  const activeVariant: VariantState = variants[activeTab] ?? variants[DEFAULT_PLATFORM] ?? emptyVariant();

  const updateVariant = (key: keyof VariantState, value: string) => {
    setVariants((prev) => ({ ...prev, [activeTab]: { ...(prev[activeTab] ?? emptyVariant()), [key]: value } }));
  };

  const applyTextToAll = (text: string) => {
    setVariants((prev) => {
      const next = { ...prev };
      for (const p of platforms) next[p] = { ...(next[p] ?? emptyVariant()), text };
      return next;
    });
  };

  const insertAtCursor = (token: string) => {
    const el = captionRef.current;
    if (!el) {
      updateVariant("text", activeVariant.text + token);
      return;
    }
    const start = el.selectionStart ?? activeVariant.text.length;
    const end = el.selectionEnd ?? start;
    const next = activeVariant.text.slice(0, start) + token + activeVariant.text.slice(end);
    updateVariant("text", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addHashtag = () => {
    const tags = hashtagInput.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    if (!tags.length) return;
    setHashtags((prev) => [...new Set([...prev, ...tags])]);
    setHashtagInput("");
  };

  const insertHashtags = () => {
    if (!hashtags.length) return;
    const suffix = hashtags.map((t) => `#${t}`).join(" ");
    const next = activeVariant.text.trim() ? `${activeVariant.text.trimEnd()} ${suffix}` : suffix;
    updateVariant("text", next);
  };

  const toggleAccount = (id: string) =>
    setSelectedAccounts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const uploadMedia = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<MediaAsset>("/api/media", form);
    },
    onSuccess: (asset) => {
      setMediaIds((prev) => [...prev, asset.id]);
      queryClient.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Upload failed"),
  });

  const publish = useMutation({
    mutationFn: ({ mode }: { mode: "now" | "schedule" | "draft" | "approval" }) =>
      api.post("/api/posts", {
        variants: platforms.map((p) => {
          const v = variants[p] ?? emptyVariant();
          return {
            providerId: p,
            text: v.text,
            link: v.link || null,
            firstComment: v.firstComment || null,
            location: v.location || null,
            altText: v.altText || null,
            mediaIds,
          };
        }),
        accountIds: selectedAccounts,
        scheduledFor: mode === "schedule" && schedule ? new Date(schedule).toISOString() : null,
        publishNow: mode === "now",
        campaignId: campaignId || null,
      }),
    onSuccess: async (post, { mode }) => {
      if (mode === "approval") {
        await api.post("/api/approvals", { postId: (post as { id: string }).id });
        navigate("/approvals");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate(mode === "now" ? "/publishing/queue" : mode === "schedule" ? "/publishing/calendar" : "/publishing/drafts");
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : "Failed to create post"),
  });

  const tabs = useMemo(
    () => platforms.map((p) => ({ value: p, label: getPlatform(p)?.name ?? p })),
    [platforms],
  );
  const charCount = activeVariant.text.length;
  const charLimit = getPlatformLimit(activeTab, "maxTextLength");
  const overLimit = charLimit !== undefined && charCount > charLimit;

  return (
    <div>
      <PageHeader
        title="Composer"
        description="Create a post, tailor it per platform, and publish or schedule it."
        actions={
          <Button variant="secondary" onClick={() => navigate("/media")}><ImageSquare size={15} /> Media library</Button>
        }
      />

      <div className="grid gap-4 px-6 pb-8 lg:grid-cols-[280px_1fr_300px]">
        {/* ---- Accounts ---- */}
        <div className="grid content-start gap-3">
          <Surface className="rounded-lg p-3">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-2 px-1">Accounts</Text>
            {(accounts ?? []).length === 0 ? (
              <div className="px-1">
                <Text variant="secondary">No connected accounts yet.</Text>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate("/settings/accounts")}>Connect an account</Button>
              </div>
            ) : (
              <div className="grid gap-0.5">
                {(accounts ?? []).map((a) => {
                  const p = getPlatform(a.providerId);
                  return (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-kumo-tint">
                      <input
                        type="checkbox"
                        checked={selectedAccounts.includes(a.id)}
                        onChange={() => toggleAccount(a.id)}
                        className="accent-[var(--color-kumo-brand)]"
                      />
                      <PlatformIcon name={p?.icon ?? "Circle"} size={16} color={p?.color} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{a.accountName}</span>
                      {a.status !== "connected" && <Badge variant="warning">!</Badge>}
                    </label>
                  );
                })}
              </div>
            )}
          </Surface>

          <Surface className="rounded-lg p-3">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-2 px-1">Media</Text>
            <div className="grid grid-cols-3 gap-1.5">
              {selectedMedia.map((m) => (
                <div key={m.id} className="group relative overflow-hidden rounded-md border border-kumo-line">
                  {m.mimeType.startsWith("image/") ? (
                    <img src={m.url} alt={m.filename} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-kumo-recessed text-kumo-subtle">video</div>
                  )}
                  <button
                    onClick={() => setMediaIds((prev) => prev.filter((id) => id !== m.id))}
                    className="absolute right-0.5 top-0.5 rounded bg-kumo-overlay p-0.5 text-white opacity-0 group-hover:opacity-100"
                    aria-label="Remove media"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setMediaPickerOpen(true)}
                className="flex aspect-square items-center justify-center rounded-md border border-dashed border-kumo-line text-kumo-subtle hover:bg-kumo-tint"
                aria-label="Add media"
              >
                <Plus size={16} />
              </button>
            </div>
            <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => setMediaPickerOpen(true)}>
              <ImageSquare size={14} /> Browse library
            </Button>
          </Surface>
        </div>

        {/* ---- Content editor ---- */}
        <div className="grid content-start gap-3">
          <Surface className="rounded-lg p-4">
            <Tabs
              tabs={tabs.length ? tabs : [{ value: DEFAULT_PLATFORM, label: getPlatform(DEFAULT_PLATFORM)?.name ?? DEFAULT_PLATFORM }]}
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as string)}
              variant="underline"
              size="sm"
            />

            <div className="mt-3 grid gap-3">
              {/* Caption */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Text as="label" variant="secondary" DANGEROUS_className="text-[14px]">Caption</Text>
                  <div className="flex items-center gap-1">
                    {charLimit !== undefined && (
                      <Text variant={overLimit ? "error" : "secondary"} DANGEROUS_className="mono-nums text-[14px]">
                        {charCount}/{charLimit}
                      </Text>
                    )}
                  </div>
                </div>
                <Textarea
                  ref={captionRef}
                  value={activeVariant.text}
                  onChange={(e) => {
                    updateVariant("text", e.target.value);
                    if (platforms.length > 1) applyTextToAll(e.target.value);
                  }}
                  placeholder="Write your post…"
                  rows={5}
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Button variant="secondary" size="sm" onClick={() => setEmojiOpen((v) => !v)}><Sparkle size={13} /> Emoji</Button>
                  <Button variant="secondary" size="sm" onClick={() => insertAtCursor("#")}><Hash size={13} /> Hashtag</Button>
                  <Button variant="secondary" size="sm" onClick={() => insertAtCursor("@")}>@ Mention</Button>
                </div>
                {emojiOpen && (
                  <div className="mt-2 flex flex-wrap gap-1 rounded-md bg-kumo-recessed p-2">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => insertAtCursor(e)} className="rounded px-1 text-[16px] hover:bg-kumo-tint">{e}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Link */}
              <Input
                label="Link"
                value={activeVariant.link}
                onChange={(e) => updateVariant("link", e.target.value)}
                placeholder="https://… (optional)"
              />

              {/* Hashtag manager */}
              <div>
                <Text as="label" variant="secondary" DANGEROUS_className="mb-1 block text-[14px]">Hashtags</Text>
                <div className="flex gap-2">
                  <Input value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHashtag(); } }} placeholder="Add hashtags…" />
                  <Button variant="secondary" onClick={addHashtag}><Tag size={14} /></Button>
                </div>
                {hashtags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {hashtags.map((t) => (
                      <Badge key={t} variant="outline">
                        #{t}
                        <button onClick={() => setHashtags((prev) => prev.filter((x) => x !== t))} className="ml-1" aria-label="Remove hashtag"><X size={11} /></button>
                      </Badge>
                    ))}
                    <Button variant="secondary" size="sm" onClick={insertHashtags}>Insert into caption</Button>
                  </div>
                )}
              </div>

              {/* Platform-gated fields */}
              {platforms.some((p) => supports(p, "firstComment")) && (
                <Textarea
                  label="First comment"
                  description="Published as a first comment where the platform supports it."
                  value={activeVariant.firstComment}
                  onChange={(e) => updateVariant("firstComment", e.target.value)}
                  rows={2}
                />
              )}
              {platforms.some((p) => supports(p, "location")) && (
                <Input
                  label="Location"
                  description="Location tag where supported."
                  value={activeVariant.location}
                  onChange={(e) => updateVariant("location", e.target.value)}
                  placeholder="e.g. London, UK"
                />
              )}
              {selectedMedia.length > 0 && (
                <Input
                  label="Alt text"
                  description="Accessible description for the cover image."
                  value={activeVariant.altText}
                  onChange={(e) => updateVariant("altText", e.target.value)}
                />
              )}
            </div>
          </Surface>
        </div>

        {/* ---- Publish settings ---- */}
        <div className="grid content-start gap-3">
          <Surface className="rounded-lg p-4">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-3">Publish</Text>
            <div className="grid gap-3">
              <Input
                type="datetime-local"
                label="Schedule"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
              <Select
                label="Campaign"
                items={(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))}
                value={campaignId || undefined}
                onValueChange={(v) => setCampaignId((v as string) ?? "")}
                placeholder="No campaign"
              />
              {error ? <Text variant="error">{error}</Text> : null}
              <div className="grid gap-2 border-t border-kumo-line pt-3">
                <Button variant="primary" loading={publish.isPending} disabled={selectedAccounts.length === 0} onClick={() => publish.mutate({ mode: "now" })}>
                  <PaperPlaneTilt size={15} /> Publish now
                </Button>
                <Button variant="secondary" disabled={selectedAccounts.length === 0 || !schedule} onClick={() => publish.mutate({ mode: "schedule" })}>
                  <CalendarBlank size={15} /> Schedule
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => publish.mutate({ mode: "draft" })}>
                    <Clock size={14} /> Save draft
                  </Button>
                  <Button variant="secondary" disabled={selectedAccounts.length === 0} onClick={() => publish.mutate({ mode: "approval" })}>
                    <Check size={14} /> Submit
                  </Button>
                </div>
              </div>
            </div>
          </Surface>

          <Surface className="rounded-lg p-4">
            <Text as="h2" variant="heading" DANGEROUS_className="mb-2">Preview</Text>
            <div className="grid gap-2">
              {platforms.map((p) => {
                const v = variants[p] ?? emptyVariant();
                const limit = getPlatformLimit(p, "maxTextLength");
                return (
                  <div key={p} className="rounded-md bg-kumo-recessed p-2.5">
                    <div className="flex items-center gap-1.5">
                      <PlatformIcon name={getPlatform(p)?.icon ?? "Circle"} size={14} />
                      <Text DANGEROUS_className="text-[14px] font-medium">{getPlatform(p)?.name ?? p}</Text>
                      {limit !== undefined && (
                        <Text variant="secondary" DANGEROUS_className="mono-nums ml-auto text-[14px]">{v.text.length}/{limit}</Text>
                      )}
                    </div>
                    <Text variant="secondary" DANGEROUS_className="mt-1 block whitespace-pre-wrap text-[14px]">{v.text || "(empty)"}</Text>
                    {selectedMedia.length > 0 && (
                      <div className="mt-1.5 flex gap-1">
                        {selectedMedia.slice(0, 3).map((m) => (
                          <img key={m.id} src={m.url} alt="" className="h-8 w-8 rounded object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
      </div>

      {/* ---- Media picker modal ---- */}
      <MediaPicker
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        media={mediaAssets}
        selected={mediaIds}
        onToggle={(id) => setMediaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
        onUpload={(f) => uploadMedia.mutate(f)}
        uploading={uploadMedia.isPending}
      />
    </div>
  );
}

function MediaPicker({
  open,
  onOpenChange,
  media,
  selected,
  onToggle,
  onUpload,
  uploading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  media: MediaAsset[];
  selected: string[];
  onToggle: (id: string) => void;
  onUpload: (f: File) => void;
  uploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Select media"
      description="Choose assets from your library or upload new ones."
      footer={<ModalFooter onClose={() => onOpenChange(false)} submitLabel="Done" onSubmit={() => onOpenChange(false)} />}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach((f) => onUpload(f));
          e.target.value = "";
        }}
      />
      <Button variant="secondary" size="sm" className="mb-3" onClick={() => fileRef.current?.click()} loading={uploading}>
        <Upload size={14} /> Upload
      </Button>
      {media.length === 0 ? (
        <Text variant="secondary">Your media library is empty.</Text>
      ) : (
        <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto pf-scroll">
          {media.map((m) => {
            const isSelected = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => onToggle(m.id)}
                className={`relative overflow-hidden rounded-md border ${isSelected ? "border-kumo-brand ring-1 ring-kumo-brand" : "border-kumo-line"}`}
              >
                {m.mimeType.startsWith("image/") ? (
                  <img src={m.url} alt={m.filename} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-kumo-recessed text-kumo-subtle">video</div>
                )}
                {isSelected && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-kumo-brand text-white"><Check size={11} /></span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
