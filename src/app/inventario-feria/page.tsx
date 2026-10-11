"use client";

import InventarioTienda from "@/components/InventarioTienda";
import { CATALOG_FERIA } from "@/lib/catalogs";

export default function InventarioFeriaPage() {
  return <InventarioTienda store="Feria" catalog={CATALOG_FERIA} />;
}
