import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ExternalLink, LogOut, ShoppingBag, DollarSign, TrendingUp, Construction } from "lucide-react";
import { brl } from "@/lib/format";
import { OrdersPanel, fetchOrders, ordersKey } from "@/components/dashboard/OrdersPanel";
import { MenuManager, fetchCategories, fetchProducts, menuKeys } from "@/components/dashboard/MenuManager";
import { StoreSettings } from "@/components/dashboard/StoreSettings";
import { StoreOpenToggle } from "@/components/dashboard/StoreOpenToggle";
import { AppSidebar, DashboardView } from "@/components/dashboard/AppSidebar";
import { ManualOverride, OpeningHours } from "@/lib/hours";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  is_open: boolean;
  opening_hours: OpeningHours | null;
  manual_override: ManualOverride;
}

async function fetchRestaurantForUser(userId: string, isMasterAdmin: boolean): Promise<Restaurant | null> {
  const cols = "id,name,slug,is_open,opening_hours,manual_override";
  let { data: own } = await supabase.from("restaurants").select(cols).eq("owner_id", userId).maybeSingle();
  if (!own) {
    const { data: mem } = await supabase.from("restaurant_members").select("restaurant_id").eq("user_id", userId).maybeSingle();
    if (mem) {
      const { data: r } = await supabase.from("restaurants").select(cols).eq("id", mem.restaurant_id).maybeSingle();
      own = r ?? null;
    }
  }
  if (!own && isMasterAdmin) {
    const { data: any } = await supabase.from("restaurants").select(cols).order("created_at", { ascending: false }).limit(1).maybeSingle();
    own = any ?? null;
  }
  return own as Restaurant | null;
}

async function fetchTodayStats(restaurantId: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data } = await supabase.from("orders").select("total").eq("restaurant_id", restaurantId).gte("created_at", today.toISOString()).neq("status", "cancelled");
  const orders = data?.length ?? 0;
  const revenue = data?.reduce((s, o) => s + Number(o.total), 0) ?? 0;
  return { orders, revenue, avg: orders ? revenue / orders : 0 };
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, signOut, isMasterAdmin } = useAuth();
  const [view, setView] = useState<DashboardView>("orders");

  const { data: restaurant, isLoading: loadingRest } = useQuery({
    queryKey: ["managerRestaurant", user?.id],
    queryFn: () => fetchRestaurantForUser(user!.id, isMasterAdmin),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["managerStats", restaurant?.id],
    queryFn: () => fetchTodayStats(restaurant!.id),
    enabled: !!restaurant?.id,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!restaurant?.id) return;
    qc.prefetchQuery({ queryKey: ordersKey(restaurant.id), queryFn: () => fetchOrders(restaurant.id) });
    qc.prefetchQuery({ queryKey: menuKeys.categories(restaurant.id), queryFn: () => fetchCategories(restaurant.id) });
    qc.prefetchQuery({ queryKey: menuKeys.products(restaurant.id), queryFn: () => fetchProducts(restaurant.id) });
  }, [restaurant?.id, qc]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const ch = supabase.channel(`stats-${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["managerStats", restaurant.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurant?.id, qc]);

  const refetchRestaurant = () => qc.invalidateQueries({ queryKey: ["managerRestaurant", user?.id] });

  if (loadingRest) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Nenhum restaurante vinculado</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">Sua conta ainda não está vinculada a nenhum restaurante. Peça ao administrador da rede para te adicionar como gerente.</p>
            <Button variant="outline" onClick={() => signOut().then(() => navigate("/"))}>Sair</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const titleByView: Record<DashboardView, string> = {
    overview: "Visão geral",
    orders: "Pedidos",
    menu: "Cardápio",
    "settings:business": "Informações do negócio",
    "settings:printers": "Impressões",
    "settings:integrations": "Integrações",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AppSidebar active={view} onChange={setView} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-background border-b sticky top-0 z-30">
            <div className="h-16 px-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <SidebarTrigger />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{titleByView[view]}</div>
                  <div className="text-xs text-muted-foreground truncate">{restaurant.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StoreOpenToggle
                  restaurantId={restaurant.id}
                  openingHours={restaurant.opening_hours}
                  manualOverride={restaurant.manual_override}
                  onChanged={refetchRestaurant}
                />
                <Button asChild variant="outline" size="sm">
                  <Link to={`/r/${restaurant.slug}`} target="_blank">
                    <ExternalLink className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Ver cardápio</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">
            {view === "overview" && (
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard icon={ShoppingBag} label="Pedidos hoje" value={(stats?.orders ?? 0).toString()} />
                <StatCard icon={DollarSign} label="Faturamento hoje" value={brl(stats?.revenue ?? 0)} />
                <StatCard icon={TrendingUp} label="Ticket médio" value={brl(stats?.avg ?? 0)} />
              </div>
            )}

            {view === "orders" && <OrdersPanel restaurantId={restaurant.id} />}

            {view === "menu" && <MenuManager restaurantId={restaurant.id} />}

            {view === "settings:business" && (
              <StoreSettings
                restaurant={restaurant}
                onUpdated={refetchRestaurant}
              />
            )}

            {view === "settings:printers" && <EmptyState title="Impressões" />}
            {view === "settings:integrations" && <EmptyState title="Integrações" />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-accent text-accent-foreground grid place-items-center">
          <Construction className="w-7 h-7" />
        </div>
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <p className="text-sm text-muted-foreground">Em breve. Esta seção ainda está em construção.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><Icon className="w-6 h-6" /></div>
        <div><div className="text-2xl font-bold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></div>
      </CardContent>
    </Card>
  );
}
