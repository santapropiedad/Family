import type { NextRequest } from "next/server";

// El lector de boletas sube la foto y luego espera (polling) a que Tabscanner termine de
// procesarla, lo que puede tardar más que el límite por defecto de una función serverless.
export const maxDuration = 60;
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { procesarBoletaSchema } from "@/lib/validation";
import { isTabscannerConfigured, processReceiptImage, findPossibleDuplicateExpense } from "@/services/receipts";
import { AppError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "finances:manage");
    if (!isTabscannerConfigured()) {
      throw new AppError(
        "El lector de boletas no está configurado todavía. Falta la clave de la API de Tabscanner.",
        503,
        "tabscanner_not_configured"
      );
    }
    const { image } = await parseBody(req, procesarBoletaSchema);
    const parsed = await processReceiptImage(image);
    const possibleDuplicate = await findPossibleDuplicateExpense(session.familyId, parsed.spentAt, parsed.total);
    return { parsed, possibleDuplicate };
  });
}
