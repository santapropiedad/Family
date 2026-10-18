"use client";

import { useEffect, useState } from "react";

const HANDS_FREE_KEY = "familia-plus:hands-free";

/**
 * Preferencia "Manos libres" (activación por voz con "Hey Familia"), guardada por dispositivo
 * (no viaja en la sesión ni se comparte entre miembros). Compartido entre el botón flotante y
 * la pantalla dedicada /voz para que prendido/apagado se refleje en los dos lugares.
 */
export function useHandsFree(): [boolean, () => void] {
  const [handsFree, setHandsFree] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HANDS_FREE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HANDS_FREE_KEY, handsFree ? "1" : "0");
    } catch {
      /* ídem */
    }
  }, [handsFree]);

  return [handsFree, () => setHandsFree((v) => !v)];
}
