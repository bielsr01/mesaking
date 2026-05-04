import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { user, loading, rolesLoading, isMasterAdmin, isManager } = useAuth();
  if (loading || rolesLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (isMasterAdmin) return <Navigate to="/admin" replace />;
  if (isManager) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/auth" replace />;
}
