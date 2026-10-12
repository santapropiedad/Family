"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";

export default function RegisterPage() {
  const [familyName, setFamilyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/register", { familyName, adminName, email, password });
      await refresh();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear tu familia.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-1">
        <p className="text-2xl font-bold text-primary">Crea tu familia</p>
        <p className="text-sm text-muted">Serás el administrador de Family.</p>
      </div>

      <form onSubmit={onSubmit} className="card p-5 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted">Nombre de la familia</label>
          <input
            required
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Familia Pérez"
            className="w-full mt-1 rounded-xl border px-3 py-2.5 text-sm bg-transparent"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Tu nombre</label>
          <input
            required
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            className="w-full mt-1 rounded-xl border px-3 py-2.5 text-sm bg-transparent"
          />
        </div>
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
          <label className="text-xs font-medium text-muted">Contraseña (mínimo 8 caracteres)</label>
          <input
            type="password"
            required
            minLength={8}
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
          {loading ? "Creando…" : "Crear familia"}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-primary font-medium">
          Inicia sesión
        </Link>
        .
      </p>
    </div>
  );
}
