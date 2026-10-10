"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ALL_NAV } from "./nav";
import { useSession } from "./SessionProvider";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  const { session, family, refresh } = useSession();
  const router = useRouter();

  async function logout() {
    await api.post("/api/auth/logout");
    await refresh();
    router.push("/login");
  }

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col border-r bg-surface px-4 py-6 gap-6">
      <div>
        <p className="text-lg font-bold text-primary">Familia+</p>
        {family && <p className="text-xs text-muted truncate">{family.name}</p>}
      </div>
      <nav className="flex flex-col gap-1">
        {ALL_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-border/60"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2">
        {session && <p className="text-xs text-muted px-3">{session.name}</p>}
        <button
          onClick={logout}
          className="w-full text-left rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-border/60"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
