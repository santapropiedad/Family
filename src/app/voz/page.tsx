"use client";

import AssistantPanel from "@/components/AssistantPanel";
import { useHandsFree } from "@/lib/useHandsFree";

/**
 * Acceso visible a "Familia+ Voz" desde el panel principal (sidebar / "Más"), además del botón
 * flotante. Reutiliza el mismo AssistantPanel (misma lógica, mismas herramientas) en pantalla
 * completa en vez de duplicar la interfaz del asistente.
 */
export default function VozPage() {
  const [handsFree, toggleHandsFree] = useHandsFree();

  return (
    <div className="h-[calc(100vh-7rem)] md:h-[calc(100vh-7rem)] -mx-3 md:-mx-8 -my-3 md:-my-8">
      <AssistantPanel
        inline
        onClose={() => {}}
        handsFree={handsFree}
        onToggleHandsFree={toggleHandsFree}
      />
    </div>
  );
}
