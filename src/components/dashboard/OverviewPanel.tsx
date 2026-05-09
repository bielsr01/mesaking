import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/format";
import {
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  DollarSign,
  Receipt,
  Users,
  RefreshCw,
  Trophy,
  Tag,
  Truck,
  Store,
  ShoppingCart,
  Globe,
  CreditCard,
  Banknote,
  Smartphone,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, differenceInCalendarDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

const sb = supabase as any;

type SourceFilter = "all" | "web" | "pdv" | "ifood";
type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "lastmonth" | "custom";

const presets: { id: Preset; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "month", label: "Este mês" },
  { id: "lastmonth", label: "Mês passado" },
  { id: "custom", label: "Personalizado" },
];

function rangeFor(preset: Preset, custom?: DateRange): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "7d": return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "month": return { from: startOfMonth(now), to: endOfMonth(now) };
    case "lastmonth": { const lm = subDays(startOfMonth(now), 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
    case "custom":
      if (custom?.from && custom?.to) return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

function classifySource(o: any): SourceFilter {
  if (o.payment_method === "card_on_delivery" && o.order_type === "pdv") return "pdv";
  if (o.order_type === "pdv") return "pdv";
  return "web";
}

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export function OverviewPanel({ restaurantId, restaurantIds }: { restaurantId?: string; restaurantIds?: string[] }) {
  const ids = restaurantIds && restaurantIds.length > 0 ? restaurantIds : restaurantId ? [restaurantId] : [];
  const idsKey = ids.slice().sort().join(",");
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [source, setSource] = useState<SourceFilter>("all");

  const ifoodAllowedPresets: Preset[] = ["lastmonth", "month", "custom"];
  const handleSourceChange = (v: SourceFilter) => {
    setSource(v);
    if (v === "ifood" && !ifoodAllowedPresets.includes(preset)) {
      setPreset("lastmonth");
    }
  };

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const prevRange = useMemo(() => {
    const days = differenceInCalendarDays(range.to, range.from) + 1;
    return { from: startOfDay(subDays(range.from, days)), to: endOfDay(subDays(range.to, days)) };
  }, [range]);

  const ordersQ = useQuery({
    queryKey: ["overview-orders", idsKey, prevRange.from.toISOString(), range.to.toISOString()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("orders")
        .select("id, created_at, total, subtotal, discount, delivery_fee, service_fee, coupon_code, status, order_type, payment_method, external_source, customer_phone, customer_name")
        .in("restaurant_id", ids)
        .gte("created_at", prevRange.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .neq("status", "cancelled");
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const itemsQ = useQuery({
    queryKey: ["overview-items", idsKey, range.from.toISOString(), range.to.toISOString()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("order_items")
        .select("product_name, quantity, unit_price, order_id, orders!inner(restaurant_id, created_at, status)")
        .in("orders.restaurant_id", ids)
        .gte("orders.created_at", range.from.toISOString())
        .lte("orders.created_at", range.to.toISOString())
        .neq("orders.status", "cancelled");
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const customersQ = useQuery({
    queryKey: ["overview-customers", idsKey],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { count } = await sb.from("loyalty_members").select("id", { count: "exact", head: true }).in("restaurant_id", ids);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const ifoodQ = useQuery({
    queryKey: ["overview-ifood-all", idsKey],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("ifood_sales")
        .select("date_from, date_to, orders_count, gross_revenue, net_revenue, fees")
        .in("restaurant_id", ids);
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // Separate query covering month-to-date + previous month for the Compare cards,
  // independent of the selected preset.
  const compareWindow = useMemo(() => {
    const now = new Date();
    const from = startOfMonth(subDays(startOfMonth(now), 1));
    return { from, to: endOfDay(now) };
  }, []);
  const compareOrdersQ = useQuery({
    queryKey: ["overview-compare", idsKey, compareWindow.from.toISOString()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("orders")
        .select("id, created_at, total, order_type, payment_method, external_source")
        .in("restaurant_id", ids)
        .gte("created_at", compareWindow.from.toISOString())
        .lte("created_at", compareWindow.to.toISOString())
        .neq("status", "cancelled");
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // Aggregate iFood entries overlapping a date range
  const sumIfood = (from: Date, to: Date) => {
    const fromS = format(from, "yyyy-MM-dd");
    const toS = format(to, "yyyy-MM-dd");
    const rows = (ifoodQ.data ?? []).filter((r) => r.date_from <= toS && r.date_to >= fromS);
    return rows.reduce(
      (a, r) => ({
        orders: a.orders + Number(r.orders_count || 0),
        gross: a.gross + Number(r.gross_revenue || 0),
        net: a.net + Number(r.net_revenue || 0),
        fees: a.fees + Number(r.fees || 0),
      }),
      { orders: 0, gross: 0, net: 0, fees: 0 }
    );
  };
  const ifoodCur = sumIfood(range.from, range.to);
  const ifoodPrev = sumIfood(prevRange.from, prevRange.to);
  const includeIfood = source === "all" || source === "ifood";

  const all = ordersQ.data ?? [];
  const filteredAll = source === "all" ? all : source === "ifood" ? [] : all.filter((o) => classifySource(o) === source);
  const inRange = (o: any) => {
    const d = new Date(o.created_at);
    return d >= range.from && d <= range.to;
  };
  const inPrev = (o: any) => {
    const d = new Date(o.created_at);
    return d >= prevRange.from && d <= prevRange.to;
  };
  const cur = filteredAll.filter(inRange);
  const prev = filteredAll.filter(inPrev);

  const sum = (arr: any[], k: string) => arr.reduce((s, o) => s + Number(o[k] || 0), 0);
  const baseGrossCur = sum(cur, "total");
  const baseGrossPrev = sum(prev, "total");
  const baseOrdersCur = cur.length;
  const baseOrdersPrev = prev.length;

  const grossCur = baseGrossCur + (includeIfood ? ifoodCur.gross : 0);
  const grossPrev = baseGrossPrev + (includeIfood ? ifoodPrev.gross : 0);
  const ordersCountCur = baseOrdersCur + (includeIfood ? ifoodCur.orders : 0);
  const ordersCountPrev = baseOrdersPrev + (includeIfood ? ifoodPrev.orders : 0);

  const subtotalCur = sum(cur, "subtotal");
  const discountCur = sum(cur, "discount");
  const deliveryFeeCur = sum(cur, "delivery_fee");
  const serviceFeeCur = sum(cur, "service_fee") + (includeIfood ? ifoodCur.fees : 0);
  const netCur = grossCur - discountCur - (includeIfood ? ifoodCur.fees : 0);
  const ticketCur = ordersCountCur ? grossCur / ordersCountCur : 0;
  const ticketPrev = ordersCountPrev ? grossPrev / ordersCountPrev : 0;

  const couponOrders = cur.filter((o) => o.coupon_code);
  const couponImpactPct = grossCur ? (sum(couponOrders, "total") / grossCur) * 100 : 0;

  // growth
  const ordersGrowth = ordersCountPrev ? ((ordersCountCur - ordersCountPrev) / ordersCountPrev) * 100 : 0;
  const revenueGrowth = grossPrev ? ((grossCur - grossPrev) / grossPrev) * 100 : 0;
  const ticketGrowth = ticketPrev ? ((ticketCur - ticketPrev) / ticketPrev) * 100 : 0;

  // customers in period
  const phonesCur = new Set(cur.map((o) => o.customer_phone).filter(Boolean));
  const phonesPrev = new Set(prev.map((o) => o.customer_phone).filter(Boolean));
  const newCustomers = Array.from(phonesCur).filter((p) => !phonesPrev.has(p)).length;
  const phoneCounts = new Map<string, number>();
  cur.forEach((o) => { if (o.customer_phone) phoneCounts.set(o.customer_phone, (phoneCounts.get(o.customer_phone) ?? 0) + 1); });
  const recurring = Array.from(phoneCounts.values()).filter((c) => c > 1).length;
  const recurringPct = phonesCur.size ? (recurring / phonesCur.size) * 100 : 0;
  const repurchaseRate = phonesCur.size
    ? (Array.from(phoneCounts.values()).reduce((a, b) => a + (b > 1 ? 1 : 0), 0) / phonesCur.size) * 100
    : 0;
  const ticketPerCustomer = phonesCur.size ? grossCur / phonesCur.size : 0;
  const purchaseFreq = phonesCur.size ? cur.length / phonesCur.size : 0;

  // active 30d (all orders, ignoring filter)
  const last30 = subDays(new Date(), 30);
  const active30 = new Set(all.filter((o) => new Date(o.created_at) >= last30).map((o) => o.customer_phone).filter(Boolean)).size;

  // top customers
  const customerAgg = new Map<string, { name: string; phone: string; total: number; count: number }>();
  cur.forEach((o) => {
    if (!o.customer_phone) return;
    const cur2 = customerAgg.get(o.customer_phone) ?? { name: o.customer_name || "—", phone: o.customer_phone, total: 0, count: 0 };
    cur2.total += Number(o.total);
    cur2.count += 1;
    customerAgg.set(o.customer_phone, cur2);
  });
  const topCustomers = Array.from(customerAgg.values()).sort((a, b) => b.total - a.total).slice(0, 10);

  // top products
  const items = (itemsQ.data ?? []).filter((it) => {
    if (source === "all") return true;
    // we don't have order_type on items join easily; rely on orders set
    const o = cur.find((c) => c.id === it.order_id);
    return !!o;
  });
  const productAgg = new Map<string, { qty: number; revenue: number }>();
  items.forEach((it) => {
    const cur2 = productAgg.get(it.product_name) ?? { qty: 0, revenue: 0 };
    cur2.qty += Number(it.quantity);
    cur2.revenue += Number(it.quantity) * Number(it.unit_price);
    productAgg.set(it.product_name, cur2);
  });
  const topProducts = Array.from(productAgg.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // service type breakdown
  const byType = (type: string) => cur.filter((o) => o.order_type === type);
  const types = [
    { key: "delivery", label: "Delivery", icon: Truck, color: "#f59e0b" },
    { key: "pickup", label: "Retirada", icon: ShoppingCart, color: "#10b981" },
    { key: "pdv", label: "PDV / Balcão", icon: Store, color: "#3b82f6" },
  ];
  const typeRows = types.map((t) => {
    const arr = byType(t.key);
    const rev = sum(arr, "total");
    return { ...t, count: arr.length, revenue: rev, avg: arr.length ? rev / arr.length : 0 };
  });

  // by source pie
  const sourceCounts = { web: 0, pdv: 0 } as Record<string, number>;
  cur.forEach((o) => { sourceCounts[classifySource(o)]++; });

  // payment methods
  const payAgg = new Map<string, number>();
  cur.forEach((o) => { payAgg.set(o.payment_method, (payAgg.get(o.payment_method) ?? 0) + 1); });
  const payLabel: Record<string, string> = { pix: "PIX", cash: "Dinheiro", card_on_delivery: "Cartão" };

  // daily series
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const series = days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const dayCur = cur.filter((o) => format(new Date(o.created_at), "yyyy-MM-dd") === key);
    const prevDate = subDays(d, days.length);
    const prevKey = format(prevDate, "yyyy-MM-dd");
    const dayPrev = prev.filter((o) => format(new Date(o.created_at), "yyyy-MM-dd") === prevKey);
    return {
      date: format(d, "dd/MM", { locale: ptBR }),
      atual: dayCur.length,
      anterior: dayPrev.length,
      faturamento: sum(dayCur, "total"),
    };
  });

  // hours / weekday
  const hourBuckets = Array.from({ length: 12 }, (_, i) => ({ label: `${String(i * 2).padStart(2, "0")}-${String(i * 2 + 2).padStart(2, "0")}h`, count: 0 }));
  cur.forEach((o) => { const h = new Date(o.created_at).getHours(); hourBuckets[Math.floor(h / 2)].count++; });
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const wdBuckets = weekdays.map((label) => ({ label, count: 0 }));
  cur.forEach((o) => { wdBuckets[new Date(o.created_at).getDay()].count++; });
  const bestHour = [...hourBuckets].sort((a, b) => b.count - a.count)[0];
  const bestDay = [...wdBuckets].sort((a, b) => b.count - a.count)[0];

  // Comparativos automáticos: respeitam o filtro de origem (source)
  const compareAll = compareOrdersQ.data ?? [];
  const compareFiltered = source === "all"
    ? compareAll
    : source === "ifood"
      ? []
      : compareAll.filter((o) => classifySource(o) === source);
  const today = startOfDay(new Date());
  const yesterday = startOfDay(subDays(new Date(), 1));
  const lastWeekSame = startOfDay(subDays(new Date(), 7));
  const dayOrders = (d: Date) => compareFiltered.filter((o) => format(new Date(o.created_at), "yyyy-MM-dd") === format(d, "yyyy-MM-dd"));
  const sumDayIfood = (d: Date) => includeIfood ? sumIfood(startOfDay(d), endOfDay(d)).gross : 0;
  const todayRev = sum(dayOrders(today), "total") + sumDayIfood(today);
  const yRev = sum(dayOrders(yesterday), "total") + sumDayIfood(yesterday);
  const lwRev = sum(dayOrders(lastWeekSame), "total") + sumDayIfood(lastWeekSame);
  const monthStart = startOfMonth(new Date());
  const monthCur = sum(compareFiltered.filter((o) => new Date(o.created_at) >= monthStart), "total")
    + (includeIfood ? sumIfood(monthStart, endOfDay(new Date())).gross : 0);
  const monthPrevStart = startOfMonth(subDays(monthStart, 1));
  const monthPrevEnd = endOfMonth(monthPrevStart);
  const monthPrev = sum(compareFiltered.filter((o) => { const d = new Date(o.created_at); return d >= monthPrevStart && d <= monthPrevEnd; }), "total")
    + (includeIfood ? sumIfood(monthPrevStart, monthPrevEnd).gross : 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => {
              const disabled = source === "ifood" && !ifoodAllowedPresets.includes(p.id);
              return (
                <Button
                  key={p.id}
                  size="sm"
                  variant={preset === p.id ? "default" : "outline"}
                  onClick={() => setPreset(p.id)}
                  disabled={disabled}
                  className={disabled ? "opacity-40" : ""}
                >
                  {p.label}
                </Button>
              );
            })}
          </div>
          {preset === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  {custom?.from ? `${format(custom.from, "dd/MM")} - ${custom.to ? format(custom.to, "dd/MM") : "?"}` : "Selecionar datas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="range" selected={custom} onSelect={setCustom} numberOfMonths={2} />
              </PopoverContent>
            </Popover>
          )}
          <Badge variant="secondary" className="ml-auto">
            {format(range.from, "dd/MM/yy")} → {format(range.to, "dd/MM/yy")}
          </Badge>
        </CardContent>
      </Card>

      {/* Source filter */}
      <Tabs value={source} onValueChange={(v) => handleSourceChange(v as SourceFilter)}>
        <TabsList className="grid grid-cols-4 w-full max-w-3xl">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pdv">PDV</TabsTrigger>
          <TabsTrigger value="web">Web</TabsTrigger>
          <TabsTrigger value="ifood">iFood</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* KPI grid */}
      {source === "ifood" && (
        <div className="text-xs text-muted-foreground -mb-1">
          iFood é registrado manualmente: somente valores financeiros estão disponíveis. Demais métricas aparecem desabilitadas.
        </div>
      )}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={DollarSign} label="Valor das vendas" value={brl(source === "ifood" ? ifoodCur.gross : grossCur)} delta={source === "ifood" ? undefined : revenueGrowth} />
        <Kpi icon={Receipt} label="Total faturamento" value={brl(source === "ifood" ? ifoodCur.net : netCur)} sub={source === "ifood" ? undefined : `Descontos ${brl(discountCur)}`} />
        <Kpi icon={Truck} label="Taxas, serviços e ajustes" value={`- ${brl(source === "ifood" ? ifoodCur.fees : serviceFeeCur)}`} negative />
        <Kpi icon={ShoppingBag} label="Pedidos" value={ordersCountCur.toString()} delta={ordersGrowth} disabled={source === "ifood"} />
        <Kpi icon={TrendingUp} label="Ticket médio" value={brl(ticketCur)} delta={ticketGrowth} disabled={source === "ifood"} />
        <Kpi icon={Tag} label="Cupons aplicados" value={`${couponOrders.length}`} sub={`Impacto ${couponImpactPct.toFixed(1)}%`} disabled={source === "ifood"} />
        <Kpi icon={Users} label="Novos clientes" value={newCustomers.toString()} sub={`${recurringPct.toFixed(0)}% recorrentes`} disabled={source === "ifood"} />
        <Kpi icon={RefreshCw} label="Taxa de recompra" value={`${repurchaseRate.toFixed(1)}%`} sub={`Freq. ${purchaseFreq.toFixed(1)} ped./cliente`} disabled={source === "ifood"} />
      </div>

      {/* Comparativos automáticos */}
      <div className="grid gap-3 md:grid-cols-3">
        <Compare label="Hoje vs ontem" a={todayRev} b={yRev} aLabel="Hoje" bLabel="Ontem" />
        <Compare label="Hoje vs mesmo dia semana passada" a={todayRev} b={lwRev} aLabel="Hoje" bLabel="Sem. passada" />
        <Compare label="Mês atual vs mês anterior" a={monthCur} b={monthPrev} aLabel="Atual" bLabel="Anterior" />
      </div>

      {/* Service breakdown */}
      <div className={`grid gap-3 lg:grid-cols-3 ${source === "ifood" ? "opacity-40 pointer-events-none" : ""}`}>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Análise de pedidos por tipo</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeRows.map((t) => (
                  <TableRow key={t.key}>
                    <TableCell className="flex items-center gap-2"><t.icon className="w-4 h-4" style={{ color: t.color }} />{t.label}</TableCell>
                    <TableCell className="text-right font-medium">{t.count}</TableCell>
                    <TableCell className="text-right">{brl(t.revenue)}</TableCell>
                    <TableCell className="text-right">{brl(t.avg)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por tipo</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeRows.filter((t) => t.count > 0)} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {typeRows.map((t, i) => <Cell key={i} fill={t.color} />)}
                </Pie>
                <RTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Progress chart */}
      {source === "ifood" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Faturamento iFood por mês</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(ifoodQ.data ?? [])
                .slice()
                .sort((a, b) => a.date_from.localeCompare(b.date_from))
                .map((r) => ({
                  mes: format(new Date(r.date_from + "T00:00"), "MMM/yy", { locale: ptBR }),
                  vendas: Number(r.gross_revenue || 0),
                  faturamento: Number(r.net_revenue || 0),
                  taxas: Number(r.fees || 0),
                }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <RTooltip
                  formatter={(v: any, name: any) => [brl(Number(v)), name]}
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md space-y-1">
                        <div className="font-medium">{label}</div>
                        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Vendas</span><span>{brl(d.vendas)}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Faturamento</span><span className="text-emerald-600">{brl(d.faturamento)}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Taxas/Ajustes</span><span className="text-red-600">- {brl(d.taxas)}</span></div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="faturamento" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Faturamento" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
      <div>
      <Card>
        <CardHeader><CardTitle className="text-base">Progresso dos pedidos</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <RTooltip />
              <Legend />
              <Line type="monotone" dataKey="atual" stroke="hsl(var(--primary))" name="Período atual" strokeWidth={2} />
              <Line type="monotone" dataKey="anterior" stroke="#94a3b8" name="Período anterior" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sources & Payments */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" />Por origem do pedido</CardTitle></CardHeader>
          <CardContent style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: "WEB", value: sourceCounts.web },
                { name: "PDV", value: sourceCounts.pdv },
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" />Métodos de pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Array.from(payAgg.entries()).map(([method, count]) => {
              const max = Math.max(...Array.from(payAgg.values()), 1);
              const pct = (count / max) * 100;
              const Icon = method === "pix" ? Smartphone : method === "cash" ? Banknote : CreditCard;
              return (
                <div key={method} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><Icon className="w-4 h-4" />{payLabel[method] ?? method}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            {payAgg.size === 0 && <div className="text-sm text-muted-foreground text-center py-6">Sem dados</div>}
          </CardContent>
        </Card>
      </div>

      {/* Best hour & day */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Horários com mais vendas</CardTitle>
            {bestHour && bestHour.count > 0 && <div className="text-sm text-muted-foreground">Melhor: <strong>{bestHour.label}</strong> ({bestHour.count} pedidos)</div>}
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourBuckets} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={70} />
                <RTooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dias com mais vendas</CardTitle>
            {bestDay && bestDay.count > 0 && <div className="text-sm text-muted-foreground">Melhor: <strong>{bestDay.label}</strong> ({bestDay.count} pedidos)</div>}
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wdBuckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top customers & products */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" />Top clientes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((c, i) => (
                  <TableRow key={c.phone}>
                    <TableCell className="font-bold">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium truncate max-w-[180px]">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    </TableCell>
                    <TableCell className="text-right">{c.count}</TableCell>
                    <TableCell className="text-right font-medium">{brl(c.total)}</TableCell>
                  </TableRow>
                ))}
                {topCustomers.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>}
              </TableBody>
            </Table>
            <div className="text-xs text-muted-foreground mt-3 flex justify-between border-t pt-3">
              <span>Clientes cadastrados: <strong>{customersQ.data ?? 0}</strong></span>
              <span>Ativos (30d): <strong>{active30}</strong></span>
              <span>Ticket/cliente: <strong>{brl(ticketPerCustomer)}</strong></span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Produtos mais vendidos</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((p, i) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-bold">{i + 1}</TableCell>
                    <TableCell className="truncate max-w-[220px]">{p.name}</TableCell>
                    <TableCell className="text-right">{p.qty}</TableCell>
                    <TableCell className="text-right font-medium">{brl(p.revenue)}</TableCell>
                  </TableRow>
                ))}
                {topProducts.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, delta, disabled, negative }: { icon: any; label: string; value: string; sub?: string; delta?: number; disabled?: boolean; negative?: boolean }) {
  const showDelta = typeof delta === "number" && isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className={disabled ? "opacity-40" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</div>
          {showDelta && !disabled && (
            <span className={`flex items-center gap-0.5 font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}>
              {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(delta!).toFixed(1)}%
            </span>
          )}
        </div>
        <div className={`text-2xl font-bold mt-1 ${negative ? "text-red-600" : ""}`}>{disabled ? "—" : value}</div>
        {sub && !disabled && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        {disabled && <div className="text-xs text-muted-foreground mt-0.5">Indisponível para iFood</div>}
      </CardContent>
    </Card>
  );
}

function Compare({ label, a, b, aLabel, bLabel }: { label: string; a: number; b: number; aLabel: string; bLabel: string }) {
  const diff = b ? ((a - b) / b) * 100 : 0;
  const positive = a >= b;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="flex items-end justify-between mt-2 gap-2">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">{aLabel}</div>
            <div className="text-lg font-bold">{brl(a)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">{bLabel}</div>
            <div className="text-base text-muted-foreground">{brl(b)}</div>
          </div>
        </div>
        {b > 0 && (
          <div className={`mt-2 text-sm font-medium flex items-center gap-1 ${positive ? "text-emerald-600" : "text-red-600"}`}>
            {positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {positive ? "+" : ""}{diff.toFixed(1)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}
