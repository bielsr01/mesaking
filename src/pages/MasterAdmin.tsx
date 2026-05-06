import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
// tabs removed in favor of sidebar layout
import { Plus, ChefHat, ExternalLink, LogOut, Store, ShoppingBag, DollarSign, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { brl, slugify } from "@/lib/format";
import { SupplyOrdersTab, SupplyCatalogTab } from "@/components/admin/SupplyAdminPanel";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminView } from "@/components/admin/AdminSidebar";
import { AdminOverviewPanel } from "@/components/admin/AdminOverviewPanel";
import { AdminCustomersPanel } from "@/components/admin/AdminCustomersPanel";
import { AdminCouponsPanel } from "@/components/admin/AdminCouponsPanel";
import { AdminMenuPanel } from "@/components/admin/AdminMenuPanel";
import { BulkCampaignsPanel } from "@/components/dashboard/BulkCampaignsPanel";
import { EvolutionIntegrationCard } from "@/components/dashboard/EvolutionIntegrationCard";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  is_open: boolean;
  owner_id: string | null;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  manager_name: z.string().trim().min(2).max(100),
  manager_email: z.string().trim().email().max(255),
  manager_password: z.string().min(6).max(72),
});

const editSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
});

export default function MasterAdmin() {
  const { signOut } = useAuth();
  const [view, setView] = useState<AdminView>("restaurants");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [stats, setStats] = useState({ orders: 0, revenue: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("restaurants").select("id,name,slug,is_open,owner_id").order("created_at", { ascending: false });
    setRestaurants(data ?? []);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: orders } = await supabase
      .from("orders")
      .select("total")
      .gte("created_at", today.toISOString());
    setStats({
      orders: orders?.length ?? 0,
      revenue: orders?.reduce((s, o) => s + Number(o.total), 0) ?? 0,
    });
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-restaurants")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const obj = Object.fromEntries(fd);
    const parsed = createSchema.safeParse(obj);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-restaurant", { body: parsed.data });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Erro ao criar");
    }
    toast.success(`Restaurante criado e gerente cadastrado!`);
    setCreateOpen(false); setName(""); setSlug("");
    load();
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const parsed = editSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("restaurants").update(parsed.data).eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Atualizado");
    setEditing(null);
    load();
  };

  const toggleOpen = async (r: Restaurant) => {
    // optimistic
    setRestaurants((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_open: !r.is_open } : x)));
    const { error } = await supabase.from("restaurants").update({ is_open: !r.is_open }).eq("id", r.id);
    if (error) {
      setRestaurants((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_open: r.is_open } : x)));
      toast.error(error.message);
    }
  };

  const handleDelete = async (r: Restaurant) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-restaurant", { body: { restaurant_id: r.id, delete_owner: true } });
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? error?.message ?? "Erro");
    toast.success("Restaurante e dados excluídos");
    load();
  };

  const titleMap: Record<AdminView, string> = {
    overview: "Visão geral",
    restaurants: "Restaurantes",
    menu: "Cardápio",
    customers: "Clientes",
    "marketing:coupons": "Cupons de desconto",
    "marketing:bulk": "Envio em massa",
    "settings:integrations": "Integrações",
    "supply:catalog": "Catálogo de insumos",
    "supply:orders": "Pedidos de insumos recebidos",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AdminSidebar active={view} onChange={setView} />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="bg-background border-b sticky top-0 z-30">
            <div className="h-16 px-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div className="flex items-center gap-2 font-bold">
                  <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
                    <ChefHat className="w-5 h-5 text-primary-foreground" />
                  </div>
                  MesaPro <Badge variant="secondary" className="ml-2">Admin</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
                <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4 mr-2" />Sair</Button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-6 space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{titleMap[view]}</h1>
              {view === "restaurants" && <p className="text-muted-foreground">Gerencie todos os restaurantes da plataforma.</p>}
            </div>

            {view === "restaurants" && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card><CardContent className="pt-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><Store className="w-6 h-6" /></div>
                    <div><div className="text-2xl font-bold">{restaurants.length}</div><div className="text-sm text-muted-foreground">Restaurantes</div></div>
                  </CardContent></Card>
                  <Card><CardContent className="pt-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><ShoppingBag className="w-6 h-6" /></div>
                    <div><div className="text-2xl font-bold">{stats.orders}</div><div className="text-sm text-muted-foreground">Pedidos hoje</div></div>
                  </CardContent></Card>
                  <Card><CardContent className="pt-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><DollarSign className="w-6 h-6" /></div>
                    <div><div className="text-2xl font-bold">{brl(stats.revenue)}</div><div className="text-sm text-muted-foreground">Faturamento hoje</div></div>
                  </CardContent></Card>
                </div>

                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Restaurantes</h2>
                  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                      <Button><Plus className="w-4 h-4 mr-2" />Novo restaurante</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Cadastrar restaurante</DialogTitle>
                        <DialogDescription>Crie o restaurante e a conta de acesso do gerente.</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2 col-span-2">
                            <Label>Nome do restaurante</Label>
                            <Input name="name" value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} required />
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label>Slug (URL pública)</Label>
                            <Input name="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required />
                            <p className="text-xs text-muted-foreground">/r/{slug || "seu-slug"}</p>
                          </div>
                          <div className="space-y-2 col-span-2 pt-2 border-t">
                            <Label className="text-base">Acesso do gerente</Label>
                          </div>
                          <div className="space-y-2 col-span-2">
                            <Label>Nome do gerente</Label>
                            <Input name="manager_name" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Email (login)</Label>
                            <Input name="manager_email" type="email" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Senha</Label>
                            <Input name="manager_password" type="password" minLength={6} required />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar restaurante"}</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Card>
                  <CardContent className="p-0">
                    {restaurants.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">Nenhum restaurante cadastrado ainda.</div>
                    ) : (
                      <div className="divide-y">
                        {restaurants.map((r) => (
                          <div key={r.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                            <div className="min-w-0">
                              <div className="font-medium flex items-center gap-2">
                                {r.name}
                                {r.is_open ? <Badge className="bg-success text-success-foreground">Aberto</Badge> : <Badge variant="secondary">Fechado</Badge>}
                              </div>
                              <div className="text-sm text-muted-foreground">/r/{r.slug}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2 px-2">
                                <Switch checked={r.is_open} onCheckedChange={() => toggleOpen(r)} />
                                <span className="text-xs text-muted-foreground">{r.is_open ? "Ativo" : "Inativo"}</span>
                              </div>
                              <Button asChild variant="outline" size="sm"><Link to={`/r/${r.slug}`} target="_blank"><ExternalLink className="w-4 h-4" /></Link></Button>
                              <Button variant="outline" size="sm" onClick={() => setEditing(r)}><Pencil className="w-4 h-4" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir {r.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Isso apaga o restaurante, cardápio, pedidos, imagens e a conta do gerente. Ação irreversível.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(r)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir tudo</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {view === "overview" && <AdminOverviewPanel />}
            {view === "menu" && <AdminMenuPanel />}
            {view === "customers" && <AdminCustomersPanel />}
            {view === "marketing:coupons" && <AdminCouponsPanel />}
            {view === "marketing:bulk" && <BulkCampaignsPanel scope="admin" />}
            {view === "settings:integrations" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <EvolutionIntegrationCard scope="admin" />
              </div>
            )}
            {view === "supply:catalog" && <SupplyCatalogTab />}
            {view === "supply:orders" && <SupplyOrdersTab />}
          </main>
        </SidebarInset>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar restaurante</DialogTitle></DialogHeader>
            {editing && (
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input name="name" defaultValue={editing.name} required />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input name="slug" defaultValue={editing.slug} required />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </SidebarProvider>
  );
}
