"use client";

import { useEffect, useState } from "react";
import AssistantPanel from "./AssistantPanel";
import { getVoiceProvider } from "@/lib/voice";

const HANDS_FREE_KEY = "familia-plus:hands-free";

export default function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [openedViaWake, setOpenedViaWake] = useState(false);
  const [wakeCommand, setWakeCommand] = useState("");
  // Preferencia por dispositivo (no viaja en la sesión ni se comparte entre miembros). Se lee de
  // forma perezosa en el primer render (no en un efecto aparte) para que no compita con el efecto
  // que la persiste y termine sobrescribiéndola con el valor por defecto.
  const [handsFree, setHandsFree] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HANDS_FREE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [wakeListening, setWakeListening] = useState(false);
  const voice = getVoiceProvider();

  useEffect(() => {
    try {
      localStorage.setItem(HANDS_FREE_KEY, handsFree ? "1" : "0");
    } catch {
      /* ídem */
    }
  }, [handsFree]);

  // Se pausa mientras el panel está abierto para que el micrófono no se escuche a sí mismo
  // (la voz del asistente al responder) y se retoma solo al cerrarlo.
  useEffect(() => {
    if (!handsFree || open) {
      voice.stopWakeWordListening();
      setWakeListening(false);
      return;
    }
    voice.startWakeWordListening(
      (command) => {
        setWakeCommand(command);
        setOpenedViaWake(true);
        setOpen(true);
      },
      (listening) => setWakeListening(listening),
      () => setWakeListening(false)
    );
    return () => voice.stopWakeWordListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree, open]);

  function close() {
    setOpen(false);
    setOpenedViaWake(false);
    setWakeCommand("");
  }

  return (
    <>
      <button
        onClick={() => {
          setOpenedViaWake(false);
          setOpen(true);
        }}
        className="fixed z-30 right-4 bottom-20 md:bottom-6 h-14 w-14 rounded-full bg-primary text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Hablar con Family"
      >
        🎙️
        {wakeListening && (
          <span className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-green-400 border-2 border-white animate-pulse" />
        )}
      </button>
      {open && (
        <AssistantPanel
          onClose={close}
          initialCommand={openedViaWake ? wakeCommand : undefined}
          autoListenOnOpen={openedViaWake && !wakeCommand.trim()}
          handsFree={handsFree}
          onToggleHandsFree={() => setHandsFree((v) => !v)}
        />
      )}
    </>
  );
}
