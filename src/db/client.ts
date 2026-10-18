import path from "node:path";

/**
 * Database abstraction: PGlite (embedded Postgres, WASM) in development/tests,
 * real Postgres via `pg` in production when DATABASE_URL is set.
 * Both expose the same `query(sql, params)` shape so the service layer
 * never needs to know which backend is active.
 *
 * Both drivers parse DATE/TIMESTAMP/TIMESTAMPTZ columns into JS `Date` objects
 * by default. The whole codebase treats these as plain strings (YYYY-MM-DD /
 * ISO 8601), so both drivers are configured below to return the raw text
 * representation instead — identical behavior in dev, tests, and production.
 */
const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;
const identity = (value: string) => value;

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs one or more statements with no parameters (simple query protocol). Used for migrations. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  /**
   * Runs `fn` inside a BEGIN/COMMIT block (ROLLBACK on throw), passing a `Db` scoped to that
   * single connection/transaction. Used where several writes must succeed or fail together
   * (e.g. saving a receipt-scan expense and its inventory updates atomically).
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

let dbInstance: Db | null = null;
let dbPromise: Promise<Db> | null = null;

async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const useMemory = process.env.PGLITE_MEMORY === "true";
  const dataDir = useMemory
    ? undefined
    : process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".pglite-data");
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const parsers = { [DATE_OID]: identity, [TIMESTAMP_OID]: identity, [TIMESTAMPTZ_OID]: identity };
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params as never[], { parsers });
      return { rows: result.rows as T[], rowCount: result.affectedRows ?? result.rows.length };
    },
    async exec(sql: string) {
      await client.exec(sql, { parsers });
    },
    async close() {
      await client.close();
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      return client.transaction(async (tx) => {
        const txDb: Db = {
          async query<T2>(sql: string, params: unknown[] = []) {
            const result = await tx.query<T2>(sql, params as never[], { parsers });
            return { rows: result.rows as T2[], rowCount: result.affectedRows ?? result.rows.length };
          },
          async exec(sql: string) {
            await tx.exec(sql, { parsers });
          },
          async close() {},
          async transaction() {
            throw new Error("No se permiten transacciones anidadas.");
          },
        };
        return fn(txDb);
      });
    },
  };
}

async function createPgDb(connectionString: string): Promise<Db> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(DATE_OID, identity);
  types.setTypeParser(TIMESTAMP_OID, identity);
  types.setTypeParser(TIMESTAMPTZ_OID, identity);
  const pool = new Pool({ connectionString });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      const client = await pool.connect();
      const txDb: Db = {
        async query<T2>(sql: string, params: unknown[] = []) {
          const result = await client.query(sql, params);
          return { rows: result.rows as T2[], rowCount: result.rowCount ?? 0 };
        },
        async exec(sql: string) {
          await client.query(sql);
        },
        async close() {},
        async transaction() {
          throw new Error("No se permiten transacciones anidadas.");
        },
      };
      try {
        await client.query("BEGIN");
        const result = await fn(txDb);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/** Lazily creates (once) and returns the shared database connection for this process. */
export async function getDb(): Promise<Db> {
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = (async () => {
      const connectionString = process.env.DATABASE_URL;
      const db = connectionString ? await createPgDb(connectionString) : await createPgliteDb();
      dbInstance = db;
      return db;
    })();
  }
  return dbPromise;
}

/** Test/tooling helper: force a brand-new connection (e.g. in-memory PGlite per test file). */
export async function resetDbForTests(): Promise<Db> {
  if (dbInstance) {
    await dbInstance.close();
  }
  dbInstance = null;
  dbPromise = null;
  return getDb();
}
