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
  { href: "/calendario", label: "Calendario", icon: "📅" },
  { href: "/inteligencia", label: "Inteligencia", icon: "🧠" },
  { href: "/familia", label: "Familia", icon: "👨‍👩‍👧‍👦" },
  { href: "/inventario", label: "Inventario", icon: "📦" },
];

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
