"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { subscribeToPush } from "@/lib/push-client";
import type { Notification } from "@/types/domain";

const PERMISSION_ASKED_KEY = "familia-plus:alarm-permission-asked";
const POLL_MS = 60_000;

/** Pitido corto (sin archivo de audio) para acompañar el aviso visual. Gratis, sin dependencias. */
function playBeep() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch {
    /* El sonido es un extra, nunca debe romper la app. */
  }
}

/**
 * Escucha en segundo plano, mientras la app está abierta, y avisa 15 minutos antes de que
 * venza una tarea y 10 minutos después si sigue sin completarse. Gratis: solo usa polling al
 * propio backend + la Notification API nativa del navegador, sin servicios externos.
 */
export default function TaskAlarmWatcher() {
  const [toast, setToast] = useState<Notification | null>(null);
  const [askPermission, setAskPermission] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      // Ya tenía el permiso (de antes de que existiera push, o de otra sesión en este
      // dispositivo): asegura que también quede suscrito a push, sin pedir nada de nuevo.
      subscribeToPush();
      return;
    }
    try {
      if (Notification.permission === "default" && !localStorage.getItem(PERMISSION_ASKED_KEY)) {
        setAskPermission(true);
      }
    } catch {
      /* localStorage no disponible; simplemente no se ofrece el permiso. */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await api.post<{ notifications: Notification[] }>("/api/notifications/scan");
        if (cancelled) return;
        for (const n of res.notifications) {
          setToast(n);
          playBeep();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(n.title, { body: n.body ?? undefined, tag: n.id });
          }
        }
      } catch {
        /* Un fallo de red en el chequeo de alarmas no debe interrumpir el resto de la app. */
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  async function enableNotifications() {
    try {
      localStorage.setItem(PERMISSION_ASKED_KEY, "1");
    } catch {
      /* no-op */
    }
    setAskPermission(false);
    const permission = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
    // La suscripción push es lo que permite avisar con la app cerrada; se intenta
    // apenas se concede el permiso, además del polling que ya cubre con la app abierta.
    if (permission === "granted") subscribeToPush();
  }

  function dismiss() {
    try {
      localStorage.setItem(PERMISSION_ASKED_KEY, "1");
    } catch {
      /* no-op */
    }
    setAskPermission(false);
  }

  return (
    <>
      {askPermission && (
        <div className="fixed top-3 inset-x-3 md:inset-x-auto md:right-4 md:max-w-sm z-40 card p-3 flex items-center justify-between gap-3 shadow-lg">
          <p className="text-xs">🔔 ¿Activar avisos de tareas por vencer en este dispositivo?</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={enableNotifications} className="text-xs font-medium text-primary">
              Activar
            </button>
            <button onClick={dismiss} className="text-xs text-muted">
              Ahora no
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 card px-4 py-3 shadow-lg max-w-sm w-[calc(100%-2rem)] md:w-auto">
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.body && <p className="text-xs text-muted mt-0.5">{toast.body}</p>}
        </div>
      )}
    </>
  );
}
