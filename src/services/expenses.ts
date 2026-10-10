import { getDb } from "@/db/client";
import { newId } from "@/lib/ids";
import { NotFoundError } from "@/lib/errors";
import type { Budget, Expense, ExpenseCategory, Source } from "@/types/domain";

export async function listCategories(familyId: string): Promise<ExpenseCategory[]> {
  const db = await getDb();
  const result = await db.query<ExpenseCategory>(
    `SELECT * FROM expense_categories WHERE family_id = $1 OR family_id IS NULL ORDER BY name ASC`,
    [familyId]
  );
  return result.rows;
}

export async function findCategoryByName(familyId: string, name: string): Promise<ExpenseCategory | null> {
  const db = await getDb();
  const result = await db.query<ExpenseCategory>(
    `SELECT * FROM expense_categories WHERE (family_id = $1 OR family_id IS NULL) AND lower(name) = lower($2) LIMIT 1`,
    [familyId, name]
  );
  return result.rows[0] ?? null;
}

export interface ExpenseFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  memberId?: string;
}

export async function listExpenses(familyId: string, filters: ExpenseFilters = {}): Promise<Expense[]> {
  const db = await getDb();
  const conditions = ["family_id = $1"];
  const values: unknown[] = [familyId];
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`spent_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`spent_at <= $${values.length}`);
  }
  if (filters.categoryId) {
    values.push(filters.categoryId);
    conditions.push(`category_id = $${values.length}`);
  }
  if (filters.memberId) {
    values.push(filters.memberId);
    conditions.push(`family_member_id = $${values.length}`);
  }
  const result = await db.query<Expense>(
    `SELECT * FROM expenses WHERE ${conditions.join(" AND ")} ORDER BY spent_at DESC, created_at DESC`,
    values
  );
  return result.rows;
}

export async function getExpense(familyId: string, expenseId: string): Promise<Expense> {
  const db = await getDb();
  const result = await db.query<Expense>("SELECT * FROM expenses WHERE family_id = $1 AND id = $2", [
    familyId,
    expenseId,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Gasto no encontrado.");
  return result.rows[0];
}

export interface CreateExpenseInput {
  amount: number;
  categoryId?: string | null;
  subcategory?: string | null;
  familyMemberId?: string | null;
  spentAt?: string;
  merchant?: string | null;
  paymentMethod?: string | null;
  description?: string | null;
  isRecurring?: boolean;
  receiptUrl?: string | null;
  source?: Source;
  createdBy?: string | null;
}

export async function createExpense(familyId: string, input: CreateExpenseInput): Promise<Expense> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<Expense>(
    `INSERT INTO expenses
       (id, family_id, amount, category_id, subcategory, family_member_id, spent_at, merchant, payment_method, description, is_recurring, receipt_url, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      id,
      familyId,
      input.amount,
      input.categoryId ?? null,
      input.subcategory ?? null,
      input.familyMemberId ?? null,
      input.spentAt ?? null,
      input.merchant ?? null,
      input.paymentMethod ?? null,
      input.description ?? null,
      input.isRecurring ?? false,
      input.receiptUrl ?? null,
      input.source ?? "manual",
      input.createdBy ?? null,
    ]
  );
  return result.rows[0];
}

export async function deleteExpense(familyId: string, expenseId: string): Promise<void> {
  await getExpense(familyId, expenseId);
  const db = await getDb();
  await db.query("DELETE FROM expenses WHERE family_id = $1 AND id = $2", [familyId, expenseId]);
}

export interface MonthlySummary {
  categoryId: string | null;
  categoryName: string | null;
  total: number;
  count: number;
}

export async function summarizeByCategory(
  familyId: string,
  from: string,
  to: string
): Promise<MonthlySummary[]> {
  const db = await getDb();
  const result = await db.query<{
    category_id: string | null;
    category_name: string | null;
    total: string;
    count: string;
  }>(
    `SELECT e.category_id, c.name AS category_name, SUM(e.amount) AS total, COUNT(*) AS count
     FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.family_id = $1 AND e.spent_at >= $2 AND e.spent_at <= $3
     GROUP BY e.category_id, c.name
     ORDER BY total DESC`,
    [familyId, from, to]
  );
  return result.rows.map((r) => ({
    categoryId: r.category_id,
    categoryName: r.category_name,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

export async function totalForPeriod(familyId: string, from: string, to: string): Promise<number> {
  const db = await getDb();
  const result = await db.query<{ total: string | null }>(
    `SELECT SUM(amount) AS total FROM expenses WHERE family_id = $1 AND spent_at >= $2 AND spent_at <= $3`,
    [familyId, from, to]
  );
  return Number(result.rows[0]?.total ?? 0);
}

// --- Presupuestos ---

export async function listBudgets(familyId: string): Promise<Budget[]> {
  const db = await getDb();
  const result = await db.query<Budget>("SELECT * FROM budgets WHERE family_id = $1", [familyId]);
  return result.rows;
}

export async function upsertBudget(
  familyId: string,
  categoryId: string,
  monthlyLimit: number
): Promise<Budget> {
  const db = await getDb();
  const result = await db.query<Budget>(
    `INSERT INTO budgets (id, family_id, category_id, monthly_limit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (family_id, category_id) DO UPDATE SET monthly_limit = $4, updated_at = now()
     RETURNING *`,
    [newId(), familyId, categoryId, monthlyLimit]
  );
  return result.rows[0];
}

export interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  limit: number;
  spent: number;
  percentage: number;
}

export async function getBudgetStatus(familyId: string, from: string, to: string): Promise<BudgetStatus[]> {
  const db = await getDb();
  const result = await db.query<{
    category_id: string;
    category_name: string;
    monthly_limit: string;
    spent: string | null;
  }>(
    `SELECT b.category_id, c.name AS category_name, b.monthly_limit,
            (SELECT SUM(e.amount) FROM expenses e
             WHERE e.family_id = b.family_id AND e.category_id = b.category_id
               AND e.spent_at >= $2 AND e.spent_at <= $3) AS spent
     FROM budgets b JOIN expense_categories c ON c.id = b.category_id
     WHERE b.family_id = $1`,
    [familyId, from, to]
  );
  return result.rows.map((r) => ({
    categoryId: r.category_id,
    categoryName: r.category_name,
    limit: Number(r.monthly_limit),
    spent: Number(r.spent ?? 0),
    percentage: Number(r.monthly_limit) > 0 ? Number(r.spent ?? 0) / Number(r.monthly_limit) : 0,
  }));
}
