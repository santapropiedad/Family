import { Suspense } from "react";
import HijosClient from "@/components/HijosClient";

// Depende de ?child= en la URL y de datos cargados en el cliente; no tiene sentido
// intentar pre-renderizarla como contenido estático.
export const instant = false;

export default function HijosPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
      <HijosClient />
    </Suspense>
  );
}
