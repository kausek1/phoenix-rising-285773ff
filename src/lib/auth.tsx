import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import type { Profile, Client, UserRole } from "@/types/database";

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  client: Client | null;
  clientId: string | null;
  role: UserRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextType>({
  session: null, profile: null, client: null,
  clientId: null, role: null, loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);

        if (newSession?.user) {
          const { data: prof } = await supabase
            .from("profiles").select("*")
            .eq("id", newSession.user.id).single();
          if (!mounted) return;
          setProfile(prof as Profile | null);

          if (prof?.client_id) {
            const { data: cl } = await supabase
              .from("clients").select("*")
              .eq("id", prof.client_id).single();
            if (!mounted) return;
            setClient(cl as Client | null);
          }
        } else {
          setProfile(null);
          setClient(null);
        }
        setLoading(false);
      }
    );

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthCtx.Provider value={{
      session, profile, client,
      clientId: profile?.client_id ?? null,
      role: profile?.role ?? null,
      loading, signOut,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}
