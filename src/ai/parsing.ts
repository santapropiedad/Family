/** Utilidades de interpretación de lenguaje natural en español (modo reglas, sin IA generativa). */

/** Extrae un monto en pesos chilenos desde texto libre: "$8.990", "8990", "20 mil pesos", "20.000". */
export function parseAmount(text: string): number | null {
  const milMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mil(?:\s*(?:pesos|lucas))?/i);
  if (milMatch) {
    return Math.round(parseFloat(milMatch[1].replace(",", ".")) * 1000);
  }
  const moneyMatch = text.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\s*pesos)?/);
  if (moneyMatch) {
    const raw = moneyMatch[1].replace(/[.,](?=\d{3}\b)/g, "");
    const value = parseInt(raw, 10);
    if (!Number.isNaN(value)) return value;
  }
  return null;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Resuelve palabras de fecha relativa ("hoy", "mañana", "pasado mañana", días de la semana) a YYYY-MM-DD. */
export function parseRelativeDate(text: string, now = new Date()): string | null {
  const lower = text.toLowerCase();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  if (/\bhoy\b/.test(lower)) return toDateString(base);
  if (/\bpasado\s*mañana\b/.test(lower)) {
    base.setDate(base.getDate() + 2);
    return toDateString(base);
  }
  if (/\bmañana\b/.test(lower)) {
    base.setDate(base.getDate() + 1);
    return toDateString(base);
  }
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (lower.includes(WEEKDAYS[i])) {
      const diff = (i - base.getDay() + 7) % 7 || 7;
      base.setDate(base.getDate() + diff);
      return toDateString(base);
    }
  }
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  return null;
}

export function parseRecurrence(text: string): "none" | "daily" | "weekly" | "monthly" {
  const lower = text.toLowerCase();
  if (/todos los (días|dias)/.test(lower)) return "daily";
  if (/todas las semanas|cada semana/.test(lower)) return "weekly";
  if (/todos los meses|cada mes|mensualmente/.test(lower)) return "monthly";
  return "none";
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Extrae "N unidad de producto" (ej. "tres kilos de arroz", "2 litros de leche"). */
const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

export function parseQuantityItem(text: string): { quantity: number; unit: string | null; name: string } | null {
  const digitMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(kilos?|kg|gramos?|g|litros?|lts?|l|unidades?|paquetes?|cajas?|botellas?)?\s+de\s+(.+)/i
  );
  if (digitMatch) {
    return {
      quantity: parseFloat(digitMatch[1].replace(",", ".")),
      unit: digitMatch[2] ?? null,
      name: digitMatch[3].trim(),
    };
  }
  const wordPattern = Object.keys(NUMBER_WORDS).join("|");
  const wordMatch = text.match(
    new RegExp(`\\b(${wordPattern})\\s+(kilos?|kg|gramos?|g|litros?|lts?|l|unidades?|paquetes?|cajas?|botellas?)?\\s*(?:de\\s+)?(.+)`, "i")
  );
  if (wordMatch) {
    return {
      quantity: NUMBER_WORDS[wordMatch[1].toLowerCase()],
      unit: wordMatch[2] ?? null,
      name: wordMatch[3].trim(),
    };
  }
  return null;
}
