"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@familiaplus.cl");
  const [password, setPassword] = useState("FamiliaDemo2026!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/login", { email, password });
      await refresh();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-1">
        <p className="text-2xl font-bold text-primary">Family</p>
        <p className="text-sm text-muted">Tu familia, organizada en un solo lugar.</p>
      </div>

      <form onSubmit={onSubmit} className="card p-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted">Correo</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 rounded-xl border px-3 py-2.5 text-sm bg-transparent"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 rounded-xl border px-3 py-2.5 text-sm bg-transparent"
          />
        </div>
        {error && <p className="text-sm text-priority-red">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary text-white py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        Usa la familia de demostración precargada arriba, o{" "}
        <Link href="/register" className="text-primary font-medium">
          crea tu propia familia
        </Link>
        .
      </p>
    </div>
  );
}
