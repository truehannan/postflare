import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan: string;
  role: string;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  setSession: (user: AuthUser, workspaces: WorkspaceSummary[]) => void;
  setActiveWorkspace: (id: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      workspaces: [],
      activeWorkspaceId: null,
      setSession: (user, workspaces) =>
        set({
          user,
          workspaces,
          activeWorkspaceId: workspaces[0]?.id ?? null,
        }),
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
      clear: () => set({ user: null, workspaces: [], activeWorkspaceId: null }),
    }),
    { name: "postflare-auth" },
  ),
);

export function useActiveWorkspaceId(): string | null {
  return useAuthStore((s) => s.activeWorkspaceId);
}

export function useActiveWorkspace(): WorkspaceSummary | null {
  const id = useAuthStore((s) => s.activeWorkspaceId);
  const workspaces = useAuthStore((s) => s.workspaces);
  return workspaces.find((w) => w.id === id) ?? null;
}