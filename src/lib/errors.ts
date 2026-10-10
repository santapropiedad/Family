/** Error whose `message` is safe to show directly to end users (Spanish, no technical detail). */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "app_error") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class AuthError extends AppError {
  constructor(message = "No autorizado.") {
    super(message, 401, "auth_error");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No tienes permiso para realizar esta acción.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "No encontramos lo que buscabas.") {
    super(message, 404, "not_found");
  }
}

/** Normalizes any thrown value into a safe {status, message} pair, logging the real error server-side. */
export function toSafeError(err: unknown): { status: number; message: string; code: string } {
  if (err instanceof AppError) {
    return { status: err.status, message: err.message, code: err.code };
  }
  console.error("[unhandled_error]", err);
  return { status: 500, message: "Algo salió mal. Inténtalo nuevamente.", code: "internal_error" };
}
