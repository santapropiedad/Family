"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";
import type { Memory } from "@/types/domain";

interface AiAction {
  id: string;
  tool_name: string;
  status: string;
  confirmation_level: string;
  created_at: string;
  member_name: string;
}

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", adult: "Adulto", child: "Niño" };

export default function FamiliaPage() {
  const { session, family, members, refresh } = useSession();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [actions, setActions] = useState<AiAction[]>([]);
  const isAdmin = session?.role === "admin";

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const [savingCredentials, setSavingCredentials] = useState(false);

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const [loginFormFor, setLoginFormFor] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [savingLogin, setSavingLogin] = useState(false);

  async function loadExtras() {
    const [m, a] = await Promise.all([
      api.get<{ memories: Memory[] }>("/api/memories"),
      api.get<{ actions: AiAction[] }>("/api/ai/actions"),
    ]);
    setMemories(m.memories);
    setActions(a.actions);
  }

  useEffect(() => {
    loadExtras();
  }, []);

  async function removeMember(id: string) {
    if (!confirm("¿Eliminar a este integrante?")) return;
    await api.delete(`/api/members/${id}`);
    await refresh();
  }

  async function changeRole(id: string, role: string) {
    await api.patch(`/api/members/${id}`, { role });
    await refresh();
  }

  function startEditName(id: string, currentName: string) {
    setEditingNameId(id);
    setNameDraft(currentName);
  }

  async function saveName(id: string) {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setEditingNameId(null);
      return;
    }
    await api.patch(`/api/members/${id}`, { name: trimmed });
    setEditingNameId(null);
    await refresh();
  }

  function openLoginForm(id: string) {
    setLoginFormFor(loginFormFor === id ? null : id);
    setLoginEmail("");
    setLoginPassword("");
    setLoginMessage(null);
  }

  async function saveLogin(id: string) {
    if (!loginEmail.trim() && !loginPassword) {
      setLoginMessage({ type: "error", text: "Indica un correo y/o una contraseña." });
      return;
    }
    setSavingLogin(true);
    setLoginMessage(null);
    try {
      await api.patch(`/api/members/${id}/login`, {
        email: loginEmail.trim() || undefined,
        password: loginPassword || undefined,
      });
      setLoginMessage({ type: "ok", text: "Acceso actualizado." });
      setLoginEmail("");
      setLoginPassword("");
    } catch (err) {
      setLoginMessage({ type: "error", text: err instanceof Error ? err.message : "No se pudo actualizar." });
    } finally {
      setSavingLogin(false);
    }
  }

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredentialsMessage(null);
    if (!newEmail.trim() && !newPassword) {
      setCredentialsMessage({ type: "error", text: "Indica un correo nuevo o una contraseña nueva." });
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setCredentialsMessage({ type: "error", text: "La nueva contraseña no coincide con la confirmación." });
      return;
    }
    setSavingCredentials(true);
    try {
      await api.patch("/api/account/credentials", {
        currentPassword,
        newEmail: newEmail.trim() || undefined,
        newPassword: newPassword || undefined,
      });
      setCredentialsMessage({ type: "ok", text: "Datos de acceso actualizados." });
      setNewEmail("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      await refresh();
    } catch (err) {
      setCredentialsMessage({
        type: "error",
        text: err instanceof Error ? err.message : "No se pudo actualizar.",
      });
    } finally {
      setSavingCredentials(false);
    }
  }

  async function toggleFamilySetting(key: string, value: boolean) {
    await api.patch("/api/family", { [key]: value });
    await refresh();
  }

  async function clearMemory() {
    if (!confirm("¿Borrar TODA la memoria de la IA? Esta acción no se puede deshacer.")) return;
    await api.delete("/api/memories");
    loadExtras();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Familia</h1>
        <p className="text-sm text-muted">{family?.name}</p>
      </header>

      {session?.email && (
        <section>
          <h2 className="text-sm font-semibold text-muted mb-2">MI CUENTA</h2>
          <form onSubmit={saveCredentials} className="card p-4 space-y-2">
            <p className="text-xs text-muted">
              Correo actual: <span className="font-medium">{session.email}</span>
            </p>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Nuevo correo (opcional)"
              className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña (opcional, mín. 8 caracteres)"
              className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
            {newPassword && (
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar nueva contraseña"
                className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
            )}
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Contraseña actual (para confirmar)"
              required
              className="w-full rounded-xl border px-3 py-2 text-sm bg-transparent"
            />
            {credentialsMessage && (
              <p className={`text-xs ${credentialsMessage.type === "error" ? "text-priority-red" : "text-primary"}`}>
                {credentialsMessage.text}
              </p>
            )}
            <button
              disabled={savingCredentials}
              className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {savingCredentials ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">INTEGRANTES</h2>
        <div className="card divide-y">
          {members.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                    style={{ backgroundColor: m.color + "33" }}
                  >
                    {m.avatar_emoji ?? "🙂"}
                  </div>
                  <div className="min-w-0">
                    {editingNameId === m.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveName(m.id)}
                          autoFocus
                          className="rounded-lg border px-2 py-1 text-sm bg-transparent w-32"
                        />
                        <button onClick={() => saveName(m.id)} className="text-xs text-primary font-medium">
                          Guardar
                        </button>
                        <button onClick={() => setEditingNameId(null)} className="text-xs text-muted">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => isAdmin && startEditName(m.id, m.name)}
                        className="text-sm font-medium flex items-center gap-1"
                        disabled={!isAdmin}
                      >
                        {m.name}
                        {isAdmin && <span className="text-muted text-xs">✎</span>}
                      </button>
                    )}
                    {!(isAdmin && m.id !== session?.familyMemberId) && (
                      <p className="text-xs text-muted">{ROLE_LABEL[m.role]}</p>
                    )}
                  </div>
                </div>
                {isAdmin && m.id !== session?.familyMemberId && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="rounded-lg border px-2 py-1 text-xs bg-transparent"
                    >
                      <option value="admin">Administrador</option>
                      <option value="adult">Adulto</option>
                      <option value="child">Niño</option>
                    </select>
                    <button onClick={() => openLoginForm(m.id)} className="text-xs text-muted px-1" title="Dar o cambiar acceso">
                      🔑
                    </button>
                    <button onClick={() => removeMember(m.id)} className="text-xs text-muted px-1">
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
              {loginFormFor === m.id && (
                <div className="mt-2.5 pl-12 space-y-1.5">
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Correo de acceso"
                    className="w-full max-w-xs rounded-lg border px-2.5 py-1.5 text-xs bg-transparent"
                  />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Nueva contraseña (opcional si ya tiene cuenta)"
                    className="w-full max-w-xs rounded-lg border px-2.5 py-1.5 text-xs bg-transparent"
                  />
                  {loginMessage && (
                    <p className={`text-xs ${loginMessage.type === "error" ? "text-priority-red" : "text-primary"}`}>
                      {loginMessage.text}
                    </p>
                  )}
                  <button
                    onClick={() => saveLogin(m.id)}
                    disabled={savingLogin}
                    className="text-xs px-2.5 py-1 rounded-lg bg-primary text-white disabled:opacity-60"
                  >
                    {savingLogin ? "Guardando…" : "Guardar acceso"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && family && (
        <section>
          <h2 className="text-sm font-semibold text-muted mb-2">AJUSTES DE IA</h2>
          <div className="card divide-y">
            {[
              ["ai_enabled", "Asistente de IA activo"],
              ["ai_memory_enabled", "Memoria de IA activa"],
              ["ai_proactive_enabled", "Inteligencia proactiva (sugerencias automáticas)"],
              ["shopping_suggestions_enabled", "Sugerencias de compras habituales"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between px-4 py-3 text-sm">
                {label}
                <input
                  type="checkbox"
                  checked={Boolean((family as unknown as Record<string, boolean>)[key])}
                  onChange={(e) => toggleFamilySetting(key, e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">MEMORIA DE FAMILY</h2>
        <div className="card divide-y">
          {memories.length === 0 && <p className="text-sm text-muted p-4">Todavía no hay memorias guardadas.</p>}
          {memories.map((m) => (
            <div key={m.id} className="px-4 py-2.5">
              <p className="text-sm">{m.content}</p>
              <p className="text-xs text-muted">{m.type === "permanent" ? "Permanente" : "Temporal"}</p>
            </div>
          ))}
        </div>
        {memories.length > 0 && (
          <button onClick={clearMemory} className="text-xs text-priority-red mt-2 px-1">
            Borrar toda la memoria
          </button>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">ACTIVIDAD DE LA IA</h2>
        <div className="card divide-y max-h-64 overflow-y-auto">
          {actions.length === 0 && <p className="text-sm text-muted p-4">La IA todavía no ha hecho nada.</p>}
          {actions.map((a) => (
            <div key={a.id} className="flex justify-between px-4 py-2.5">
              <div>
                <p className="text-sm">{a.tool_name}</p>
                <p className="text-xs text-muted">
                  {a.member_name} · {new Date(a.created_at).toLocaleString("es-CL")}
                </p>
              </div>
              <span className="text-xs text-muted self-center">{a.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
