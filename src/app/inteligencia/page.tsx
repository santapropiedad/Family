"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Insight {
  kind: string;
  priority: "red" | "yellow" | "green";
  title: string;
  detail: string;
  entityId?: string;
}

export default function InteligenciaPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ insights: Insight[] }>("/api/insights").then((res) => {
      setInsights(res.insights);
      setLoading(false);
    });
  }, []);

  const detected = insights.filter((i) => i.priority !== "green");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">🧠 Inteligencia</h1>
        <p className="text-sm text-muted">Lo que Family detectó automáticamente, sin ejecutar nada por sí sola.</p>
      </header>

      {loading && <p className="text-sm text-muted">Analizando tu familia…</p>}

      {!loading && (
        <section>
          <h2 className="text-sm font-semibold text-muted mb-2">DETECTÉ</h2>
          <div className="card divide-y">
            {detected.length === 0 && (
              <p className="text-sm text-muted p-4">Todo tranquilo por ahora, no detecté nada urgente.</p>
            )}
            {detected.map((i, idx) => (
              <div key={idx} className="flex items-start gap-2.5 px-4 py-3">
                <span className={`priority-dot ${i.priority} mt-1`} />
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-muted">{i.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted">
        La inteligencia proactiva solo informa y sugiere: nunca paga cuentas, elimina datos ni envía mensajes sin tu
        confirmación explícita.
      </p>
    </div>
  );
}
