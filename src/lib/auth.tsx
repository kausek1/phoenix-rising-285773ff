import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import type { Profile, Client, UserRole } from "@/types/database";

export interface AccessibleClient {
  client_id: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  client: Client | null;
  clientId: string | null;
  role: UserRole | null;
  accessibleClients: AccessibleClient[];
  setActiveClient: (clientId: string) => void;
  loading: boolean;
  signOut: () => Promise<void>;
}

const ACTIVE_CLIENT_LS_KEY = "phoenix.activeClientId";

const AuthCtx = createContext<AuthContextType>({
  session: null, profile: null, client: null,
  clientId: null, role: null,
  accessibleClients: [], setActiveClient: () => {},
  loading: true, signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [accessibleClients, setAccessibleClients] = useState<AccessibleClient[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadForSession = useCallback(async (s: Session | null, mountedRef: { v: boolean }) => {
    if (!s?.user) {
      setProfile(null); setClient(null);
      setAccessibleClients([]); setActiveClientId(null);
      return;
    }
    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", s.user.id).single();
    if (!mountedRef.v) return;
    setProfile(prof as Profile | null);

    // Load accessible clients
    const { data: accessRows } = await supabase
      .from("user_client_access")
      .select("client_id, role, clients(id, name)")
      .eq("user_id", s.user.id);
    if (!mountedRef.v) return;

    let access: AccessibleClient[] = ((accessRows as any[]) ?? [])
      .filter((r) => r.clients)
      .map((r) => ({
        client_id: r.client_id,
        name: r.clients?.name ?? "Unknown",
        role: r.role as UserRole,
      }));

    // Fallback: if no access rows yet (migration not applied / backfill missing),
    // synthesize from profile so nothing breaks.
    if (access.length === 0 && prof?.client_id) {
      const { data: cl } = await supabase
        .from("clients").select("id, name").eq("id", prof.client_id).single();
      if (cl) {
        access = [{ client_id: cl.id, name: cl.name, role: prof.role }];
      }
    }

    access.sort((a, b) => a.name.localeCompare(b.name));
    setAccessibleClients(access);

    // Determine active client
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_CLIENT_LS_KEY)
      : null;
    const validStored = stored && access.some((a) => a.client_id === stored) ? stored : null;
    const nextActive = validStored
      ?? access[0]?.client_id
      ?? prof?.client_id
      ?? null;
    setActiveClientId(nextActive);
    if (nextActive && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_CLIENT_LS_KEY, nextActive);
    }

    if (nextActive) {
      const { data: cl } = await supabase
        .from("clients").select("*").eq("id", nextActive).single();
      if (!mountedRef.v) return;
      setClient(cl as Client | null);
    } else {
      setClient(null);
    }
  }, []);

  useEffect(() => {
    const mountedRef = { v: true };

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (!mountedRef.v) return;
      setSession(existing);
      await loadForSession(existing, mountedRef);
      if (mountedRef.v) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mountedRef.v) return;
        setSession(newSession);
        await loadForSession(newSession, mountedRef);
        if (mountedRef.v) setLoading(false);
      }
    );

    return () => { mountedRef.v = false; subscription.unsubscribe(); };
  }, [loadForSession]);

  const setActiveClient = useCallback((id: string) => {
    if (!accessibleClients.some((a) => a.client_id === id)) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_CLIENT_LS_KEY, id);
      window.location.reload();
    }
  }, [accessibleClients]);

  const signOut = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_CLIENT_LS_KEY);
    }
    await supabase.auth.signOut();
  };

  // Role for active client: prefer access entry, fall back to profile.role
  const activeAccess = accessibleClients.find((a) => a.client_id === activeClientId);
  const effectiveRole: UserRole | null = activeAccess?.role ?? profile?.role ?? null;

  return (
    <AuthCtx.Provider value={{
      session, profile, client,
      clientId: activeClientId ?? profile?.client_id ?? null,
      role: effectiveRole,
      accessibleClients,
      setActiveClient,
      loading, signOut,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}
