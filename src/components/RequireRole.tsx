import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function RequireRole({ role, children }: { role: "master_admin" | "manager"; children: ReactNode }) {
  const { user, loading, rolesLoading, isMasterAdmin, isManager } = useAuth();
  if (loading || rolesLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (role === "master_admin" && !isMasterAdmin) return <Navigate to="/" replace />;
  if (role === "manager" && !isManager) return <Navigate to="/" replace />;
  return <>{children}</>;
}
