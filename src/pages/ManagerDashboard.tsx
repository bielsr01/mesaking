import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ChefHat, ExternalLink, LogOut, ShoppingBag, DollarSign, TrendingUp } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { OrdersPanel } from "@/components/dashboard/OrdersPanel";
import { MenuManager } from "@/components/dashboard/MenuManager";
import { StoreSettings } from "@/components/dashboard/StoreSettings";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  is_open: boolean;
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { user, signOut, isMasterAdmin } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ orders: 0, revenue: 0, avg: 0 });

  const loadRestaurant = async () => {
    if (!user) return;
    // owner
    let { data: own } = await supabase.from("restaurants").select("id,name,slug,is_open").eq("owner_id", user.id).maybeSingle();
    if (!own) {
      const { data: mem } = await supabase.from("restaurant_members").select("restaurant_id").eq("user_id", user.id).maybeSingle();
      if (mem) {
        const { data: r } = await supabase.from("restaurants").select("id,name,slug,is_open").eq("id", mem.restaurant_id).maybeSingle();
        own = r ?? null;
      }
    }
    if (!own && isMasterAdmin) {
      const { data: any } = await supabase.from("restaurants").select("id,name,slug,is_open").order("created_at", { ascending: false }).limit(1).maybeSingle();
      own = any ?? null;
    }
    setRestaurant(own ?? null);
    setLoading(false);
  };

  const loadStats = async (rid: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("orders").select("total").eq("restaurant_id", rid).gte("created_at", today.toISOString()).neq("status", "cancelled");
    const orders = data?.length ?? 0;
    const revenue = data?.reduce((s, o) => s + Number(o.total), 0) ?? 0;
    setStats({ orders, revenue, avg: orders ? revenue / orders : 0 });
  };

  useEffect(() => { loadRestaurant(); }, [user]);
  useEffect(() => {
    if (!restaurant) return;
    loadStats(restaurant.id);
    const ch = supabase.channel(`stats-${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, () => loadStats(restaurant.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurant?.id]);

  const toggleOpen = async () => {
    if (!restaurant) return;
    const { error } = await supabase.from("restaurants").update({ is_open: !restaurant.is_open }).eq("id", restaurant.id);
    if (error) return toast.error(error.message);
    setRestaurant({ ...restaurant, is_open: !restaurant.is_open });
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;

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
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              <span className="text-sm font-medium">{restaurant.name}</span>
              <Badge className={restaurant.is_open ? "bg-success text-success-foreground" : ""} variant={restaurant.is_open ? "default" : "secondary"}>
                {restaurant.is_open ? "Aberto" : "Fechado"}
              </Badge>
              <Switch checked={restaurant.is_open} onCheckedChange={toggleOpen} />
            </div>
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

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard icon={ShoppingBag} label="Pedidos hoje" value={stats.orders.toString()} />
              <StatCard icon={DollarSign} label="Faturamento hoje" value={brl(stats.revenue)} />
              <StatCard icon={TrendingUp} label="Ticket médio" value={brl(stats.avg)} />
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <OrdersPanel restaurantId={restaurant.id} />
          </TabsContent>

          <TabsContent value="menu">
            <MenuManager restaurantId={restaurant.id} />
          </TabsContent>

          <TabsContent value="settings">
            <StoreSettings restaurant={restaurant} onUpdated={loadRestaurant} />
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
