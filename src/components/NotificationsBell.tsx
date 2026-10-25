"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { postponeDue } from "@/lib/taskTime";
import { subscribeToPush } from "@/lib/push-client";
import type { Notification } from "@/types/domain";

type PushStatus = "granted" | "denied" | "default" | "unsupported";

function readPushStatus(): PushStatus {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushStatus>("unsupported");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    setPushStatus(readPushStatus());
  }, []);

  async function activatePush() {
    setActivating(true);
    try {
      const permission = await window.Notification.requestPermission().catch(() => "denied" as NotificationPermission);
      if (permission === "granted") await subscribeToPush();
    } finally {
      setPushStatus(readPushStatus());
      setActivating(false);
    }
  }

  async function load() {
    const res = await api.get<{ notifications: Notification[] }>("/api/notifications");
    setItems(res.notifications);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markRead(n: Notification) {
    await api.post(`/api/notifications/${n.id}/read`);
    load();
  }

  async function completeTask(n: Notification) {
    if (n.related_entity_type !== "task" || !n.related_entity_id) return;
    await api.patch(`/api/tasks/${n.related_entity_id}`, { status: "completed" });
    await markRead(n);
  }

  async function postpone(n: Notification, minutes: number) {
    if (n.related_entity_type !== "task" || !n.related_entity_id) return;
    const { dueDate, dueTime } = postponeDue({ due_date: null, due_time: null }, minutes);
    await api.patch(`/api/tasks/${n.related_entity_id}`, { dueDate, dueTime });
    await markRead(n);
  }

  return (
    <div className="fixed z-30 right-4 top-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-11 w-11 rounded-full bg-surface border shadow-lg flex items-center justify-center text-lg"
        aria-label="Avisos"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-priority-red text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[85vw] card shadow-xl max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <p className="text-sm font-semibold">Avisos</p>
            <button onClick={() => setOpen(false)} className="text-sm text-muted px-1">
              ✕
            </button>
          </div>

          {pushStatus === "default" && (
            <div className="px-3 py-2.5 border-b bg-primary/5 flex items-center justify-between gap-2">
              <p className="text-xs">🔕 Avisos desactivados en este dispositivo.</p>
              <button
                onClick={activatePush}
                disabled={activating}
                className="text-xs font-medium text-primary shrink-0 disabled:opacity-50"
              >
                {activating ? "Activando…" : "Activar"}
              </button>
            </div>
          )}
          {pushStatus === "denied" && (
            <div className="px-3 py-2.5 border-b bg-priority-red/5">
              <p className="text-xs">
                🔕 Los avisos están bloqueados para esta app en tu navegador. Para activarlos, entra a la
                configuración del navegador (⋮ → Información del sitio o Configuración del sitio) y permite las
                notificaciones para esta página.
              </p>
            </div>
          )}
          {pushStatus === "granted" && (
            <p className="px-3 py-2 border-b text-xs text-muted">🔔 Avisos activados en este dispositivo.</p>
          )}

          {loading && <p className="text-sm text-muted p-4">Cargando…</p>}
          {!loading && items.length === 0 && <p className="text-sm text-muted p-4">Sin avisos todavía.</p>}
          <div className="divide-y">
            {items.map((n) => (
              <div key={n.id} className={`p-3 space-y-1.5 ${n.read_at ? "opacity-60" : ""}`}>
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted">{n.body}</p>}
                <div className="flex gap-2 flex-wrap pt-1">
                  {n.related_entity_type === "task" && (
                    <>
                      <button
                        onClick={() => completeTask(n)}
                        className="text-xs px-2 py-1 rounded-lg bg-primary text-white"
                      >
                        ✓ Completar
                      </button>
                      <button
                        onClick={() => postpone(n, 15)}
                        className="text-xs px-2 py-1 rounded-lg bg-border/60"
                      >
                        ⏰ +15 min
                      </button>
                      <button
                        onClick={() => postpone(n, 60)}
                        className="text-xs px-2 py-1 rounded-lg bg-border/60"
                      >
                        ⏰ +1 hora
                      </button>
                    </>
                  )}
                  {!n.read_at && (
                    <button onClick={() => markRead(n)} className="text-xs px-2 py-1 text-muted">
                      Descartar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
