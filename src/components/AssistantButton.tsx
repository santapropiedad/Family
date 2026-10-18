"use client";

import { useEffect, useState } from "react";
import AssistantPanel from "./AssistantPanel";
import { getVoiceProvider } from "@/lib/voice";
import { useHandsFree } from "@/lib/useHandsFree";

export default function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [openedViaWake, setOpenedViaWake] = useState(false);
  const [wakeCommand, setWakeCommand] = useState("");
  const [handsFree, toggleHandsFree] = useHandsFree();
  const [wakeListening, setWakeListening] = useState(false);
  const voice = getVoiceProvider();

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
          onToggleHandsFree={toggleHandsFree}
        />
      )}
    </>
  );
}
