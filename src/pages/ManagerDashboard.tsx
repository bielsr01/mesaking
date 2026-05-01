import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ChefHat, ExternalLink, LogOut, ShoppingBag, DollarSign, TrendingUp } from "lucide-react";
import { brl } from "@/lib/format";
import { OrdersPanel, fetchOrders, ordersKey } from "@/components/dashboard/OrdersPanel";
import { MenuManager, fetchCategories, fetchProducts, menuKeys } from "@/components/dashboard/MenuManager";
import { StoreSettings } from "@/components/dashboard/StoreSettings";

import { StoreOpenToggle } from "@/components/dashboard/StoreOpenToggle";
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

  // Prefetch all tabs data as soon as we know the restaurant — eliminates blank tab on first click.
  useEffect(() => {
    if (!restaurant?.id) return;
    qc.prefetchQuery({ queryKey: ordersKey(restaurant.id), queryFn: () => fetchOrders(restaurant.id) });
    qc.prefetchQuery({ queryKey: menuKeys.categories(restaurant.id), queryFn: () => fetchCategories(restaurant.id) });
    qc.prefetchQuery({ queryKey: menuKeys.products(restaurant.id), queryFn: () => fetchProducts(restaurant.id) });
  }, [restaurant?.id, qc]);

  // Keep stats live
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
      <div className="min-h-screen bg-muted/30">
        <header className="bg-background border-b sticky top-0 z-30">
          <div className="container h-16 flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-32" />
          </div>
        </header>
        <main className="container py-6 space-y-4">
          <Skeleton className="h-10 w-80" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
          <Skeleton className="h-64" />
        </main>
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

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="container h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="hidden sm:inline">MesaPro</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm font-medium">{restaurant.name}</span>
            <StoreOpenToggle
              restaurantId={restaurant.id}
              openingHours={restaurant.opening_hours}
              manualOverride={restaurant.manual_override}
              onChanged={refetchRestaurant}
            />
            <Button asChild variant="outline" size="sm"><Link to={`/r/${restaurant.slug}`} target="_blank"><ExternalLink className="w-4 h-4 mr-1" />Ver cardápio</Link></Button>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="orders">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="orders">Pedidos</TabsTrigger>
            <TabsTrigger value="menu">Cardápio</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard icon={ShoppingBag} label="Pedidos hoje" value={(stats?.orders ?? 0).toString()} />
              <StatCard icon={DollarSign} label="Faturamento hoje" value={brl(stats?.revenue ?? 0)} />
              <StatCard icon={TrendingUp} label="Ticket médio" value={brl(stats?.avg ?? 0)} />
            </div>
          </TabsContent>

          <TabsContent value="orders" forceMount className="data-[state=inactive]:hidden">
            <OrdersPanel restaurantId={restaurant.id} />
          </TabsContent>

          <TabsContent value="menu" forceMount className="data-[state=inactive]:hidden">
            <MenuManager restaurantId={restaurant.id} />
          </TabsContent>

          <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
            <StoreSettings
              restaurant={restaurant}
              onUpdated={() => qc.invalidateQueries({ queryKey: ["managerRestaurant", user?.id] })}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
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
