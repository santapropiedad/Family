"use client";

import ComprasTienda from "@/components/ComprasTienda";
import { CATALOG_FERIA } from "@/lib/catalogs";

export default function ComprasFeriaPage() {
  return <ComprasTienda store="Feria" catalog={CATALOG_FERIA} />;
}
