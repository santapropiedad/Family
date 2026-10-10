"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV } from "./nav";

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch justify-between px-1">
        {PRIMARY_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <span className="text-xl leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Link
            href="/mas"
            className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              pathname === "/mas" ? "text-primary" : "text-muted"
            }`}
          >
            <span className="text-xl leading-none">⋯</span>
            Más
          </Link>
        </li>
      </ul>
    </nav>
  );
}
