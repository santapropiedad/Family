"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { UNIT_OPTIONS } from "@/lib/catalogs";
import type { InventoryItem } from "@/types/domain";

interface Props {
  store: string;
  catalog: string[];
}

interface RowState {
  itemId: string | null;
  quantity: string;
  unit: string;
  frequencyDays: number | null;
  lastPurchasedAt: string | null;
  lastPrice: string | null;
}

function defaultRow(): RowState {
  return { itemId: null, quantity: "0", unit: "unidades", frequencyDays: null, lastPurchasedAt: null, lastPrice: null };
}

export default function InventarioStock({ store, catalog }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");

  async function load() {
    const res = await api.get<{ items: InventoryItem[] }>("/api/inventory");
    const storeItems = res.items.filter((i) => (i.store ?? "") === store);
    const byName = new Map(storeItems.map((i) => [i.name.toLowerCase(), i]));

    const nextRows: Record<string, RowState> = {};
    for (const name of catalog) {
      const match = byName.get(name.toLowerCase());
      nextRows[name] = match
        ? {
            itemId: match.id,
            quantity: String(Number(match.current_quantity)),
            unit: match.unit ?? "unidades",
            frequencyDays: match.avg_purchase_frequency_days ? Math.round(Number(match.avg_purchase_frequency_days)) : null,
            lastPurchasedAt: match.last_purchased_at,
            lastPrice: match.last_price,
          }
        : defaultRow();
    }
    const extras = storeItems.filter((i) => !catalog.some((c) => c.toLowerCase() === i.name.toLowerCase()));
    for (const item of extras) {
      nextRows[item.name] = {
        itemId: item.id,
        quantity: String(Number(item.current_quantity)),
        unit: item.unit ?? "unidades",
        frequencyDays: item.avg_purchase_frequency_days ? Math.round(Number(item.avg_purchase_frequency_days)) : null,
        lastPurchasedAt: item.last_purchased_at,
        lastPrice: item.last_price,
      };
    }
    setExtraNames(extras.map((i) => i.name));
    setRows(nextRows);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(name: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [name]: { ...(prev[name] ?? defaultRow()), ...patch } }));
  }

  async function saveStock(name: string, quantity: string, unit: string) {
    updateRow(name, { quantity, unit });
    const row = rows[name] ?? defaultRow();
    if (row.itemId) {
      await api.patch(`/api/inventory/${row.itemId}`, { current_quantity: Number(quantity) || 0, unit });
    } else {
      const res = await api.post<{ item: InventoryItem }>("/api/inventory", {
        name,
        quantity: Number(quantity) || 0,
        unit,
        store,
      });
      updateRow(name, { itemId: res.item.id });
    }
  }

  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const res = await api.post<{ item: InventoryItem }>("/api/inventory", {
      name,
      quantity: 0,
      unit: "unidades",
      store,
    });
    setRows((prev) => ({ ...prev, [name]: { ...defaultRow(), itemId: res.item.id } }));
    setExtraNames((prev) => [...prev, name]);
  }

  const allNames = [...catalog, ...extraNames];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Inventario {store}</h1>
        <p className="text-sm text-muted">
          Todo el catálogo de {store}, para controlar cuánto te queda de cada producto.
        </p>
      </header>

      <form onSubmit={addCustom} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Agregar producto a Inventario ${store}…`}
          className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
        />
        <button className="rounded-xl bg-primary text-white px-4 text-sm font-medium">Agregar</button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <div className="card divide-y">
          {allNames.map((name) => {
            const row = rows[name] ?? defaultRow();
            return (
              <div key={name} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm">{name}</p>
                  {(row.frequencyDays || row.lastPurchasedAt) && (
                    <p className="text-xs text-muted">
                      {row.frequencyDays && `Se compra cada ${row.frequencyDays} días`}
                      {row.lastPurchasedAt && ` · última compra ${row.lastPurchasedAt}`}
                      {row.lastPrice && ` · $${Number(row.lastPrice).toLocaleString("es-CL")}`}
                    </p>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={row.quantity}
                  onChange={(e) => saveStock(name, e.target.value, row.unit)}
                  className="w-16 rounded-lg border px-2 py-1 text-sm bg-transparent"
                />
                <select
                  value={row.unit}
                  onChange={(e) => saveStock(name, row.quantity, e.target.value)}
                  className="rounded-lg border px-2 py-1 text-sm bg-transparent"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
