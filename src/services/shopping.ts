import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { InventoryItem, Priority, ShoppingItem, ShoppingList, Source } from "@/types/domain";
import { createExpense, findCategoryByName } from "@/services/expenses";

export async function getOrCreateDefaultList(familyId: string): Promise<ShoppingList> {
  const db = await getDb();
  const existing = await db.query<ShoppingList>(
    "SELECT * FROM shopping_lists WHERE family_id = $1 ORDER BY created_at ASC LIMIT 1",
    [familyId]
  );
  if (existing.rows.length > 0) return existing.rows[0];
  const created = await db.query<ShoppingList>(
    "INSERT INTO shopping_lists (id, family_id, name) VALUES ($1, $2, 'Lista principal') RETURNING *",
    [newId(), familyId]
  );
  return created.rows[0];
}

export async function listShoppingItems(
  familyId: string,
  status?: ShoppingItem["status"]
): Promise<ShoppingItem[]> {
  const db = await getDb();
  const conditions = ["family_id = $1"];
  const values: unknown[] = [familyId];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const result = await db.query<ShoppingItem>(
    `SELECT * FROM shopping_items WHERE ${conditions.join(" AND ")}
     ORDER BY (status = 'pending') DESC, (priority = 'red') DESC, created_at DESC`,
    values
  );
  return result.rows;
}

export async function getShoppingItem(familyId: string, itemId: string): Promise<ShoppingItem> {
  const db = await getDb();
  const result = await db.query<ShoppingItem>(
    "SELECT * FROM shopping_items WHERE family_id = $1 AND id = $2",
    [familyId, itemId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Producto de la lista no encontrado.");
  return result.rows[0];
}

export async function findPendingItemByName(familyId: string, name: string): Promise<ShoppingItem | null> {
  const db = await getDb();
  const result = await db.query<ShoppingItem>(
    `SELECT * FROM shopping_items WHERE family_id = $1 AND status = 'pending' AND lower(name) = lower($2) LIMIT 1`,
    [familyId, name]
  );
  return result.rows[0] ?? null;
}

export interface AddShoppingItemInput {
  name: string;
  quantity?: number;
  unit?: string | null;
  priority?: Priority;
  categoryId?: string | null;
  assignedTo?: string | null;
  store?: string | null;
  source?: Source;
}

export async function addShoppingItem(familyId: string, input: AddShoppingItemInput): Promise<ShoppingItem> {
  const list = await getOrCreateDefaultList(familyId);
  const db = await getDb();
  const inventoryMatch = await findInventoryItemByName(familyId, input.name);
  const id = newId();
  const result = await db.query<ShoppingItem>(
    `INSERT INTO shopping_items
       (id, shopping_list_id, family_id, name, category_id, quantity, unit, priority, assigned_to, store, inventory_item_id, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      id,
      list.id,
      familyId,
      input.name.trim(),
      input.categoryId ?? inventoryMatch?.category_id ?? null,
      input.quantity ?? 1,
      input.unit ?? inventoryMatch?.unit ?? null,
      input.priority ?? "yellow",
      input.assignedTo ?? null,
      input.store ?? null,
      inventoryMatch?.id ?? null,
      input.source ?? "manual",
    ]
  );
  return result.rows[0];
}

export async function removeShoppingItem(familyId: string, itemId: string): Promise<void> {
  await getShoppingItem(familyId, itemId);
  const db = await getDb();
  await db.query("DELETE FROM shopping_items WHERE family_id = $1 AND id = $2", [familyId, itemId]);
}

export async function updateShoppingItem(
  familyId: string,
  itemId: string,
  patch: Partial<Pick<ShoppingItem, "name" | "quantity" | "unit" | "priority" | "assigned_to" | "store">>
): Promise<ShoppingItem> {
  await getShoppingItem(familyId, itemId);
  const db = await getDb();
  const fields = (Object.keys(patch) as Array<keyof typeof patch>).filter((f) => patch[f] !== undefined);
  if (fields.length === 0) return getShoppingItem(familyId, itemId);
  const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
  const values = fields.map((field) => patch[field]);
  const result = await db.query<ShoppingItem>(
    `UPDATE shopping_items SET ${setClauses.join(", ")}, updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, itemId, ...values]
  );
  return result.rows[0];
}

// --- Inventario ---

export async function listInventory(familyId: string): Promise<InventoryItem[]> {
  const db = await getDb();
  const result = await db.query<InventoryItem>(
    "SELECT * FROM inventory_items WHERE family_id = $1 ORDER BY name ASC",
    [familyId]
  );
  return result.rows;
}

export async function findInventoryItemByName(familyId: string, name: string): Promise<InventoryItem | null> {
  const db = await getDb();
  const result = await db.query<InventoryItem>(
    "SELECT * FROM inventory_items WHERE family_id = $1 AND lower(name) = lower($2)",
    [familyId, name]
  );
  return result.rows[0] ?? null;
}

export async function upsertInventoryOnPurchase(
  familyId: string,
  name: string,
  opts: {
    quantityDelta?: number;
    unit?: string | null;
    price?: number | null;
    categoryId?: string | null;
    store?: string | null;
  }
): Promise<InventoryItem> {
  const db = await getDb();
  const existing = await findInventoryItemByName(familyId, name);
  const today = new Date().toISOString().slice(0, 10);

  if (!existing) {
    const result = await db.query<InventoryItem>(
      `INSERT INTO inventory_items (id, family_id, name, category_id, current_quantity, unit, last_purchased_at, last_price, store)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        newId(),
        familyId,
        name.trim(),
        opts.categoryId ?? null,
        opts.quantityDelta ?? 1,
        opts.unit ?? null,
        today,
        opts.price ?? null,
        opts.store ?? null,
      ]
    );
    return result.rows[0];
  }

  let frequency = existing.avg_purchase_frequency_days ? Number(existing.avg_purchase_frequency_days) : null;
  if (existing.last_purchased_at) {
    const daysSince =
      (new Date(today).getTime() - new Date(existing.last_purchased_at).getTime()) / (1000 * 60 * 60 * 24);
    frequency = frequency ? frequency * 0.6 + daysSince * 0.4 : daysSince;
  }

  const result = await db.query<InventoryItem>(
    `UPDATE inventory_items
     SET current_quantity = current_quantity + $3,
         last_purchased_at = $4,
         last_price = COALESCE($5, last_price),
         avg_purchase_frequency_days = $6,
         store = COALESCE(store, $7),
         updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, existing.id, opts.quantityDelta ?? 1, today, opts.price ?? null, frequency, opts.store ?? null]
  );
  return result.rows[0];
}

export async function updateInventoryItem(
  familyId: string,
  itemId: string,
  patch: Partial<
    Pick<InventoryItem, "current_quantity" | "min_quantity" | "unit" | "auto_suggest" | "category_id">
  >
): Promise<InventoryItem> {
  const db = await getDb();
  const fields = (Object.keys(patch) as Array<keyof typeof patch>).filter((f) => patch[f] !== undefined);
  if (fields.length === 0) {
    const existing = await db.query<InventoryItem>(
      "SELECT * FROM inventory_items WHERE family_id = $1 AND id = $2",
      [familyId, itemId]
    );
    if (existing.rows.length === 0) throw new NotFoundError("Producto de inventario no encontrado.");
    return existing.rows[0];
  }
  const setClauses = fields.map((field, i) => `${field} = $${i + 3}`);
  const values = fields.map((field) => patch[field]);
  const result = await db.query<InventoryItem>(
    `UPDATE inventory_items SET ${setClauses.join(", ")}, updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, itemId, ...values]
  );
  if (result.rows.length === 0) throw new NotFoundError("Producto de inventario no encontrado.");
  return result.rows[0];
}

/**
 * Crea o actualiza directamente el stock de un producto por nombre (sin que medie una compra).
 * Usado por las pantallas de Inventario para poder controlar cuánto queda de CUALQUIER
 * producto del catálogo, aunque nunca se haya registrado una compra de él.
 */
export async function setInventoryStock(
  familyId: string,
  name: string,
  opts: { quantity: number; unit?: string | null; store?: string | null; categoryId?: string | null }
): Promise<InventoryItem> {
  const db = await getDb();
  const existing = await findInventoryItemByName(familyId, name);

  if (!existing) {
    const result = await db.query<InventoryItem>(
      `INSERT INTO inventory_items (id, family_id, name, category_id, current_quantity, unit, store)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [newId(), familyId, name.trim(), opts.categoryId ?? null, opts.quantity, opts.unit ?? null, opts.store ?? null]
    );
    return result.rows[0];
  }

  const result = await db.query<InventoryItem>(
    `UPDATE inventory_items
     SET current_quantity = $3, unit = COALESCE($4, unit), store = COALESCE(store, $5), updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, existing.id, opts.quantity, opts.unit ?? null, opts.store ?? null]
  );
  return result.rows[0];
}

// --- Flujo conectado: "Compré leche por $8.990" ---

export interface RecordPurchaseInput {
  itemName: string;
  amount: number;
  quantity?: number;
  unit?: string | null;
  store?: string | null;
  familyMemberId?: string | null;
  merchant?: string | null;
  paymentMethod?: string | null;
  source?: Source;
  createdBy?: string | null;
}

/**
 * Registra una compra conectando los 4 módulos a la vez, como pide la spec:
 * 1) crea el gasto categorizado, 2) actualiza inventario y precio histórico,
 * 3) quita el producto de la lista de compras si estaba pendiente.
 */
export async function recordPurchase(familyId: string, input: RecordPurchaseInput) {
  const category = (await findCategoryByName(familyId, "Alimentación")) ?? null;
  const pendingItem = await findPendingItemByName(familyId, input.itemName);

  const expense = await createExpense(familyId, {
    amount: input.amount,
    categoryId: pendingItem?.category_id ?? category?.id ?? null,
    description: input.itemName,
    merchant: input.merchant ?? null,
    paymentMethod: input.paymentMethod ?? null,
    familyMemberId: input.familyMemberId ?? null,
    source: input.source ?? "manual",
    createdBy: input.createdBy ?? null,
  });

  const inventoryItem = await upsertInventoryOnPurchase(familyId, input.itemName, {
    quantityDelta: input.quantity ?? 1,
    unit: input.unit ?? pendingItem?.unit ?? null,
    price: input.amount,
    categoryId: pendingItem?.category_id ?? category?.id ?? null,
    store: input.store ?? pendingItem?.store ?? null,
  });

  let removedFromShoppingList = false;
  if (pendingItem) {
    const db = await getDb();
    await db.query(
      "UPDATE shopping_items SET status = 'purchased', purchased_at = now(), purchased_price = $3 WHERE family_id = $1 AND id = $2",
      [familyId, pendingItem.id, input.amount]
    );
    removedFromShoppingList = true;
  }

  return { expense, inventoryItem, removedFromShoppingList };
}

/** Productos que probablemente se están terminando, según el consumo histórico (para sugerencias de IA). */
export async function suggestLowStockItems(familyId: string): Promise<InventoryItem[]> {
  const db = await getDb();
  const result = await db.query<InventoryItem>(
    `SELECT * FROM inventory_items
     WHERE family_id = $1 AND auto_suggest = TRUE AND last_purchased_at IS NOT NULL AND avg_purchase_frequency_days IS NOT NULL
       AND (CURRENT_DATE - last_purchased_at) >= (avg_purchase_frequency_days * 0.85)`,
    [familyId]
  );
  return result.rows;
}
