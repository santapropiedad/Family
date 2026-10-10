"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SECONDARY_NAV } from "@/components/nav";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/SessionProvider";

export default function MasPage() {
  const { refresh } = useSession();
  const router = useRouter();

  async function logout() {
    await api.post("/api/auth/logout");
    await refresh();
    router.push("/login");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Más</h1>
      </header>
      <div className="card divide-y">
        {SECONDARY_NAV.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-3.5 text-sm">
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
      <button onClick={logout} className="w-full card px-4 py-3.5 text-sm text-left text-priority-red">
        Cerrar sesión
      </button>
    </div>
  );
}
