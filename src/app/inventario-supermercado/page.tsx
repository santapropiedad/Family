"use client";

import InventarioTienda from "@/components/InventarioTienda";
import { CATALOG_SUPERMERCADO } from "@/lib/catalogs";

export default function InventarioSupermercadoPage() {
  return <InventarioTienda store="Supermercado" catalog={CATALOG_SUPERMERCADO} />;
}
