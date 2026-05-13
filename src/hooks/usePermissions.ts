import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FULL_PERMISSIONS, Permissions, mergePermissions, getPerm } from "@/lib/permissions";

export function usePermissions(restaurantId?: string): {
  permissions: Permissions;
  isFullAccess: boolean;
  loading: boolean;
  can: (path: string) => boolean;
} {
  const { user, isMasterAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["userPermissions", restaurantId, user?.id],
    enabled: !!restaurantId && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      if (!restaurantId || !user?.id) return { perms: FULL_PERMISSIONS, full: true };
      const { data: rest } = await supabase.from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle();
      if (rest?.owner_id === user.id) return { perms: FULL_PERMISSIONS, full: true };
      const { data: mem } = await supabase
        .from("restaurant_members")
        .select("access_group_id")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mem) return { perms: FULL_PERMISSIONS, full: true };
      const groupId = (mem as any).access_group_id as string | null;
      if (!groupId) return { perms: FULL_PERMISSIONS, full: true };
      const { data: group } = await supabase
        .from("access_groups")
        .select("permissions")
        .eq("id", groupId)
        .maybeSingle();
      return { perms: mergePermissions(group?.permissions ?? {}), full: false };
    },
  });

  if (isMasterAdmin) {
    return { permissions: FULL_PERMISSIONS, isFullAccess: true, loading: false, can: () => true };
  }
  const isFull = data?.full ?? true;
  const perms = data?.perms ?? FULL_PERMISSIONS;
  const can = (path: string) => (isFull ? true : !!getPerm(perms, path));
  return { permissions: perms, isFullAccess: isFull, loading: isLoading, can };
}
