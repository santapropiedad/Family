"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import type { Family, FamilyMember } from "@/types/domain";
import type { Role } from "@/lib/permissions";

export interface Session {
  userId: string;
  familyMemberId: string;
  familyId: string;
  role: Role;
  name: string;
}

interface SessionContextValue {
  session: Session | null;
  family: Family | null;
  members: FamilyMember[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  family: null,
  members: [],
  loading: true,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ session: Session | null; family?: Family; members?: FamilyMember[] }>(
        "/api/auth/me"
      );
      setSession(data.session);
      setFamily(data.family ?? null);
      setMembers(data.members ?? []);
    } catch {
      // Red caída o sesión inválida: tratamos como "no autenticado" en vez de dejar la
      // pantalla cargando para siempre — el middleware o la página de login se hacen cargo.
      setSession(null);
      setFamily(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ session, family, members, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
