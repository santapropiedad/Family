"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { UNIT_OPTIONS } from "@/lib/catalogs";
import type { ShoppingItem } from "@/types/domain";

interface Props {
  store: string;
  catalog: string[];
}

interface RowState {
  checked: boolean;
  itemId: string | null;
  quantity: string;
  unit: string;
}

function defaultRow(): RowState {
  return { checked: false, itemId: null, quantity: "1", unit: "unidades" };
}

function unitLabel(unit: string | null): string {
  return UNIT_OPTIONS.find((u) => u.value === unit)?.label ?? "Unidades";
}

export default function ComprasTienda({ store, catalog }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [newName, setNewName] = useState("");
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [buying, setBuying] = useState<ShoppingItem | null>(null);
  const [buyAmount, setBuyAmount] = useState("");

  async function load() {
    const res = await api.get<{ items: ShoppingItem[] }>(`/api/shopping?status=pending`);
    // Un ítem sin tienda asignada (ej. agregado por el asistente de IA, que no sabe de la
    // separación por tienda) se muestra en ambas listas hasta que alguien lo clasifique,
    // en vez de quedar invisible para siempre.
    const storeItems = res.items.filter((i) => !i.store || i.store === store);
    setItems(storeItems);

    const byName = new Map(storeItems.map((i) => [i.name.toLowerCase(), i]));
    const nextRows: Record<string, RowState> = {};
    for (const name of catalog) {
      const match = byName.get(name.toLowerCase());
      nextRows[name] = match
        ? { checked: true, itemId: match.id, quantity: String(Number(match.quantity)), unit: match.unit ?? "unidades" }
        : defaultRow();
    }
    const extras = storeItems.filter((i) => !catalog.some((c) => c.toLowerCase() === i.name.toLowerCase()));
    for (const item of extras) {
      nextRows[item.name] = {
        checked: true,
        itemId: item.id,
        quantity: String(Number(item.quantity)),
        unit: item.unit ?? "unidades",
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
    setRows((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  async function toggleBuy(name: string, checked: boolean) {
    const row = rows[name] ?? defaultRow();
    updateRow(name, { checked });
    if (checked) {
      const res = await api.post<{ item: ShoppingItem }>("/api/shopping", {
        name,
        store,
        quantity: Number(row.quantity) || 1,
        unit: row.unit,
      });
      updateRow(name, { itemId: res.item.id });
    } else if (row.itemId) {
      await api.delete(`/api/shopping/${row.itemId}`);
      updateRow(name, { itemId: null });
    }
    load();
  }

  async function changeQuantityUnit(name: string, quantity: string, unit: string) {
    updateRow(name, { quantity, unit });
    const row = rows[name];
    if (row?.itemId) {
      await api.patch(`/api/shopping/${row.itemId}`, { quantity: Number(quantity) || 1, unit });
      setItems((prev) => prev.map((i) => (i.id === row.itemId ? { ...i, quantity, unit } : i)));
    }
  }

  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const res = await api.post<{ item: ShoppingItem }>("/api/shopping", { name, store, quantity: 1, unit: "unidades" });
    setRows((prev) => ({
      ...prev,
      [name]: { checked: true, itemId: res.item.id, quantity: "1", unit: "unidades" },
    }));
    setExtraNames((prev) => [...prev, name]);
    load();
  }

  async function removeCustom(name: string) {
    const row = rows[name];
    if (row?.itemId) await api.delete(`/api/shopping/${row.itemId}`);
    setExtraNames((prev) => prev.filter((n) => n !== name));
    setRows((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    load();
  }

  async function confirmPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!buying) return;
    const amount = Number(buyAmount.replace(/[^\d]/g, ""));
    if (!amount) return;
    await api.post("/api/shopping/purchase", { itemName: buying.name, amount, unit: buying.unit, store: buying.store });
    setBuying(null);
    setBuyAmount("");
    load();
  }

  const allNames = [...catalog, ...extraNames];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Compras {store}</h1>
        <p className="text-sm text-muted">Marca lo que hay que comprar, con cantidad y unidad.</p>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">QUÉ FALTA COMPRAR</h2>
        {!loading && items.length === 0 && (
          <div className="card">
            <p className="text-sm text-muted p-4">No te falta nada en {store} por ahora.</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="card divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`priority-dot ${item.priority}`} />
                <p className="flex-1 text-sm">
                  {item.name} — {Number(item.quantity)} {unitLabel(item.unit)}
                </p>
                <button
                  onClick={() => setBuying(item)}
                  className="text-xs font-medium text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
                  title="Marcar que ya lo compraste"
                >
                  Ya lo compré
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">TODOS LOS PRODUCTOS</h2>
        <form onSubmit={addCustom} className="flex gap-2 mb-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Agregar producto a ${store}…`}
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
              const isExtra = extraNames.includes(name);
              return (
                <div key={name} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <label className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(e) => toggleBuy(name, e.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="text-sm">{name}</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={row.quantity}
                    disabled={!row.checked}
                    onChange={(e) => changeQuantityUnit(name, e.target.value, row.unit)}
                    className="w-16 rounded-lg border px-2 py-1 text-sm bg-transparent disabled:opacity-40"
                  />
                  <select
                    value={row.unit}
                    disabled={!row.checked}
                    onChange={(e) => changeQuantityUnit(name, row.quantity, e.target.value)}
                    className="rounded-lg border px-2 py-1 text-sm bg-transparent disabled:opacity-40"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  {isExtra && (
                    <button onClick={() => removeCustom(name)} className="text-xs text-muted px-1">
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
