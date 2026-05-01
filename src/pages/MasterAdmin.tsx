import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ChefHat, ExternalLink, LogOut, Store, ShoppingBag, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { brl, slugify } from "@/lib/format";

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
  manager_email: z.string().trim().email().optional().or(z.literal("")),
});

export default function MasterAdmin() {
  const { signOut, user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [stats, setStats] = useState({ orders: 0, revenue: 0 });
  const [open, setOpen] = useState(false);
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

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error("Verifique os campos. Slug deve ser minúsculo, sem espaços.");
    setBusy(true);
    let owner_id: string | null = user?.id ?? null;
    if (parsed.data.manager_email) {
      // Look up existing user by email through profiles? Profiles doesn't have email. Skip auto-link.
      owner_id = null;
    }
    const { data: created, error } = await supabase.from("restaurants").insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      owner_id,
      is_open: false,
    }).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Restaurante "${created.name}" criado!`);
    setOpen(false); setName(""); setSlug("");
    load();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="container h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary-foreground" />
            </div>
            MesaPro <Badge variant="secondary" className="ml-2">Admin</Badge>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4 mr-2" />Sair</Button>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Painel da rede</h1>
          <p className="text-muted-foreground">Visão global de todos os restaurantes cadastrados.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><Store className="w-6 h-6" /></div>
              <div><div className="text-2xl font-bold">{restaurants.length}</div><div className="text-sm text-muted-foreground">Restaurantes</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><ShoppingBag className="w-6 h-6" /></div>
              <div><div className="text-2xl font-bold">{stats.orders}</div><div className="text-sm text-muted-foreground">Pedidos hoje</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent text-accent-foreground grid place-items-center"><DollarSign className="w-6 h-6" /></div>
              <div><div className="text-2xl font-bold">{brl(stats.revenue)}</div><div className="text-sm text-muted-foreground">Faturamento hoje</div></div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Restaurantes</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Novo restaurante</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Cadastrar restaurante</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input name="name" value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} required />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL pública)</Label>
                  <Input name="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required />
                  <p className="text-xs text-muted-foreground">Ficará em /r/{slug || "seu-slug"}</p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {restaurants.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum restaurante cadastrado.</div>
            ) : (
              <div className="divide-y">
                {restaurants.map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {r.name}
                        {r.is_open ? <Badge className="bg-success text-success-foreground">Aberto</Badge> : <Badge variant="secondary">Fechado</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">/r/{r.slug}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm"><Link to={`/r/${r.slug}`} target="_blank"><ExternalLink className="w-4 h-4 mr-2" />Cardápio</Link></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
