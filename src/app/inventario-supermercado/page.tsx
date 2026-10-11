"use client";

import InventarioStock from "@/components/InventarioStock";
import { CATALOG_SUPERMERCADO } from "@/lib/catalogs";

export default function InventarioSupermercadoPage() {
  return <InventarioStock store="Supermercado" catalog={CATALOG_SUPERMERCADO} />;
}
