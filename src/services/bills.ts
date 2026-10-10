import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { Bill } from "@/types/domain";
import { createExpense } from "@/services/expenses";

export async function listBills(familyId: string, status?: Bill["status"]): Promise<Bill[]> {
  const db = await getDb();
  const conditions = ["family_id = $1"];
  const values: unknown[] = [familyId];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const result = await db.query<Bill>(
    `SELECT * FROM bills WHERE ${conditions.join(" AND ")} ORDER BY due_date ASC`,
    values
  );
  return result.rows;
}

export async function getBill(familyId: string, id: string): Promise<Bill> {
  const db = await getDb();
  const result = await db.query<Bill>("SELECT * FROM bills WHERE family_id = $1 AND id = $2", [
    familyId,
    id,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Cuenta no encontrada.");
  return result.rows[0];
}

export interface CreateBillInput {
  name: string;
  provider?: string | null;
  amount: number;
  dueDate: string;
  frequency?: Bill["frequency"];
  categoryId?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

export async function createBill(familyId: string, input: CreateBillInput): Promise<Bill> {
  const db = await getDb();
  const result = await db.query<Bill>(
    `INSERT INTO bills (id, family_id, name, provider, amount, due_date, frequency, category_id, payment_method, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      newId(),
      familyId,
      input.name.trim(),
      input.provider ?? null,
      input.amount,
      input.dueDate,
      input.frequency ?? "monthly",
      input.categoryId ?? null,
      input.paymentMethod ?? null,
      input.notes ?? null,
    ]
  );
  return result.rows[0];
}

function nextDueDate(dueDate: string, frequency: Bill["frequency"]): string | null {
  const date = new Date(dueDate);
  switch (frequency) {
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "bimonthly":
      date.setMonth(date.getMonth() + 2);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "annual":
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "once":
      return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Marca una cuenta como pagada: crea el gasto asociado y, si es recurrente, programa la próxima. */
export async function payBill(familyId: string, id: string, familyMemberId?: string | null): Promise<Bill> {
  const bill = await getBill(familyId, id);
  const expense = await createExpense(familyId, {
    amount: Number(bill.amount),
    categoryId: bill.category_id,
    description: `Pago de ${bill.name}`,
    merchant: bill.provider,
    paymentMethod: bill.payment_method,
    familyMemberId: familyMemberId ?? null,
    isRecurring: bill.frequency !== "once",
  });

  const db = await getDb();
  const result = await db.query<Bill>(
    `UPDATE bills SET status = 'paid', paid_at = now(), expense_id = $3, updated_at = now()
     WHERE family_id = $1 AND id = $2 RETURNING *`,
    [familyId, id, expense.id]
  );

  const next = nextDueDate(bill.due_date, bill.frequency);
  if (next) {
    await db.query(
      `INSERT INTO bills (id, family_id, name, provider, amount, due_date, frequency, category_id, status, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)`,
      [
        newId(),
        familyId,
        bill.name,
        bill.provider,
        bill.amount,
        next,
        bill.frequency,
        bill.category_id,
        bill.payment_method,
        bill.notes,
      ]
    );
  }

  return result.rows[0];
}

export async function markOverdueBills(familyId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE bills SET status = 'overdue', updated_at = now()
     WHERE family_id = $1 AND status = 'pending' AND due_date < CURRENT_DATE`,
    [familyId]
  );
}

export async function deleteBill(familyId: string, id: string): Promise<void> {
  await getBill(familyId, id);
  const db = await getDb();
  await db.query("DELETE FROM bills WHERE family_id = $1 AND id = $2", [familyId, id]);
}
