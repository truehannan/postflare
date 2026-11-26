import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { ArrowRight } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

interface Overview {
  accounts: number;
  publishedPosts: number;
  scheduledPosts: number;
  failures: number;
  unreadConversations: number;
  activeAutomations: number;
  plannerIdeas: number;
  plannerInReview: number;
  upcomingThisWeek: number;
  recentPosts: { id: string; status: string; scheduled_for: string | null; created_at: string }[];
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link to={href} className="group">
      <Surface className="rounded-lg px-4 py-3 hover:bg-kumo-elevated">
        <div className="flex items-baseline justify-between">
          <Text as="span" DANGEROUS_className="text-[28px] font-semibold leading-8 mono-nums">{value}</Text>
          <ArrowRight size={14} className="text-kumo-subtle group-hover:text-kumo-default" />
        </div>
        <Text as="span" variant="secondary">{label}</Text>
      </Surface>
    </Link>
  );
}

export function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/api/analytics/overview"),
  });

  return (
    <div>
      <PageHeader
        title="Overview"
        description="A summary of your publishing, inbox and automation activity."
        actions={<Link to="/publishing/composer"><Button variant="primary">New post</Button></Link>}
      />
      <div className="px-6 pb-6">
        {isLoading || !data ? (
          <Text variant="secondary">Loading…</Text>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-9">
              <Stat label="Connected accounts" value={data.accounts} href="/settings/accounts" />
              <Stat label="Published posts" value={data.publishedPosts} href="/publishing/published" />
              <Stat label="Scheduled" value={data.scheduledPosts} href="/publishing/calendar" />
              <Stat label="This week" value={data.upcomingThisWeek} href="/publishing/calendar" />
              <Stat label="Failures" value={data.failures} href="/publishing/queue" />
              <Stat label="Unread inbox" value={data.unreadConversations} href="/inbox" />
              <Stat label="Active automations" value={data.activeAutomations} href="/automations" />
              <Stat label="Planner ideas" value={data.plannerIdeas} href="/planner" />
              <Stat label="In review" value={data.plannerInReview} href="/planner" />
            </div>

            <Surface className="rounded-lg">
              <div className="flex items-center justify-between border-b border-kumo-line px-4 py-3">
                <Text as="h2" variant="heading">Recent posts</Text>
                <Link to="/publishing/published" className="text-kumo-brand hover:text-kumo-brand-hover text-[14px]">View all</Link>
              </div>
              {data.recentPosts.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Text variant="secondary">No posts yet. Create your first post to get started.</Text>
                </div>
              ) : (
                <div className="divide-y divide-kumo-line">
                  {data.recentPosts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <Text DANGEROUS_className="mono-nums text-kumo-subtle">{p.id.slice(0, 14)}</Text>
                      <StatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>
        )}
      </div>
    </div>
  );
}
