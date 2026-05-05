import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { TrendingUp, TrendingDown, Users, Coins, Award, Crown } from "lucide-react";

const sb = supabase as any;

type Period = "7d" | "30d" | "90d" | "year" | "all";
const periodDays: Record<Period, number | null> = { "7d": 7, "30d": 30, "90d": 90, year: 365, all: null };

export function LoyaltyMetricsDialog({ open, onOpenChange, restaurantId }: { open: boolean; onOpenChange: (o: boolean) => void; restaurantId: string }) {
  const [period, setPeriod] = useState<Period>("30d");

  const sinceISO = useMemo(() => {
    const d = periodDays[period];
    if (!d) return null;
    const date = new Date(); date.setDate(date.getDate() - d);
    return date.toISOString();
  }, [period]);

  const txQ = useQuery({
    queryKey: ["loyalty-metrics-tx", restaurantId, period],
    enabled: open,
    queryFn: async () => {
      let q = sb.from("loyalty_transactions").select("id, member_id, order_id, points, type, status, created_at, credited_at").eq("restaurant_id", restaurantId);
      if (sinceISO) q = q.gte("created_at", sinceISO);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const membersQ = useQuery({
    queryKey: ["loyalty-metrics-members", restaurantId],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb.from("loyalty_members").select("id, name, phone, points").eq("restaurant_id", restaurantId);
      return (data ?? []) as { id: string; name: string; phone: string; points: number }[];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["loyalty-metrics-orders", restaurantId, period],
    enabled: open,
    queryFn: async () => {
      let q = sb.from("orders").select("id, total, customer_phone, loyalty_opt_in, created_at, status").eq("restaurant_id", restaurantId).in("status", ["delivered", "completed"]);
      if (sinceISO) q = q.gte("created_at", sinceISO);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const metrics = useMemo(() => {
    const txs = txQ.data ?? [];
    const members = membersQ.data ?? [];
    const orders = ordersQ.data ?? [];

    const earned = txs.filter((t) => t.points > 0).reduce((s, t) => s + Number(t.points), 0);
    const redeemed = txs.filter((t) => t.points < 0).reduce((s, t) => s + Math.abs(Number(t.points)), 0);
    const totalOpenPoints = members.reduce((s, m) => s + Number(m.points || 0), 0);
    const activeMembers = members.filter((m) => Number(m.points) > 0).length;

    const loyaltyOrders = orders.filter((o) => o.loyalty_opt_in);
    const nonLoyaltyOrders = orders.filter((o) => !o.loyalty_opt_in);
    const avg = (arr: any[]) => (arr.length ? arr.reduce((s, o) => s + Number(o.total), 0) / arr.length : 0);
    const ticketLoyalty = avg(loyaltyOrders);
    const ticketNon = avg(nonLoyaltyOrders);
    const ticketDelta = ticketNon > 0 ? ((ticketLoyalty - ticketNon) / ticketNon) * 100 : 0;

    // Top members by activity (earned + redeemed)
    const memberAgg = new Map<string, { earned: number; redeemed: number }>();
    txs.forEach((t) => {
      const cur = memberAgg.get(t.member_id) ?? { earned: 0, redeemed: 0 };
      if (t.points >= 0) cur.earned += Number(t.points);
      else cur.redeemed += Math.abs(Number(t.points));
      memberAgg.set(t.member_id, cur);
    });
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const topMembers = Array.from(memberAgg.entries())
      .map(([id, v]) => ({ ...v, member: memberMap.get(id) }))
      .filter((x) => x.member)
      .sort((a, b) => (b.earned + b.redeemed) - (a.earned + a.redeemed))
      .slice(0, 10);

    return {
      earned, redeemed, totalOpenPoints, activeMembers,
      totalMembers: members.length,
      ticketLoyalty, ticketNon, ticketDelta,
      loyaltyCount: loyaltyOrders.length, nonLoyaltyCount: nonLoyaltyOrders.length,
      topMembers,
    };
  }, [txQ.data, membersQ.data, ordersQ.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Award className="w-5 h-5" />Métricas do programa de fidelidade</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="year">Último ano</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Pontos gerados" value={metrics.earned.toLocaleString("pt-BR")} />
          <KpiCard icon={<TrendingDown className="w-4 h-4" />} label="Pontos resgatados" value={metrics.redeemed.toLocaleString("pt-BR")} />
          <KpiCard icon={<Coins className="w-4 h-4" />} label="Saldo em aberto (passivo)" value={metrics.totalOpenPoints.toLocaleString("pt-BR")} />
          <KpiCard icon={<Users className="w-4 h-4" />} label="Clientes ativos / total" value={`${metrics.activeMembers} / ${metrics.totalMembers}`} />
        </div>

        <Tabs defaultValue="impact" className="mt-4">
          <TabsList>
            <TabsTrigger value="impact">Impacto financeiro</TabsTrigger>
            <TabsTrigger value="vip">Clientes VIP</TabsTrigger>
          </TabsList>

          <TabsContent value="impact" className="space-y-3 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KpiCard label="Ticket médio COM fidelidade" value={brl(metrics.ticketLoyalty)} sub={`${metrics.loyaltyCount} pedidos`} />
              <KpiCard label="Ticket médio SEM fidelidade" value={brl(metrics.ticketNon)} sub={`${metrics.nonLoyaltyCount} pedidos`} />
              <KpiCard
                label="Variação do gasto médio"
                value={`${metrics.ticketDelta >= 0 ? "+" : ""}${metrics.ticketDelta.toFixed(1)}%`}
                highlight={metrics.ticketDelta >= 0 ? "good" : "bad"}
              />
            </div>
            <div className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
              {metrics.ticketDelta >= 0 ? (
                <>Clientes que aderiram ao programa de fidelidade gastam, em média, <strong>{metrics.ticketDelta.toFixed(1)}%</strong> a mais por pedido. O programa está gerando incremento de faturamento.</>
              ) : (
                <>Clientes do programa estão gastando <strong>{Math.abs(metrics.ticketDelta).toFixed(1)}%</strong> a menos do que os demais. Avalie a regra de pontos ou as recompensas oferecidas.</>
              )}
            </div>
          </TabsContent>

          <TabsContent value="vip" className="pt-4">
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                    <TableHead className="text-right">Resgatado</TableHead>
                    <TableHead className="text-right">Saldo atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.topMembers.map((m, i) => (
                    <TableRow key={m.member!.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {i < 3 && <Crown className="w-4 h-4 text-yellow-500" />}
                          <div>
                            <div className="font-medium">{m.member!.name}</div>
                            <div className="text-xs text-muted-foreground">{m.member!.phone}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">{m.earned.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{m.redeemed.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right"><Badge>{m.member!.points}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {metrics.topMembers.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sem dados no período</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ icon, label, value, sub, highlight }: { icon?: React.ReactNode; label: string; value: string; sub?: string; highlight?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`text-2xl font-bold mt-1 ${highlight === "good" ? "text-green-600" : highlight === "bad" ? "text-red-600" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
