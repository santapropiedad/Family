"use client";

import ComprasTienda from "@/components/ComprasTienda";
import { CATALOG_SUPERMERCADO } from "@/lib/catalogs";

export default function ComprasSupermercadoPage() {
  return <ComprasTienda store="Supermercado" catalog={CATALOG_SUPERMERCADO} />;
}
