import fs from "node:fs";
import path from "node:path";
import { getDb } from "./client";
import { ensureDefaultCategoriesForAllFamilies } from "@/services/families";

/**
 * Applies schema.sql. Every statement in it uses CREATE TABLE/INDEX IF NOT EXISTS,
 * so running this repeatedly is safe (idempotent) in dev, tests, and production.
 * Also backfills any default expense category (p.ej. las nuevas Supermercado/Farmacia/etc.)
 * que una familia ya existente todavía no tenga — también idempotente.
 */
export async function migrate(): Promise<void> {
  const db = await getDb();
  const schemaPath = path.join(process.cwd(), "src", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  await db.exec(sql);
  await ensureDefaultCategoriesForAllFamilies();
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  migrate()
    .then(() => {
      console.log("Migraciones aplicadas correctamente.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error aplicando migraciones:", err);
      process.exit(1);
    });
}
