import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/providers/auth-provider";
import { useAuthStore } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { LoginPage } from "@/features/auth/login";
import { RegisterPage } from "@/features/auth/register";
import { OverviewPage } from "@/features/dashboard/overview";
import { ComposerPage } from "@/features/publishing/composer";
import { CalendarPage } from "@/features/publishing/calendar";
import { PostsPage } from "@/features/publishing/posts";
import { InboxPage } from "@/features/inbox/inbox";
import { ContactsPage } from "@/features/contacts/contacts";
import { AutomationsPage } from "@/features/automations/automations";
import { AutomationBuilderPage } from "@/features/automations/builder";
import { AnalyticsPage } from "@/features/analytics/analytics";
import { CampaignsPage } from "@/features/campaigns/campaigns";
import { MediaPage } from "@/features/media/media";
import { ApprovalsPage } from "@/features/approvals/approvals";
import { TeamPage } from "@/features/team/team";
import { SettingsPage } from "@/features/settings/settings";
import { IntegrationsPage } from "@/features/integrations/integrations";
import { IntegrationDetailPage } from "@/features/integrations/integration-detail";
import { AccountsPage } from "@/features/accounts/accounts";

function Protected() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId);
  if (!user) return <Navigate to="/login" replace />;
  if (!activeWorkspaceId) return <Navigate to="/settings" replace />;
  return <AppShell />;
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: <Protected />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "publishing/composer", element: <ComposerPage /> },
      { path: "publishing/calendar", element: <CalendarPage /> },
      { path: "publishing/queue", element: <PostsPage status="queued" /> },
      { path: "publishing/drafts", element: <PostsPage status="draft" /> },
      { path: "publishing/published", element: <PostsPage status="published" /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "contacts", element: <ContactsPage /> },
      { path: "automations", element: <AutomationsPage /> },
      { path: "automations/builder/:id", element: <AutomationBuilderPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "campaigns", element: <CampaignsPage /> },
      { path: "media", element: <MediaPage /> },
      { path: "approvals", element: <ApprovalsPage /> },
      { path: "team", element: <TeamPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/integrations", element: <IntegrationsPage /> },
      { path: "settings/integrations/:providerId", element: <IntegrationDetailPage /> },
      { path: "settings/accounts", element: <AccountsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}