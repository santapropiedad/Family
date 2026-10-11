"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { InventoryItem } from "@/types/domain";

export default function InventarioPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await api.get<{ items: InventoryItem[] }>("/api/inventory");
    setItems(res.items.sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function changeQuantity(id: string, value: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, current_quantity: value } : i)));
    await api.patch(`/api/inventory/${id}`, { current_quantity: Number(value) || 0 });
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <p className="text-sm text-muted">Lo que tienes en casa ahora mismo, no lo que falta comprar.</p>
      </header>

      {loading && <p className="text-sm text-muted">Cargando…</p>}

      {!loading && items.length === 0 && (
        <div className="card">
          <p className="text-sm text-muted p-4">
            Aún no hay nada en el inventario. Se va llenando solo cada vez que registras una compra.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="card divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.avg_purchase_frequency_days
                    ? `Se compra cada ${Math.round(Number(item.avg_purchase_frequency_days))} días`
                    : "Sin patrón de compra todavía"}
                  {item.last_purchased_at && ` · última compra ${item.last_purchased_at}`}
                  {item.last_price && ` · $${Number(item.last_price).toLocaleString("es-CL")}`}
                </p>
              </div>
              <input
                type="number"
                min="0"
                step="0.1"
                value={Number(item.current_quantity)}
                onChange={(e) => changeQuantity(item.id, e.target.value)}
                className="w-16 rounded-lg border px-2 py-1 text-sm bg-transparent"
              />
              <span className="text-xs text-muted w-16">{item.unit ?? "unidades"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
