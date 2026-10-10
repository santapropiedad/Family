"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { InventoryItem, ShoppingItem } from "@/types/domain";

type Tab = "lista" | "inventario";

const QUICK_STORES = ["Supermercado", "Feria"] as const;
const STORE_ORDER = ["Supermercado", "Feria"];

function groupByStore(items: ShoppingItem[]): Array<[string, ShoppingItem[]]> {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const key = item.store?.trim() || "Sin tienda";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ai = STORE_ORDER.indexOf(a);
    const bi = STORE_ORDER.indexOf(b);
    if (a === "Sin tienda") return 1;
    if (b === "Sin tienda") return -1;
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function ComprasPage() {
  const [tab, setTab] = useState<Tab>("lista");
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newStore, setNewStore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<ShoppingItem | null>(null);
  const [buyAmount, setBuyAmount] = useState("");

  async function loadAll() {
    const [i, inv] = await Promise.all([
      api.get<{ items: ShoppingItem[] }>("/api/shopping?status=pending"),
      api.get<{ items: InventoryItem[] }>("/api/inventory"),
    ]);
    setItems(i.items);
    setInventory(inv.items);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.post("/api/shopping", { name: newName.trim(), store: newStore });
    setNewName("");
    loadAll();
  }

  async function removeItem(id: string) {
    await api.delete(`/api/shopping/${id}`);
    loadAll();
  }

  async function confirmPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!buying) return;
    const amount = Number(buyAmount.replace(/[^\d]/g, ""));
    if (!amount) return;
    await api.post("/api/shopping/purchase", { itemName: buying.name, amount, unit: buying.unit });
    setBuying(null);
    setBuyAmount("");
    loadAll();
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Compras Inteligentes</h1>
        <p className="text-sm text-muted">Lista conectada con tu inventario y tus gastos.</p>
      </header>

      <div className="flex gap-2">
        {([
          ["lista", "Lista"],
          ["inventario", "Inventario"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              tab === key ? "bg-primary text-white" : "bg-border/60 text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted">Cargando…</p>}

      {!loading && tab === "lista" && (
        <div className="space-y-4">
          <form onSubmit={addItem} className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Agregar producto…"
                className="flex-1 rounded-xl border px-3 py-2 text-sm bg-transparent"
              />
              <button className="rounded-xl bg-primary text-white px-4 text-sm font-medium">Agregar</button>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted">Tienda:</span>
              {QUICK_STORES.map((store) => (
                <button
                  key={store}
                  type="button"
                  onClick={() => setNewStore((s) => (s === store ? null : store))}
                  className={`px-2.5 py-1 rounded-full font-medium ${
                    newStore === store ? "bg-primary text-white" : "bg-border/60 text-muted"
                  }`}
                >
                  {store}
                </button>
              ))}
              {newStore && !QUICK_STORES.includes(newStore as (typeof QUICK_STORES)[number]) && (
                <span className="px-2.5 py-1 rounded-full bg-primary text-white font-medium">{newStore}</span>
              )}
            </div>
          </form>

          {items.length === 0 && (
            <div className="card">
              <p className="text-sm text-muted p-4">No tienes productos pendientes.</p>
            </div>
          )}

          {groupByStore(items).map(([store, storeItems]) => (
            <div key={store}>
              <h2 className="text-sm font-semibold text-muted mb-2">{store.toUpperCase()}</h2>
              <div className="card divide-y">
                {storeItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`priority-dot ${item.priority}`} />
                    <div className="flex-1">
                      <p className="text-sm">
                        {item.name}
                        {Number(item.quantity) !== 1 && ` (${item.quantity}${item.unit ? ` ${item.unit}` : ""})`}
                      </p>
                    </div>
                    <button
                      onClick={() => setBuying(item)}
                      className="text-xs font-medium text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
                    >
                      Comprado
                    </button>
                    <button onClick={() => removeItem(item.id)} className="text-xs text-muted px-1">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "inventario" && (
        <div className="card divide-y">
          {inventory.length === 0 && <p className="text-sm text-muted p-4">Aún no hay productos en el inventario.</p>}
          {inventory.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.current_quantity} {item.unit ?? "unidades"}
                  {item.avg_purchase_frequency_days &&
                    ` · se compra cada ${Math.round(Number(item.avg_purchase_frequency_days))} días`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {buying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form onSubmit={confirmPurchase} className="card p-5 w-full max-w-sm space-y-3">
            <p className="font-semibold">¿Cuánto pagaste por {buying.name}?</p>
            <input
              autoFocus
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="$"
              inputMode="numeric"
              className="w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBuying(null)}
                className="flex-1 rounded-xl border py-2 text-sm"
              >
                Cancelar
              </button>
              <button type="submit" className="flex-1 rounded-xl bg-primary text-white py-2 text-sm font-medium">
                Registrar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
