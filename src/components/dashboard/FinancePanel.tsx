import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/format";
import { Banknote, CreditCard, QrCode, TrendingUp, TrendingDown, Receipt, Wallet, Bike, Truck } from "lucide-react";
import { calcIfoodReceivable } from "@/lib/ifoodFees";
import { calcQueroReceivable } from "@/lib/queroFees";

const sb = supabase as any;

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const YEARS = [2026, 2027, 2028];

function rangeFor(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startDate = `${year}-${pad(month)}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const endDate = `${nextY}-${pad(nextM)}-01`; // exclusivo
  return { startISO: start.toISOString(), endISO: end.toISOString(), startDate, endDate };
}

export function FinancePanel({ restaurantIds }: { restaurantIds: string[] }) {
  const now = new Date();
  const defaultYear = YEARS.includes(now.getFullYear()) ? now.getFullYear() : YEARS[0];
  const [month, setMonthN] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(defaultYear);
  const { startISO, endISO, startDate, endDate } = useMemo(() => rangeFor(year, month), [year, month]);
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;

  const enabled = restaurantIds.length > 0;
  const idsKey = restaurantIds.slice().sort().join(",");

  const ordersQ = useQuery({
    queryKey: ["finance-orders", idsKey, periodKey],
    queryFn: async () => {
      const { data } = await sb
        .from("orders")
        .select("restaurant_id,total,subtotal,delivery_fee,service_fee,discount,merchant_subsidy,ifood_subsidy,payment_method,external_source,status,created_at")
        .in("restaurant_id", restaurantIds)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .neq("status", "cancelled");
      return (data ?? []) as any[];
    },
    enabled,
  });

  const expensesQ = useQuery({
    queryKey: ["finance-expenses", idsKey, periodKey],
    queryFn: async () => {
      const { data } = await sb
        .from("expenses")
        .select("amount,expense_date")
        .in("restaurant_id", restaurantIds)
        .gte("expense_date", startDate)
        .lt("expense_date", endDate);
      return (data ?? []) as { amount: number }[];
    },
    enabled,
  });

  const ifoodFeesQ = useQuery({
    queryKey: ["finance-ifood-fees", idsKey],
    enabled,
    queryFn: async () => {
      const { data } = await sb.from("ifood_fee_settings").select("*").in("restaurant_id", restaurantIds);
      const map = new Map<string, any>();
      (data ?? []).forEach((r: any) => map.set(r.restaurant_id, r));
      return map;
    },
    staleTime: 60_000,
  });

  const queroFeesQ = useQuery({
    queryKey: ["finance-quero-fees", idsKey],
    enabled,
    queryFn: async () => {
      const { data } = await sb.from("quero_fee_settings").select("*").in("restaurant_id", restaurantIds);
      const map = new Map<string, any>();
      (data ?? []).forEach((r: any) => map.set(r.restaurant_id, r));
      return map;
    },
    staleTime: 60_000,
  });

  const totals = useMemo(() => {
    const rows = ordersQ.data ?? [];
    let cash = 0, pix = 0, card = 0, ifoodNet = 0, queroNet = 0;
    for (const o of rows) {
      const v = Number(o.total) || 0;
      if (o.external_source === "ifood") {
        const s = ifoodFeesQ.data?.get(o.restaurant_id);
        ifoodNet += calcIfoodReceivable(o, s).net;
        continue;
      }
      if (o.external_source === "quero") {
        const s = queroFeesQ.data?.get(o.restaurant_id);
        queroNet += calcQueroReceivable(o, s).net;
        continue;
      }
      if (o.payment_method === "cash") cash += v;
      else if (o.payment_method === "pix") pix += v;
      else if (o.payment_method === "card_on_delivery") card += v;
    }
    const revenue = cash + pix + card + ifoodNet + queroNet;
    const expenses = (expensesQ.data ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const result = revenue - expenses;
    return { cash, pix, card, ifoodNet, queroNet, revenue, expenses, result };
  }, [ordersQ.data, expensesQ.data, ifoodFeesQ.data, queroFeesQ.data]);

  const loading = ordersQ.isLoading || expensesQ.isLoading;
  const positive = totals.result >= 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Período:</span>
          <Select value={String(month)} onValueChange={(v) => setMonthN(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!enabled ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Selecione ao menos um restaurante.</CardContent></Card>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Banknote} label="Dinheiro (PDV + Delivery direto)" value={brl(totals.cash)} accent="text-success" />
            <StatCard icon={QrCode} label="Pix (PDV + Delivery direto)" value={brl(totals.pix)} accent="text-primary" />
            <StatCard icon={CreditCard} label="Cartão (PDV + Delivery direto)" value={brl(totals.card)} accent="text-blue-600" />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Wallet} label="Receita total PDV + Delivery direto" value={brl(totals.cash + totals.pix + totals.card)} accent="text-success" />
            <StatCard icon={Bike} label="Receita iFood (líquida)" value={brl(totals.ifoodNet)} accent="text-red-600" />
            <StatCard icon={Truck} label="Receita Quero Delivery (líquida)" value={brl(totals.queroNet)} accent="text-orange-600" />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Wallet} label="Receita total" value={brl(totals.revenue)} accent="text-success" />
            <StatCard icon={Receipt} label="Despesas totais" value={brl(totals.expenses)} accent="text-destructive" />
            <Card className={positive ? "border-success" : "border-destructive"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  {positive ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-destructive" />}
                  Resultado do período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
                  {positive ? "+" : ""}{brl(totals.result)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {positive ? "Saldo positivo" : "Saldo negativo"}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-accent grid place-items-center ${accent ?? "text-foreground"}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
