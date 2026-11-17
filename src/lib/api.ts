import { useAuthStore } from "./store";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiResponse<T> {
  data: T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const workspaceId = useAuthStore.getState().activeWorkspaceId;
  if (workspaceId && !path.startsWith("/api/auth")) {
    headers.set("X-Workspace-Id", workspaceId);
  }
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (res.status === 401) {
    useAuthStore.getState().clear();
    if (!path.startsWith("/api/auth")) {
      window.location.assign("/login");
    }
    throw new ApiClientError(401, "unauthorized", "Authentication required");
  }

  if (!res.ok) {
    let code = "error";
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiClientError(res.status, code, message);
  }

  // Some endpoints return raw text (CSV export); otherwise unwrap { data }.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    return (await res.text()) as unknown as T;
  }
  const body = (await res.json()) as ApiResponse<T> | T;
  if (body && typeof body === "object" && "data" in body) {
    return (body as ApiResponse<T>).data;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};