import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";

interface MeResponse {
  user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: string };
  workspaces: { id: string; name: string; slug: string; timezone: string; plan: string; role: string; createdAt: string }[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const hasUser = useAuthStore((s) => !!s.user);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get<MeResponse>("/api/auth/me");
        if (!cancelled) setSession(me.user, me.workspaces);
      } catch {
        if (!cancelled) clear();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession, clear]);

  // If we already have a persisted session, don't block on the refresh.
  if (!ready && !hasUser) {
    return (
      <div className="flex h-full items-center justify-center bg-kumo-base">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-kumo-line border-t-kumo-brand" />
      </div>
    );
  }
  return <>{children}</>;
}
