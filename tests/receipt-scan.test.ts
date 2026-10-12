import { describe, it, expect } from "vitest";
import { scanReceiptImage } from "@/ai/receipt";
import { AppError } from "@/lib/errors";

describe("escaneo de boletas", () => {
  it("sin ANTHROPIC_API_KEY configurada, explica el fallback en vez de fallar en silencio", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(scanReceiptImage("ZmFrZQ==", "image/jpeg")).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("ai_not_configured");
        return true;
      });
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});
