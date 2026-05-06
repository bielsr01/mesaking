import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "master_admin" | "manager" | "customer";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
  isMasterAdmin: boolean;
  isManager: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);

  const loadRoles = async (userId: string) => {
    setRolesLoading(true);
    try {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      setRoles((data?.map((r) => r.role) as AppRole[]) ?? []);
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    let currentUserId: string | null = null;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      const newId = newSession?.user?.id ?? null;
      // Only (re)load roles when the user identity actually changes.
      // Avoids unmounting the app on TOKEN_REFRESHED when switching browser tabs.
      if (newId && newId !== currentUserId) {
        currentUserId = newId;
        setRolesLoading(true);
        setTimeout(() => loadRoles(newId), 0);
      } else if (!newId) {
        currentUserId = null;
        setRoles([]);
        setRolesLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        currentUserId = s.user.id;
        setRolesLoading(true);
        loadRoles(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
  };

  const refreshRoles = async () => {
    if (user) await loadRoles(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        loading,
        rolesLoading,
        isMasterAdmin: roles.includes("master_admin"),
        isManager: roles.includes("manager"),
        signOut,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
