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

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">INTEGRANTES</h2>
        <div className="card divide-y">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-base"
                  style={{ backgroundColor: m.color + "33" }}
                >
                  {m.avatar_emoji ?? "🙂"}
                </div>
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  {!(isAdmin && m.id !== session?.familyMemberId) && (
                    <p className="text-xs text-muted">{ROLE_LABEL[m.role]}</p>
                  )}
                </div>
              </div>
              {isAdmin && m.id !== session?.familyMemberId && (
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value)}
                    className="rounded-lg border px-2 py-1 text-xs bg-transparent"
                  >
                    <option value="admin">Administrador</option>
                    <option value="adult">Adulto</option>
                    <option value="child">Niño</option>
                  </select>
                  <button onClick={() => removeMember(m.id)} className="text-xs text-muted px-1">
                    Eliminar
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
        <h2 className="text-sm font-semibold text-muted mb-2">MEMORIA DE FAMILIA+</h2>
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
