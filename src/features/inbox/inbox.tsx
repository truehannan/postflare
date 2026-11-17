import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Select, Surface, Text } from "@cloudflare/kumo";
import { PaperPlaneRight, NotePencil, XCircle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/lib/platform-icon";
import type { Conversation, Message } from "@shared/types";

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");

  const { data: conversations } = useQuery({
    queryKey: ["conversations", status, search],
    queryFn: () => api.get<{ items: Conversation[]; nextCursor: string | null }>(`/api/inbox/conversations?status=${status}&search=${encodeURIComponent(search)}&limit=100`),
  });
  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => api.get<{ id: string; title: string; body: string }[]>("/api/inbox/quick-replies"),
  });
  const { data: messages } = useQuery({
    queryKey: ["messages", selectedId],
    queryFn: () => (selectedId ? api.get<Message[]>(`/api/inbox/conversations/${selectedId}/messages`) : Promise.resolve([])),
    enabled: !!selectedId,
  });

  const sendReply = useMutation({
    mutationFn: () => api.post(`/api/inbox/conversations/${selectedId}/reply`, { text: reply }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/inbox/conversations/${id}/read`, { read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
  const closeConversation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/inbox/conversations/${id}/status`, { status: "closed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/api/inbox/conversations/${selectedId}/notes`, { body: note }),
    onSuccess: () => setNote(""),
  });

  const list = conversations?.items ?? [];
  const selected = list.find((c) => c.id === selectedId);

  return (
    <div>
      <PageHeader title="Inbox" description="A unified view of conversations across your connected channels." />
      <div className="flex gap-4 px-6 pb-6">
        {/* Left: conversation list */}
        <div className="flex w-80 shrink-0 flex-col gap-2">
          <div className="flex gap-2">
            <Select
              items={[{ value: "open", label: "Open" }, { value: "pending", label: "Pending" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]}
              value={status}
              onValueChange={(v) => setStatus(v as string)}
              size="sm"
            />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" size="sm" />
          </div>
          <Surface className="overflow-hidden rounded-lg">
            {list.length === 0 ? (
              <div className="px-3 py-8 text-center"><Text variant="secondary">No conversations.</Text></div>
            ) : (
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto pf-scroll">
                {list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedId(c.id); markRead.mutate(c.id); }}
                    className={`block w-full border-b border-kumo-line px-3 py-2.5 text-left hover:bg-kumo-tint ${selectedId === c.id ? "bg-kumo-tint" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <PlatformIcon name={c.providerId} size={14} />
                        <Text DANGEROUS_className="truncate text-[13px] font-medium">{c.providerId}</Text>
                      </div>
                      {c.unreadCount > 0 && <span className="h-2 w-2 rounded-full bg-kumo-brand" />}
                    </div>
                    <Text variant="secondary" DANGEROUS_className="mt-0.5 block truncate text-[13px]">{c.lastMessagePreview ?? "No messages"}</Text>
                  </button>
                ))}
              </div>
            )}
          </Surface>
        </div>

        {/* Center: messages */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Surface className="flex min-h-[calc(100vh-220px)] flex-1 flex-col rounded-lg">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center"><Text variant="secondary">Select a conversation.</Text></div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-kumo-line px-4 py-2.5">
                  <Text DANGEROUS_className="font-medium">{selected.providerId} conversation</Text>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={() => closeConversation.mutate(selected.id)}>Close</Button>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4 pf-scroll">
                  {(messages ?? []).length === 0 ? (
                    <Text variant="secondary">No messages yet.</Text>
                  ) : (
                    (messages ?? []).map((m) => (
                      <div key={m.id} className={`max-w-[70%] rounded-lg px-3 py-2 ${m.direction === "outbound" ? "ml-auto bg-kumo-tint" : "bg-kumo-recessed"}`}>
                        <Text>{m.body}</Text>
                        <Text variant="secondary" DANGEROUS_className="mt-0.5 block text-[11px]">{new Date(m.sentAt).toLocaleString()}</Text>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-kumo-line p-3">
                  {(quickReplies ?? []).length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {(quickReplies ?? []).map((q) => (
                        <button key={q.id} onClick={() => setReply(q.body)} className="rounded bg-kumo-recessed px-2 py-0.5 text-[12px] text-kumo-subtle hover:bg-kumo-tint">{q.title}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…" className="flex-1" />
                    <Button variant="primary" shape="square" disabled={!reply.trim() || sendReply.isPending} onClick={() => sendReply.mutate()} aria-label="Send">
                      <PaperPlaneRight size={16} />
                    </Button>
                    <Button variant="secondary" shape="square" disabled={!note.trim()} onClick={() => addNote.mutate()} aria-label="Add internal note">
                      <NotePencil size={16} />
                    </Button>
                  </div>
                  {note && (
                    <div className="mt-2 flex gap-2">
                      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note…" className="flex-1" />
                      <Button variant="secondary" size="sm" onClick={() => addNote.mutate()}>Save note</Button>
                      <Button variant="secondary" size="sm" shape="square" onClick={() => setNote("")} aria-label="Cancel note"><XCircle size={14} /></Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
}