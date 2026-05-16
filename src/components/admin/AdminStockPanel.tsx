import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Boxes, Layers } from "lucide-react";
import { toast } from "sonner";

type StockGroup = {
  id: string; name: string; is_active: boolean; sort_order: number;
  allow_add: boolean; allow_subtract: boolean; allow_set: boolean;
};
type Restaurant = { id: string; name: string; slug: string };
type StockRow = { restaurant_id: string; group_id: string; quantity: number };

export function AdminStockPanel() {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="w-full sm:w-auto overflow-x-auto justify-start no-scrollbar">
        <TabsTrigger value="overview" className="shrink-0"><Boxes className="w-4 h-4 mr-2" />Estoque das lojas</TabsTrigger>
        <TabsTrigger value="groups" className="shrink-0"><Layers className="w-4 h-4 mr-2" />Grupos de itens</TabsTrigger>
      </TabsList>
      <TabsContent value="overview"><AdminStockOverview /></TabsContent>
      <TabsContent value="groups"><AdminStockGroups /></TabsContent>
    </Tabs>
  );
}

function AdminStockOverview() {
  const qc = useQueryClient();
  const { data: groups = [] } = useQuery({
    queryKey: ["stock_groups_all"],
    queryFn: async () => {
      const { data } = await supabase.from("stock_groups").select("*").order("sort_order");
      return (data ?? []) as StockGroup[];
    },
  });
  const { data: restaurants = [] } = useQuery({
    queryKey: ["restaurants_min_stock"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id,name,slug").order("name");
      return (data ?? []) as Restaurant[];
    },
  });
  const { data: stock = [] } = useQuery({
    queryKey: ["restaurant_stock_all"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurant_stock").select("restaurant_id,group_id,quantity");
      return (data ?? []) as StockRow[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin-stock-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_stock" },
        () => qc.invalidateQueries({ queryKey: ["restaurant_stock_all"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const lookup = new Map<string, number>();
  stock.forEach(s => lookup.set(`${s.restaurant_id}|${s.group_id}`, s.quantity));
  const activeGroups = groups.filter(g => g.is_active);

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {restaurants.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">Nenhum restaurante cadastrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 sticky left-0 bg-muted/40">Restaurante</th>
                {activeGroups.map(g => <th key={g.id} className="p-3 text-right">{g.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {restaurants.map(r => (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="p-3 font-medium sticky left-0 bg-background">{r.name}</td>
                  {activeGroups.map(g => {
                    const qty = lookup.get(`${r.id}|${g.id}`) ?? 0;
                    return (
                      <td key={g.id} className={`p-3 text-right font-bold tabular-nums ${qty <= 0 ? "text-destructive" : ""}`}>{qty}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function AdminStockGroups() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockGroup | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["stock_groups_all"],
    queryFn: async () => {
      const { data } = await supabase.from("stock_groups").select("*").order("sort_order");
      return (data ?? []) as StockGroup[];
    },
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["stock_groups_all"] });

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      sort_order: Number(fd.get("sort_order") || 0),
      allow_add: fd.get("allow_add") === "on",
      allow_subtract: fd.get("allow_subtract") === "on",
      allow_set: fd.get("allow_set") === "on",
    };
    if (!payload.name) return toast.error("Informe o nome");
    if (editing) {
      const { error } = await supabase.from("stock_groups").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("stock_groups").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Salvo");
    setOpen(false); setEditing(null); reload();
  };

  const toggleActive = async (g: StockGroup) => {
    await supabase.from("stock_groups").update({ is_active: !g.is_active }).eq("id", g.id);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Grupos globais usados por todas as lojas (ex.: Coxinhas, Churros, Bebidas).</p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="w-4 h-4 mr-2" />Novo grupo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} grupo</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" defaultValue={editing?.name} required /></div>
              <div><Label>Ordem</Label><Input name="sort_order" type="number" defaultValue={editing?.sort_order ?? 0} /></div>
              <div className="space-y-2">
                <Label>Ajustes manuais permitidos no estoque</Label>
                <div className="space-y-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="allow_add" defaultChecked={editing?.allow_add ?? true} />
                    Permitir <strong>somar</strong> (entrada)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="allow_subtract" defaultChecked={editing?.allow_subtract ?? true} />
                    Permitir <strong>subtrair</strong> (saída) — não permite ficar negativo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox name="allow_set" defaultChecked={editing?.allow_set ?? true} />
                    Permitir <strong>definir total</strong>
                  </label>
                </div>
              </div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Nenhum grupo criado.</div>
          ) : (
            <div className="divide-y">
              {groups.map(g => (
                <div key={g.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{g.name}</span>
                    {!g.is_active && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={g.is_active} onCheckedChange={() => toggleActive(g)} />
                      <span className="text-xs text-muted-foreground">{g.is_active ? "Ativo" : "Inativo"}</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(g); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
