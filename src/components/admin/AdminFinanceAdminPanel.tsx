import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { brl } from "@/lib/format";
import { Package, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";

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
  const endDate = `${nextY}-${pad(nextM)}-01`;
  return { startISO: start.toISOString(), endISO: end.toISOString(), startDate, endDate };
}

export function AdminFinanceAdminPanel() {
  const now = new Date();
  const defaultYear = YEARS.includes(now.getFullYear()) ? now.getFullYear() : YEARS[0];
  const [month, setMonthN] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(defaultYear);
  const { startISO, endISO, startDate, endDate } = useMemo(() => rangeFor(year, month), [year, month]);
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;

  const supplyQ = useQuery({
    queryKey: ["admin-finance-supply", periodKey],
    queryFn: async () => {
      const { data } = await sb
        .from("supply_orders")
        .select("total,status,delivered_at")
        .eq("status", "delivered")
        .gte("delivered_at", startISO)
        .lt("delivered_at", endISO);
      return (data ?? []) as { total: number }[];
    },
  });

  const expensesQ = useQuery({
    queryKey: ["admin-finance-expenses", periodKey],
    queryFn: async () => {
      const { data } = await sb
        .from("admin_expenses")
        .select("amount,expense_date")
        .gte("expense_date", startDate)
        .lt("expense_date", endDate);
      return (data ?? []) as { amount: number }[];
    },
  });

  const totals = useMemo(() => {
    const revenue = (supplyQ.data ?? []).reduce((s, r) => s + (Number(r.total) || 0), 0);
    const expenses = (expensesQ.data ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { revenue, expenses, result: revenue - expenses };
  }, [supplyQ.data, expensesQ.data]);

  const loading = supplyQ.isLoading || expensesQ.isLoading;
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

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={Package} label="Receitas de venda de insumos" value={brl(totals.revenue)} accent="text-success" />
          <StatCard icon={Receipt} label="Despesas da fábrica" value={brl(totals.expenses)} accent="text-destructive" />
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
