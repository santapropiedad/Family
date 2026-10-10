"use client";

import { useState } from "react";
import AssistantPanel from "./AssistantPanel";

export default function AssistantButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 right-4 bottom-20 md:bottom-6 h-14 w-14 rounded-full bg-primary text-white text-2xl shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Hablar con Familia+"
      >
        🎙️
      </button>
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}
