export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Hoy", icon: "🏠" },
  { href: "/casa", label: "Casa", icon: "🧹" },
  { href: "/compras-feria", label: "Compras Feria", icon: "🥬" },
  { href: "/compras-supermercado", label: "Compras Super", icon: "🛒" },
  { href: "/gastos", label: "Gastos", icon: "💰" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/voz", label: "Familia+ Voz", icon: "🎙️" },
  { href: "/calendario", label: "Calendario", icon: "📅" },
  { href: "/hijos", label: "Hijos", icon: "🎒" },
  { href: "/familia", label: "Familia", icon: "👨‍👩‍👧‍👦" },
  { href: "/inventario-feria", label: "Inventario Feria", icon: "📦" },
  { href: "/inventario-supermercado", label: "Inventario Supermercado", icon: "📦" },
];

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
