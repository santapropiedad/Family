import fs from "node:fs";
import path from "node:path";

let cached: string | null = null;

/** El ícono subido por el usuario (public/app-icon.png), como data URL — se lee una sola vez. */
export function getIconDataUrl(): string {
  if (!cached) {
    const buffer = fs.readFileSync(path.join(process.cwd(), "public", "app-icon.png"));
    cached = `data:image/png;base64,${buffer.toString("base64")}`;
  }
  return cached;
}
