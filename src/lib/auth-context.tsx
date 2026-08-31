import { supabase } from "@/integrations/supabase/client";
import { sb, type Profile } from "@/lib/db";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Role = "owner" | "manager" | "staff" | null;

interface AuthCtx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      sb
        .from("profiles")
        .select("id, shop_id, full_name, phone, created_at, updated_at")
        .eq("id", uid)
        .maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile | null) ?? null);
    const r = (roles as Array<{ role: Role }> | null)?.[0]?.role ?? null;
    setRole(r ?? null);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        // defer to avoid recursion issues with supabase client inside listener
        setTimeout(() => void loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    role,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshProfile: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
