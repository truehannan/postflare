import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Select, Surface, Text } from "@cloudflare/kumo";
import { CalendarPlus, CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/lib/platform-icon";
import { getPlatform } from "@shared/capabilities";
import { statusLabel } from "@/components/status-badge";
import type { Campaign } from "@shared/types";

interface CalendarPost {
  id: string;
  status: string;
  scheduled_for: string;
  campaign_id: string | null;
}
interface CalendarItem {
  id: string;
  title: string;
  status: string;
  platform_id: string | null;
  campaign_id: string | null;
  due_at: string;
  post_id: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_DOT: Record<string, string> = {
  draft: "bg-kumo-subtle",
  scheduled: "bg-kumo-brand",
  queued: "bg-kumo-info",
  publishing: "bg-kumo-info",
  published: "bg-kumo-success",
  failed: "bg-kumo-danger",
  partially_published: "bg-kumo-warning",
  awaiting_approval: "bg-kumo-warning",
  approved: "bg-kumo-brand",
};

type View = "month" | "week" | "list";

export function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [platformFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [dragPost, setDragPost] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      const day = new Date(cursor);
      const dow = (day.getDay() + 6) % 7; // Monday = 0
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow + 7, 23, 59, 59);
      return { start, end };
    }
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  }, [cursor, view]);

  const { data } = useQuery({
    queryKey: ["calendar", range.start.toISOString(), range.end.toISOString()],
    queryFn: () =>
      api.get<{ posts: CalendarPost[]; items: CalendarItem[] }>(
        `/api/calendar?start=${range.start.toISOString()}&end=${range.end.toISOString()}`,
      ),
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.get<Campaign[]>("/api/campaigns"),
  });

  const reschedule = useMutation({
    mutationFn: ({ postId, scheduledFor }: { postId: string; scheduledFor: string }) =>
      api.patch(`/api/posts/${postId}/schedule`, { scheduledFor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const posts = (data?.posts ?? []).filter(
    (p) => (!campaignFilter || p.campaign_id === campaignFilter),
  );
  const items = (data?.items ?? []).filter(
    (i) => (!platformFilter || (i.platform_id ?? "") === platformFilter) && (!campaignFilter || i.campaign_id === campaignFilter),
  );

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      const day = p.scheduled_for.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), p]);
    }
    return map;
  }, [posts]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const i of items) {
      const day = i.due_at.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), i]);
    }
    return map;
  }, [items]);

  const dayKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const dropOnDay = (key: string) => {
    if (!dragPost) return;
    const post = posts.find((p) => p.id === dragPost);
    setDragPost(null);
    if (!post) return;
    // Keep the original time of day, move the date.
    const original = new Date(post.scheduled_for);
    const [h, min, sec] = [original.getUTCHours(), original.getUTCMinutes(), original.getUTCSeconds()];
    const [y, m, d] = key.split("-").map(Number);
    const target = new Date(Date.UTC(y, m - 1, d, h, min, sec));
    reschedule.mutate({ postId: post.id, scheduledFor: target.toISOString() });
  };

  const monthCells = useMemo(() => {
    const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: number[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(0);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const day = new Date(cursor);
    const dow = (day.getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow + i);
      return { date: d, key: dayKey(d.getFullYear(), d.getMonth(), d.getDate()) };
    });
  }, [cursor]);

  const move = (delta: number) => {
    if (view === "week") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + delta * 7));
    } else {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    }
  };

  const today = () => setCursor(new Date());
  const goCompose = (date?: string) =>
    navigate(date ? `/publishing/composer?date=${encodeURIComponent(date)}` : "/publishing/composer");

  const PostChip = ({ p }: { p: CalendarPost }) => (
    <div
      key={p.id}
      draggable
      onDragStart={() => setDragPost(p.id)}
      onDragEnd={() => setDragPost(null)}
      className={`flex cursor-grab items-center gap-1 truncate rounded bg-kumo-tint px-1.5 py-0.5 text-[14px] ${dragPost === p.id ? "opacity-50" : ""}`}
      title={`${statusLabel(p.status)} · ${new Date(p.scheduled_for).toLocaleTimeString()}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[p.status] ?? "bg-kumo-subtle"}`} />
      {p.scheduled_for.slice(11, 16)}
      {p.campaign_id && <span className="h-2 w-2 shrink-0 rounded-sm bg-kumo-brand" title="Part of a campaign" />}
    </div>
  );

  const IdeaChip = ({ i }: { i: CalendarItem }) => (
    <div
      key={i.id}
      className="flex items-center gap-1 truncate rounded border border-dashed border-kumo-line px-1.5 py-0.5 text-[14px] text-kumo-subtle"
      title={`${i.title} (${i.status})`}
    >
      {i.platform_id && <PlatformIcon name={getPlatform(i.platform_id)?.icon ?? "Circle"} size={11} color={getPlatform(i.platform_id)?.color} />}
      <span className="truncate">{i.title}</span>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Your publishing schedule, planned ideas and campaigns in one place. Drag posts to reschedule them."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" shape="square" onClick={() => move(-1)} aria-label="Previous">
              <CaretLeft size={16} />
            </Button>
            <Button variant="secondary" size="sm" onClick={today}>Today</Button>
            <Button variant="secondary" size="sm" shape="square" onClick={() => move(1)} aria-label="Next">
              <CaretRight size={16} />
            </Button>
            <Button variant="primary" size="sm" onClick={() => goCompose()}>
              <CalendarPlus size={14} /> Compose
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-2 px-6 pb-4">
        <Text DANGEROUS_className="font-medium">
          {view === "week"
            ? `Week of ${weekDays[0].date.toLocaleDateString()}`
            : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}
        </Text>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            items={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "list", label: "List" }]}
            value={view}
            onValueChange={(v) => setView(v as View)}
            size="sm"
          />
          <div className="w-44">
            <Select
              label="Campaign"
              items={[{ value: "", label: "All campaigns" }, ...(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              value={campaignFilter || undefined}
              onValueChange={(v) => setCampaignFilter((v as string) ?? "")}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* ---- Month view ---- */}
      {view === "month" && (
        <div className="px-6 pb-8">
          <Surface className="overflow-hidden rounded-lg">
            <div className="grid grid-cols-7 border-b border-kumo-line">
              {DAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-[14px] font-medium text-kumo-subtle">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((day, i) => {
                if (day === 0) return <div key={i} className="min-h-28 border-r border-b border-kumo-line" />;
                const key = dayKey(cursor.getFullYear(), cursor.getMonth(), day);
                const dayPosts = postsByDay.get(key) ?? [];
                const dayItems = itemsByDay.get(key) ?? [];
                const isToday = key === dayKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                return (
                  <div
                    key={i}
                    className={`min-h-28 border-r border-b border-kumo-line p-1.5 ${isToday ? "bg-kumo-tint" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOnDay(key)}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Text variant="secondary" DANGEROUS_className="mono-nums text-[14px]">{day}</Text>
                      <button
                        onClick={() => goCompose(key)}
                        className="text-kumo-subtle hover:text-kumo-default"
                        aria-label="Compose for this day"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <div className="grid gap-1">
                      {dayItems.slice(0, 2).map((it) => <IdeaChip key={it.id} i={it} />)}
                      {dayPosts.slice(0, 3).map((p) => <PostChip key={p.id} p={p} />)}
                      {dayPosts.length + dayItems.length > 5 && (
                        <Text variant="secondary" DANGEROUS_className="text-[14px]">
                          +{dayPosts.length + dayItems.length - 5} more
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
          <Text variant="secondary" DANGEROUS_className="mt-2 block text-[14px]">
            Solid chips are scheduled posts (draggable); dashed chips are planner ideas. The square dot marks campaign posts.
          </Text>
        </div>
      )}

      {/* ---- Week view ---- */}
      {view === "week" && (
        <div className="px-6 pb-8">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(({ date, key }) => {
              const dayPosts = postsByDay.get(key) ?? [];
              const dayItems = itemsByDay.get(key) ?? [];
              const isToday = key === dayKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
              return (
                <div
                  key={key}
                  className={`min-h-64 rounded-lg border border-kumo-line p-2 ${isToday ? "bg-kumo-tint" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOnDay(key)}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Text DANGEROUS_className="font-medium">{date.getDate()}</Text>
                    <Badge variant="outline">{dayPosts.length + dayItems.length}</Badge>
                  </div>
                  <div className="grid gap-1.5">
                    {dayItems.map((it) => <IdeaChip key={it.id} i={it} />)}
                    {dayPosts.map((p) => <PostChip key={p.id} p={p} />)}
                    {dayPosts.length + dayItems.length === 0 && (
                      <Text variant="secondary" DANGEROUS_className="py-8 text-center text-[14px]">Nothing planned</Text>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Text variant="secondary" DANGEROUS_className="mt-2 block text-[14px]">
            Empty columns are content gaps — drag a post over or plan an idea for that day on the board.
          </Text>
        </div>
      )}

      {/* ---- List view ---- */}
      {view === "list" && (
        <div className="px-6 pb-8">
          <Surface className="overflow-hidden rounded-lg">
            {(() => {
              const merged = [
                ...posts.map((p) => ({ kind: "post" as const, at: p.scheduled_for, post: p })),
                ...items.map((i) => ({ kind: "idea" as const, at: i.due_at, idea: i })),
              ].sort((a, b) => a.at.localeCompare(b.at));
              if (merged.length === 0) {
                return <div className="px-4 py-12 text-center"><Text variant="secondary">Nothing planned in this range.</Text></div>;
              }
              return (
                <div className="divide-y divide-kumo-line">
                  {merged.map((entry) => (
                    <div key={`${entry.kind}-${entry.kind === "post" ? entry.post.id : entry.idea.id}`} className="flex items-center gap-3 px-4 py-2.5">
                      <Text variant="secondary" DANGEROUS_className="mono-nums w-40 text-[14px]">
                        {new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </Text>
                      {entry.kind === "post" ? (
                        <>
                          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[entry.post.status] ?? "bg-kumo-subtle"}`} />
                          <Text DANGEROUS_className="text-[14px]">{statusLabel(entry.post.status)} post</Text>
                          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => goCompose()}>
                            Open composer
                          </Button>
                        </>
                      ) : (
                        <>
                          {entry.idea.platform_id && (
                            <PlatformIcon name={getPlatform(entry.idea.platform_id)?.icon ?? "Circle"} size={14} color={getPlatform(entry.idea.platform_id)?.color} />
                          )}
                          <Text DANGEROUS_className="text-[14px]">{entry.idea.title}</Text>
                          <Badge variant="outline" className="ml-auto">Idea</Badge>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </Surface>
        </div>
      )}
    </div>
  );
}
