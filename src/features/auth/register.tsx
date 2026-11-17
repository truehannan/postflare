import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Surface, Text } from "@cloudflare/kumo";
import { api, ApiClientError } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/register", { name, email, password });
      const me = await api.get<{ user: { id: string; email: string; name: string; avatarUrl: string | null; createdAt: string }; workspaces: { id: string; name: string; slug: string; timezone: string; plan: string; role: string; createdAt: string }[] }>("/api/auth/me");
      setSession(me.user, me.workspaces);
      navigate("/overview");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-kumo-base px-4">
      <Surface className="w-full max-w-sm rounded-xl p-6">
        <div className="mb-6 flex items-center gap-2">
          <img src="/logo-mark.svg" alt="" className="h-8 w-8" />
          <Text as="h1" variant="heading" size="lg">Create your workspace</Text>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
          {error ? <Text variant="error">{error}</Text> : null}
          <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
            Create account
          </Button>
        </form>
        <Text as="p" variant="secondary" DANGEROUS_className="mt-4">
          Already have an account? <Link to="/login" className="text-kumo-brand hover:text-kumo-brand-hover">Sign in</Link>
        </Text>
      </Surface>
    </div>
  );
}