import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/format";
import { Banknote, CreditCard, QrCode, TrendingUp, TrendingDown, Receipt, Wallet } from "lucide-react";

const sb = supabase as any;

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const YEARS = [2026, 2027, 2028];

function rangeFor(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString(), startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function FinancePanel({ restaurantIds }: { restaurantIds: string[] }) {
  const now = new Date();
  const defaultYear = YEARS.includes(now.getFullYear()) ? now.getFullYear() : YEARS[0];
  const [month, setMonthN] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(defaultYear);
  const { startISO, endISO, startDate, endDate } = useMemo(() => rangeFor(year, month), [year, month]);
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;

  const enabled = restaurantIds.length > 0;

  const ordersQ = useQuery({
    queryKey: ["finance-orders", restaurantIds.slice().sort().join(","), month],
    queryFn: async () => {
      const { data } = await sb
        .from("orders")
        .select("total,payment_method,status,created_at")
        .in("restaurant_id", restaurantIds)
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .neq("status", "cancelled");
      return (data ?? []) as { total: number; payment_method: string }[];
    },
    enabled,
  });

  const expensesQ = useQuery({
    queryKey: ["finance-expenses", restaurantIds.slice().sort().join(","), month],
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

  const totals = useMemo(() => {
    const rows = ordersQ.data ?? [];
    let cash = 0, pix = 0, card = 0;
    for (const o of rows) {
      const v = Number(o.total) || 0;
      if (o.payment_method === "cash") cash += v;
      else if (o.payment_method === "pix") pix += v;
      else if (o.payment_method === "card_on_delivery") card += v;
    }
    const revenue = cash + pix + card;
    const expenses = (expensesQ.data ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const result = revenue - expenses;
    return { cash, pix, card, revenue, expenses, result };
  }, [ordersQ.data, expensesQ.data]);

  const loading = ordersQ.isLoading || expensesQ.isLoading;
  const positive = totals.result >= 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Período:</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
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
            <StatCard icon={Banknote} label="Vendas em dinheiro" value={brl(totals.cash)} accent="text-success" />
            <StatCard icon={QrCode} label="Vendas no Pix" value={brl(totals.pix)} accent="text-primary" />
            <StatCard icon={CreditCard} label="Vendas no cartão" value={brl(totals.card)} accent="text-blue-600" />
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
