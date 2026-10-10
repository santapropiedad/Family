import fs from "node:fs";
import path from "node:path";
import { getDb } from "./client";

/**
 * Applies schema.sql. Every statement in it uses CREATE TABLE/INDEX IF NOT EXISTS,
 * so running this repeatedly is safe (idempotent) in dev, tests, and production.
 */
export async function migrate(): Promise<void> {
  const db = await getDb();
  const schemaPath = path.join(process.cwd(), "src", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  await db.exec(sql);
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
