"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { getVoiceProvider } from "@/lib/voice";

interface PendingAction {
  actionId: string;
  toolName: string;
  confirmationMessage?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pendingAction?: PendingAction;
  resolved?: "confirmed" | "rejected";
}

interface ChatResponse {
  conversationId: string;
  reply: string;
  pendingActions: PendingAction[];
  mode: "claude" | "rules";
}

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hola, soy Familia+ IA. Puedes preguntarme qué hay pendiente, pedirme que agregue una compra, registre un gasto o cree un recordatorio.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const voice = getVoiceProvider();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const data = await api.post<ChatResponse>("/api/ai/chat", { text: trimmed });
      const pendingAction = data.pendingActions[0];
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: data.reply, pendingAction },
      ]);
      if (speakReplies) voice.speak(data.reply);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pude responder. Inténtalo nuevamente.";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: message }]);
    } finally {
      setSending(false);
    }
  }

  async function resolveAction(messageId: string, action: PendingAction, confirm: boolean) {
    try {
      await api.post(`/api/ai/actions/${action.actionId}/${confirm ? "confirm" : "reject"}`);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, resolved: confirm ? "confirmed" : "rejected" } : m))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pude procesar tu respuesta.";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: message }]);
    }
  }

  function toggleListening() {
    if (listening) {
      voice.stopListening();
      setListening(false);
      return;
    }
    if (!voice.isSupported()) {
      setVoiceError("Tu navegador no soporta reconocimiento de voz. Prueba en Chrome o Edge, o escribe tu mensaje.");
      return;
    }
    setVoiceError(null);
    setListening(true);
    voice.startListening(
      (text, isFinal) => {
        setInput(text);
        if (isFinal) {
          setListening(false);
          send(text);
        }
      },
      () => setListening(false),
      (message) => {
        setVoiceError(message);
        setListening(false);
      }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/40">
      <div className="card w-full md:max-w-lg md:mx-4 h-[85vh] md:h-[70vh] flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="font-semibold">🎙️ Familia+ IA</p>
            <p className="text-xs text-muted">Pregúntame o pídeme algo</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSpeakReplies((v) => !v)}
              title={speakReplies ? "Silenciar respuestas" : "Activar voz en respuestas"}
              className="text-sm px-2 py-1 rounded-lg hover:bg-border/60"
            >
              {speakReplies ? "🔊" : "🔇"}
            </button>
            <button onClick={onClose} className="text-sm px-2 py-1 rounded-lg hover:bg-border/60">
              ✕
            </button>
          </div>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-primary text-white" : "bg-border/60"
                }`}
              >
                <p>{m.text}</p>
                {m.pendingAction && !m.resolved && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => resolveAction(m.id, m.pendingAction!, true)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-primary text-white"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => resolveAction(m.id, m.pendingAction!, false)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-surface border"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {m.resolved && (
                  <p className="mt-1 text-xs text-muted">
                    {m.resolved === "confirmed" ? "✓ Confirmado" : "✕ Cancelado"}
                  </p>
                )}
              </div>
            </div>
          ))}
          {sending && <p className="text-xs text-muted px-1">Pensando…</p>}
          {voiceError && <p className="text-xs text-priority-red px-1">{voiceError}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t px-3 py-2.5"
        >
          <button
            type="button"
            onClick={toggleListening}
            className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-lg ${
              listening ? "bg-priority-red text-white animate-pulse" : "bg-border/60"
            }`}
            aria-label="Hablar"
          >
            🎙️
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe o habla…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="shrink-0 h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40"
            aria-label="Enviar"
          >
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
