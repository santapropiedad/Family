"use client";

import InventarioStock from "@/components/InventarioStock";
import { CATALOG_FERIA } from "@/lib/catalogs";

export default function InventarioFeriaPage() {
  return <InventarioStock store="Feria" catalog={CATALOG_FERIA} />;
}
