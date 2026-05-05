import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Download } from "lucide-react";
import { brl } from "@/lib/format";

type Restaurant = { id: string; name: string; slug: string };
type Status = "pending" | "accepted" | "shipped" | "delivered" | "all";

type Order = {
  id: string; restaurant_id: string; status: Exclude<Status, "all">;
  total: number; created_at: string;
  supply_order_items?: {
    id: string; product_id: string | null; product_name: string;
    quantity: number; unit_price: number; unit: string | null;
    supply_order_item_options?: { option_name: string; quantity: number }[];
  }[];
};

const STATUSES: { value: Status; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Aguardando" },
  { value: "accepted", label: "Aceitos" },
  { value: "shipped", label: "Enviados" },
  { value: "delivered", label: "Entregues" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
};

export function SupplyReportsDialog() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<Status>("all");
  const [restaurantId, setRestaurantId] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const { data: restaurants = [] } = useQuery({
    queryKey: ["report_restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id,name,slug").order("name");
      return (data ?? []) as Restaurant[];
    },
    enabled: open,
  });
  const restMap = Object.fromEntries(restaurants.map(r => [r.id, r]));

  const { data: orders = [], isFetching } = useQuery({
    queryKey: ["report_orders", from, to, status, restaurantId],
    queryFn: async () => {
      let q = supabase.from("supply_orders")
        .select("*, supply_order_items(*, supply_order_item_options(*))")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (restaurantId !== "all") q = q.eq("restaurant_id", restaurantId);
      const { data } = await q;
      return (data ?? []) as Order[];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!productSearch.trim()) return orders;
    const term = productSearch.trim().toLowerCase();
    return orders.filter(o => o.supply_order_items?.some(it => it.product_name.toLowerCase().includes(term)));
  }, [orders, productSearch]);

  const totals = useMemo(() => {
    const totalOrders = filtered.length;
    const totalRevenue = filtered.reduce((s, o) => s + Number(o.total), 0);
    const totalItems = filtered.reduce((s, o) =>
      s + (o.supply_order_items?.reduce((ss, it) => ss + it.quantity, 0) ?? 0), 0);
    const avg = totalOrders ? totalRevenue / totalOrders : 0;
    return { totalOrders, totalRevenue, totalItems, avg };
  }, [filtered]);

  const byRestaurant = useMemo(() => {
    const map: Record<string, { orders: number; total: number; items: number }> = {};
    filtered.forEach(o => {
      const m = (map[o.restaurant_id] ??= { orders: 0, total: 0, items: 0 });
      m.orders += 1;
      m.total += Number(o.total);
      m.items += o.supply_order_items?.reduce((s, it) => s + it.quantity, 0) ?? 0;
    });
    return Object.entries(map)
      .map(([rid, v]) => ({ rid, ...v, avg: v.orders ? v.total / v.orders : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byProduct = useMemo(() => {
    const map: Record<string, { qty: number; total: number; orders: Set<string>; restaurants: Set<string> }> = {};
    filtered.forEach(o => {
      o.supply_order_items?.forEach(it => {
        const m = (map[it.product_name] ??= { qty: 0, total: 0, orders: new Set(), restaurants: new Set() });
        m.qty += it.quantity;
        m.total += Number(it.unit_price) * it.quantity;
        m.orders.add(o.id);
        m.restaurants.add(o.restaurant_id);
      });
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, qty: v.qty, total: v.total, orders: v.orders.size, restaurants: v.restaurants.size }))
      .sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const byOption = useMemo(() => {
    // Per-product per-option breakdown (e.g., coxinha: frango 3000, carne 2000)
    const map: Record<string, Record<string, number>> = {};
    filtered.forEach(o => {
      o.supply_order_items?.forEach(it => {
        if (!it.supply_order_item_options?.length) return;
        const m = (map[it.product_name] ??= {});
        it.supply_order_item_options.forEach(op => {
          m[op.option_name] = (m[op.option_name] ?? 0) + op.quantity;
        });
      });
    });
    return Object.entries(map).map(([product, opts]) => ({
      product,
      options: Object.entries(opts).sort((a, b) => b[1] - a[1]),
      total: Object.values(opts).reduce((s, n) => s + n, 0),
    })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const exportCSV = () => {
    const lines = ["Data,Restaurante,Status,Total,Itens,Produtos"];
    filtered.forEach(o => {
      const r = restMap[o.restaurant_id]?.name ?? "—";
      const items = o.supply_order_items?.reduce((s, it) => s + it.quantity, 0) ?? 0;
      const prods = o.supply_order_items?.map(it => `${it.quantity}x ${it.product_name}`).join(" | ") ?? "";
      lines.push([
        new Date(o.created_at).toLocaleString("pt-BR"),
        `"${r.replace(/"/g, '""')}"`,
        o.status,
        Number(o.total).toFixed(2),
        items,
        `"${prods.replace(/"/g, '""')}"`,
      ].join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-insumos-${from}-a-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2 h-12 px-6 text-base font-semibold shadow-md">
          <BarChart3 className="w-5 h-5" /> Relatórios
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> Relatórios de pedidos
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Restaurante</Label>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar produto</Label>
            <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="ex.: coxinha" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="ghost" onClick={() => { setFrom(todayISO()); setTo(todayISO()); }}>Hoje</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(monthStartISO()); setTo(todayISO()); }}>Este mês</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - 30);
              setFrom(d.toISOString().slice(0, 10)); setTo(todayISO());
            }}>Últimos 30 dias</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1);
              const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
              setFrom(d.toISOString().slice(0, 10)); setTo(end.toISOString().slice(0, 10));
            }}>Mês passado</Button>
          </div>
          <Button size="sm" variant="outline" onClick={exportCSV} className="gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pedidos" value={totals.totalOrders} />
          <Stat label="Faturamento" value={brl(totals.totalRevenue)} />
          <Stat label="Ticket médio" value={brl(totals.avg)} />
          <Stat label="Itens vendidos" value={totals.totalItems.toLocaleString("pt-BR")} />
        </div>

        <Tabs defaultValue="restaurants">
          <TabsList>
            <TabsTrigger value="restaurants">Por restaurante</TabsTrigger>
            <TabsTrigger value="products">Por produto</TabsTrigger>
            <TabsTrigger value="variants">Por variante</TabsTrigger>
            <TabsTrigger value="orders">Pedidos ({filtered.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="restaurants">
            {byRestaurant.length === 0 ? (
              <Empty />
            ) : (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Restaurante</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Itens</TableHead>
                      <TableHead className="text-right">Ticket médio</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byRestaurant.map(r => (
                      <TableRow key={r.rid}>
                        <TableCell className="font-medium">{restMap[r.rid]?.name ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.orders}</TableCell>
                        <TableCell className="text-right">{r.items.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{brl(r.avg)}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="products">
            {byProduct.length === 0 ? <Empty /> : (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Restaurantes</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProduct.map(p => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-semibold">{p.qty.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{p.orders}</TableCell>
                        <TableCell className="text-right">{p.restaurants}</TableCell>
                        <TableCell className="text-right">{brl(p.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="variants">
            {byOption.length === 0 ? <Empty msg="Nenhum produto com variantes neste período." /> : (
              <div className="space-y-3">
                {byOption.map(p => (
                  <Card key={p.product}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-baseline mb-2">
                        <div className="font-semibold">{p.product}</div>
                        <div className="text-sm text-muted-foreground">Total: {p.total.toLocaleString("pt-BR")}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {p.options.map(([n, q]) => (
                          <Badge key={n} variant="secondary" className="text-sm py-1">
                            {n}: <span className="font-bold ml-1">{q.toLocaleString("pt-BR")}</span>
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders">
            {filtered.length === 0 ? <Empty /> : (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Restaurante</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Itens</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(o => {
                      const items = o.supply_order_items?.reduce((s, it) => s + it.quantity, 0) ?? 0;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</TableCell>
                          <TableCell>{restMap[o.restaurant_id]?.name ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                          <TableCell className="text-right">{items}</TableCell>
                          <TableCell className="text-right font-semibold">{brl(Number(o.total))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>

        {isFetching && <div className="text-xs text-muted-foreground text-center">Atualizando...</div>}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-4 pb-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </CardContent></Card>
  );
}
function Empty({ msg = "Sem dados no período selecionado." }: { msg?: string }) {
  return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{msg}</CardContent></Card>;
}
