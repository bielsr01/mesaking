import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

type Group = { id: string; name: string };
type Subgroup = { id: string; group_id: string; name: string };
type Movement = {
  id: string;
  subgroup_id: string;
  quantity: number;
  type: "manual_add" | "manual_subtract" | "manual_set" | "supply_delivery";
  notes: string | null;
  reference_id: string | null;
  created_at: string;
};

const typeLabel: Record<Movement["type"], string> = {
  manual_add: "Entrada manual",
  manual_subtract: "Saída manual",
  manual_set: "Ajuste (definir)",
  supply_delivery: "Pedido entregue",
};

export function AdminStockReportsDialog({
  open, onOpenChange, groups, subgroups,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: Group[];
  subgroups: Subgroup[];
}) {
  const [groupId, setGroupId] = useState<string>("");
  const [subId, setSubId] = useState<string>("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const subsByGroup = useMemo(() => {
    const m: Record<string, Subgroup[]> = {};
    subgroups.forEach(s => { (m[s.group_id] ??= []).push(s); });
    return m;
  }, [subgroups]);
  const subMap = useMemo(() => Object.fromEntries(subgroups.map(s => [s.id, s])), [subgroups]);
  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("admin_stock_movements")
        .select("*")
        .order("created_at", { ascending: false });
      const movs = (data ?? []) as Movement[];
      const refIds = Array.from(new Set(movs.filter(m => m.type === "supply_delivery" && m.reference_id).map(m => m.reference_id as string)));
      let restMap: Record<string, string> = {};
      if (refIds.length) {
        const { data: ords } = await supabase
          .from("supply_orders")
          .select("id, restaurant_id")
          .in("id", refIds);
        const rIds = Array.from(new Set((ords ?? []).map((o: any) => o.restaurant_id).filter(Boolean)));
        const { data: rests } = rIds.length
          ? await supabase.from("restaurants").select("id, name").in("id", rIds)
          : { data: [] as any[] };
        const nameById: Record<string, string> = Object.fromEntries((rests ?? []).map((r: any) => [r.id, r.name]));
        (ords ?? []).forEach((o: any) => {
          restMap[o.id] = nameById[o.restaurant_id] ?? "—";
        });
      }
      if (!cancelled) {
        setMovements(movs);
        setRestaurantMap(restMap);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Reset subgroup when group changes
  useEffect(() => { setSubId(""); }, [groupId]);

  const filtered = useMemo(() => movements.filter(m => {
    const sub = subMap[m.subgroup_id];
    if (!sub) return false;
    if (groupId && sub.group_id !== groupId) return false;
    if (subId && m.subgroup_id !== subId) return false;
    return true;
  }), [movements, groupId, subId, subMap]);

  // Added = positive delta (manual_add, or manual_set with positive delta)
  const added = filtered.filter(m => m.quantity > 0);
  // Consumed = negative delta (supply_delivery debits, manual_subtract, manual_set negative)
  const consumed = filtered.filter(m => m.quantity < 0);

  // Group consumed by group/subgroup
  const consumedByGroup = useMemo(() => {
    const map: Record<string, { groupName: string; total: number; subs: Record<string, { name: string; total: number; items: Movement[] }> }> = {};
    consumed.forEach(m => {
      const sub = subMap[m.subgroup_id];
      if (!sub) return;
      const g = groupMap[sub.group_id];
      const gName = g?.name ?? "—";
      const qty = Math.abs(m.quantity);
      map[sub.group_id] ??= { groupName: gName, total: 0, subs: {} };
      map[sub.group_id].total += qty;
      map[sub.group_id].subs[sub.id] ??= { name: sub.name, total: 0, items: [] };
      map[sub.group_id].subs[sub.id].total += qty;
      map[sub.group_id].subs[sub.id].items.push(m);
    });
    return map;
  }, [consumed, subMap, groupMap]);

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" />Relatórios — Estoque admin</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Grupo</Label>
            <Select value={groupId || "all"} onValueChange={(v) => { setGroupId(v === "all" ? "" : v); setSubId(""); }}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subgrupo</Label>
            <Select value={subId || "all"} onValueChange={(v) => setSubId(v === "all" ? "" : v)} disabled={!groupId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(groupId ? (subsByGroup[groupId] ?? []) : []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="added" className="mt-2">
          <TabsList>
            <TabsTrigger value="added">Adicionados ({added.length})</TabsTrigger>
            <TabsTrigger value="consumed">Consumidos ({consumed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="added">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
                ) : added.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrada no período.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="p-2">Data</th>
                        <th className="p-2">Grupo</th>
                        <th className="p-2">Subgrupo</th>
                        <th className="p-2">Tipo</th>
                        <th className="p-2 text-right">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {added.map(m => {
                        const sub = subMap[m.subgroup_id];
                        const g = sub ? groupMap[sub.group_id] : null;
                        return (
                          <tr key={m.id} className="border-t">
                            <td className="p-2 whitespace-nowrap">{fmt(m.created_at)}</td>
                            <td className="p-2">{g?.name ?? "—"}</td>
                            <td className="p-2">{sub?.name ?? "—"}</td>
                            <td className="p-2"><Badge variant="secondary">{typeLabel[m.type]}</Badge></td>
                            <td className="p-2 text-right font-bold tabular-nums text-green-600">+{m.quantity}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="p-2" colSpan={4}>Total</td>
                        <td className="p-2 text-right tabular-nums text-green-600">+{added.reduce((s, m) => s + m.quantity, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consumed">
            {loading ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Carregando...</CardContent></Card>
            ) : consumed.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum consumo no período.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {Object.entries(consumedByGroup).map(([gid, data]) => (
                  <Card key={gid}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">{data.groupName}</div>
                        <div className="text-sm">Total consumido: <strong className="text-destructive tabular-nums">{data.total}</strong></div>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(data.subs).map(([sid, sd]) => (
                          <div key={sid} className="border rounded-md">
                            <div className="flex items-center justify-between p-2 bg-muted/30">
                              <div className="text-sm font-medium">{sd.name}</div>
                              <div className="text-sm">Subtotal: <strong className="text-destructive tabular-nums">{sd.total}</strong></div>
                            </div>
                            <table className="w-full text-xs">
                              <thead className="text-left text-muted-foreground">
                                <tr>
                                  <th className="p-2">Data</th>
                                  <th className="p-2">Tipo</th>
                                  <th className="p-2">Loja</th>
                                  <th className="p-2">Observação</th>
                                  <th className="p-2 text-right">Qtd</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sd.items.map(m => {
                                  const restName = m.type === "supply_delivery" && m.reference_id ? (restaurantMap[m.reference_id] ?? "—") : "—";
                                  return (
                                    <tr key={m.id} className="border-t">
                                      <td className="p-2 whitespace-nowrap">{fmt(m.created_at)}</td>
                                      <td className="p-2"><Badge variant="outline" className="text-[10px]">{typeLabel[m.type]}</Badge></td>
                                      <td className="p-2 font-medium">{restName}</td>
                                      <td className="p-2 text-muted-foreground">{m.notes ?? "—"}</td>
                                      <td className="p-2 text-right font-bold tabular-nums text-destructive">{m.quantity}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
