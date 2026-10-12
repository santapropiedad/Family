"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "./SessionProvider";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import AssistantButton from "./AssistantButton";
import TaskAlarmWatcher from "./TaskAlarmWatcher";
import NotificationsBell from "./NotificationsBell";

const PUBLIC_PATHS = ["/login", "/register"];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading } = useSession();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  if (isPublic) {
    return <div className="min-h-screen flex items-center justify-center px-4 py-8">{children}</div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm">
        Cargando Family…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-24 md:pb-10 px-4 md:px-8 py-5 md:py-8 max-w-4xl w-full mx-auto">
          {children}
        </main>
      </div>
      <BottomNav />
      <AssistantButton />
      <NotificationsBell />
      <TaskAlarmWatcher />
    </div>
  );
}
