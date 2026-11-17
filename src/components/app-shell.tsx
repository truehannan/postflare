import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button, Select, Tooltip, TooltipProvider } from "@cloudflare/kumo";
import {
  Bell,
  CalendarBlank,
  ChartLine,
  ChatCircleText,
  CheckCircle,
  CheckSquareOffset,
  GearSix,
  GitBranch,
  House,
  ImagesSquare,
  Megaphone,
  PaperPlaneTilt,
  PencilLine,
  Queue,
  SignOut,
  Users,
  UsersThree,
  CaretLeft,
  Moon,
  Sun,
  type Icon,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { NotificationItem } from "@shared/types";

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Overview", items: [{ to: "/overview", label: "Overview", icon: House }] },
  {
    group: "Publishing",
    items: [
      { to: "/publishing/composer", label: "Composer", icon: PaperPlaneTilt },
      { to: "/publishing/calendar", label: "Calendar", icon: CalendarBlank },
      { to: "/publishing/queue", label: "Queue", icon: Queue },
      { to: "/publishing/drafts", label: "Drafts", icon: PencilLine },
      { to: "/publishing/published", label: "Published", icon: CheckCircle },
    ],
  },
  { group: "Engage", items: [{ to: "/inbox", label: "Inbox", icon: ChatCircleText }] },
  {
    group: "Automation",
    items: [{ to: "/automations", label: "Automations", icon: GitBranch }],
  },
  { group: "Audience", items: [{ to: "/contacts", label: "Contacts", icon: Users }] },
  { group: "Insights", items: [{ to: "/analytics", label: "Analytics", icon: ChartLine }] },
  { group: "Manage", items: [
    { to: "/campaigns", label: "Campaigns", icon: Megaphone },
    { to: "/media", label: "Media library", icon: ImagesSquare },
    { to: "/approvals", label: "Approvals", icon: CheckSquareOffset },
    { to: "/team", label: "Team", icon: UsersThree },
    { to: "/settings", label: "Settings", icon: GearSix },
  ] },
];

function useTheme() {
  const [mode, setMode] = useState<"light" | "dark">(() => (localStorage.getItem("pf-theme") as "light" | "dark") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
    localStorage.setItem("pf-theme", mode);
  }, [mode]);
  return { mode, toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")) };
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("pf-collapsed") === "1");
  const workspaces = useAuthStore((s) => s.workspaces);
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);
  const clear = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const theme = useTheme();

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationItem[]>("/api/notifications"),
  });
  const unread = (notifications ?? []).filter((n) => !n.read).length;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("pf-collapsed", next ? "1" : "0");
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    clear();
    navigate("/login");
  };

  return (
    <TooltipProvider>
      <div className="flex h-full bg-kumo-base text-kumo-default">
        <aside
          className={`flex h-full shrink-0 flex-col border-r border-kumo-line bg-kumo-elevated transition-none ${collapsed ? "w-14" : "w-60"}`}
        >
          <div className={`flex h-14 items-center gap-2 ${collapsed ? "justify-center px-0" : "px-4"}`}>
            <img src="/logo-mark.svg" alt="Postflare" className="h-7 w-7" />
            {!collapsed && <span className="text-[15px] font-semibold leading-5">Postflare</span>}
          </div>

          {!collapsed && (
            <div className="px-3 pb-2">
              <Select
                items={workspaces.map((w) => ({ value: w.id, label: w.name }))}
                value={activeWorkspaceId ?? undefined}
                onValueChange={(v) => setActiveWorkspace(v as string)}
                size="sm"
                label="Workspace"
              />
            </div>
          )}

          <nav className="flex-1 overflow-y-auto px-2 pb-4 pf-scroll">
            {NAV.map((section) => (
              <div key={section.group} className="mt-3">
                {!collapsed && (
                  <div className="px-2 pb-1 text-[11px] font-medium text-kumo-subtle">{section.group}</div>
                )}
                <div className="grid gap-0.5">
                  {section.items.map((item) => (
                    <Tooltip key={item.to} content={collapsed ? item.label : undefined}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-md px-2 py-1.5 text-[14px] leading-5 ${collapsed ? "justify-center px-0" : ""} ${
                            isActive ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
                          }`
                        }
                      >
                        <item.icon size={17} weight="regular" />
                        {!collapsed && <span>{item.label}</span>}
                      </NavLink>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-kumo-line p-2">
            <button
              onClick={toggle}
              className="flex w-full items-center justify-center rounded-md px-2 py-1.5 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
            >
              <CaretLeft size={16} className={collapsed ? "rotate-180" : ""} />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-end gap-1 border-b border-kumo-line px-4">
            <Button variant="secondary" size="sm" shape="square" onClick={theme.toggle} aria-label="Toggle theme">
              {theme.mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button variant="secondary" size="sm" shape="square" onClick={() => navigate("/settings")} aria-label="Notifications">
              <span className="relative">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-kumo-danger px-0.5 text-[9px] text-white">
                    {unread}
                  </span>
                )}
              </span>
            </Button>
            <Button variant="secondary" size="sm" onClick={logout}>
              <SignOut size={15} />
              {user?.name ?? "Account"}
            </Button>
          </header>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}