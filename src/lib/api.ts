import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { AppError, toSafeError } from "./errors";

/** Wraps a route handler so any thrown error becomes a safe, user-facing JSON response. */
export async function handleRoute<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? {});
  } catch (err) {
    const { status, message, code } = toSafeError(err);
    return NextResponse.json({ error: message, code }, { status });
  }
}

/** Parses and validates a JSON request body against a zod schema, throwing a safe AppError on failure. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError("La solicitud no tiene un formato válido.", 400, "invalid_json");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new AppError(
      firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Datos inválidos.",
      400,
      "validation_error"
    );
  }
  return result.data;
}
