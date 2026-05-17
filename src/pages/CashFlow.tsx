import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowDownCircle, ArrowUpCircle, Banknote, Calculator, CreditCard,
  DollarSign, History, LockOpen, Lock, Plus, Printer, Receipt, ShoppingBag,
  TrendingDown, TrendingUp, Wallet, AlertTriangle, Smartphone, Bike, ShieldCheck,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { brl } from "@/lib/format";
import {
  computeTotals, detectPlatform, normalizeMethod, METHOD_LABEL,
  type OrderLike, type CashMovement,
} from "@/lib/cashFlow";
import { useOpenSession, useSessionMovements, useSessionOrders, useCashRealtime } from "@/hooks/useCashSession";
import { DEFAULT_IFOOD_FEES } from "@/lib/ifoodFees";
import { DEFAULT_QUERO_FEES } from "@/lib/queroFees";

type Restaurant = { id: string; name: string };

async function fetchManagerRestaurant(userId: string, isMasterAdmin: boolean): Promise<Restaurant | null> {
  let { data: own } = await supabase.from("restaurants").select("id,name").eq("owner_id", userId).maybeSingle();
  if (!own) {
    const { data: mem } = await supabase.from("restaurant_members").select("restaurant_id").eq("user_id", userId).maybeSingle();
    if (mem) {
      const { data: r } = await supabase.from("restaurants").select("id,name").eq("id", mem.restaurant_id).maybeSingle();
      own = r ?? null;
    }
  }
  if (!own && isMasterAdmin) {
    const { data } = await supabase.from("restaurants").select("id,name").order("created_at", { ascending: false }).limit(1).maybeSingle();
    own = data ?? null;
  }
  return own;
}

export default function CashFlow() {
  const { user, isMasterAdmin } = useAuth();

  const { data: restaurant } = useQuery({
    queryKey: ["cashRestaurant", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchManagerRestaurant(user!.id, isMasterAdmin),
  });

  const { permissions, isFullAccess, loading: permsLoading } = usePermissions(restaurant?.id);
  const canView = isFullAccess || permissions.cash_flow?.view;
  const canOperate = isFullAccess || permissions.cash_flow?.operate;
  const canAdmin = isFullAccess || permissions.cash_flow?.admin;

  if (!restaurant || permsLoading) {
    return <div className="p-6"><Skeleton className="h-10 w-48" /></div>;
  }
  if (!canView) {
    return <div className="p-6 text-muted-foreground">Você não tem permissão para visualizar o Fluxo de Caixa.</div>;
  }

  return <CashFlowContent restaurantId={restaurant.id} restaurantName={restaurant.name} canOperate={!!canOperate} canAdmin={!!canAdmin} />;
}

function CashFlowContent({ restaurantId, restaurantName, canOperate, canAdmin }: {
  restaurantId: string; restaurantName: string; canOperate: boolean; canAdmin: boolean;
}) {
  const qc = useQueryClient();
  const sessionQ = useOpenSession(restaurantId);
  const session = sessionQ.data;
  const movementsQ = useSessionMovements(session?.id);
  const ordersQ = useSessionOrders(restaurantId, session?.opened_at);
  useCashRealtime(restaurantId, session?.id);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [withdrawDialog, setWithdrawDialog] = useState(false);
  const [supplyDialog, setSupplyDialog] = useState(false);
  const [mode, setMode] = useState<"simple" | "advanced">(canAdmin ? "advanced" : "simple");

  const orders = ordersQ.data ?? [];
  const movements = movementsQ.data ?? [];
  const totals = useMemo(
    () => computeTotals(orders, movements, DEFAULT_IFOOD_FEES, DEFAULT_QUERO_FEES),
    [orders, movements],
  );

  const platformsTotal = (totals.byPlatform.delivery ?? 0) + (totals.byPlatform.pdv ?? 0);
  const ifoodTotal = totals.byPlatform.ifood ?? 0;
  const queroTotal = totals.byPlatform.quero ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-primary" /> Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">{restaurantName} {session ? <Badge variant="default" className="ml-2 bg-emerald-600">Caixa aberto</Badge> : <Badge variant="secondary" className="ml-2">Sem caixa aberto</Badge>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAdmin && (
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Caixa simplificado</SelectItem>
                <SelectItem value="advanced">Financeiro avançado</SelectItem>
              </SelectContent>
            </Select>
          )}
          {canOperate && !session && <Button onClick={() => setOpenDialog(true)}><LockOpen className="w-4 h-4 mr-1" /> Abrir caixa</Button>}
          {canOperate && session && (
            <>
              <Button variant="outline" onClick={() => setSupplyDialog(true)}><ArrowDownCircle className="w-4 h-4 mr-1" /> Suprimento</Button>
              <Button variant="outline" onClick={() => setWithdrawDialog(true)}><ArrowUpCircle className="w-4 h-4 mr-1" /> Sangria</Button>
              <Button variant="destructive" onClick={() => setCloseDialog(true)}><Lock className="w-4 h-4 mr-1" /> Fechar caixa</Button>
            </>
          )}
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard icon={ShoppingBag} label="Pedidos" value={String(totals.ordersCount)} tone="primary" />
        <StatCard icon={DollarSign} label="Total vendido" value={brl(totals.gross)} tone="primary" />
        <StatCard icon={Banknote} label="Dinheiro" value={brl(totals.byMethod.cash ?? 0)} tone="success" />
        <StatCard icon={Smartphone} label="Pix" value={brl(totals.byMethod.pix ?? 0)} tone="info" />
        <StatCard icon={CreditCard} label="Crédito" value={brl(totals.byMethod.credit ?? 0)} tone="info" />
        <StatCard icon={CreditCard} label="Débito" value={brl(totals.byMethod.debit ?? 0)} tone="info" />
        <StatCard icon={Bike} label="iFood" value={brl(ifoodTotal)} tone="warning" />
        <StatCard icon={Bike} label="Quero" value={brl(queroTotal)} tone="warning" />
        <StatCard icon={TrendingDown} label="Taxas plataformas" value={brl(totals.fees)} tone="danger" />
        <StatCard icon={TrendingUp} label="Líquido previsto" value={brl(totals.net)} tone="success" />
        <StatCard icon={Wallet} label="Esperado em caixa" value={brl(totals.expectedCash)} tone="primary" />
        <StatCard icon={Calculator} label="Diferença" value={brl((session?.counted_cash ?? totals.expectedCash) - totals.expectedCash)} tone={Math.abs(((session?.counted_cash ?? totals.expectedCash) - totals.expectedCash)) > 1 ? "danger" : "muted"} />
      </div>

      <Tabs defaultValue={mode === "simple" ? "session" : "summary"} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          {mode === "advanced" && <TabsTrigger value="summary">Resumo</TabsTrigger>}
          <TabsTrigger value="session">Caixa atual</TabsTrigger>
          {mode === "advanced" && <TabsTrigger value="movements">Movimentações</TabsTrigger>}
          <TabsTrigger value="withdrawals">Sangrias</TabsTrigger>
          {mode === "advanced" && <TabsTrigger value="charts">Dashboard</TabsTrigger>}
          <TabsTrigger value="history">Histórico</TabsTrigger>
          {canAdmin && <TabsTrigger value="audit">Auditoria</TabsTrigger>}
        </TabsList>

        {mode === "advanced" && (
          <TabsContent value="summary" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Dinheiro físico esperado no caixa</CardTitle></CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <Row label="Valor de abertura" value={brl(totals.opening)} />
                  <Row label="Entradas em dinheiro" value={brl(totals.cashFromOrders)} positive />
                  <Row label="Trocos retirados" value={brl(totals.changeOut)} negative />
                  <Row label="Suprimentos" value={brl(totals.supplies)} positive />
                  <Row label="Sangrias" value={brl(totals.withdrawals)} negative />
                  <Row label="Total esperado" value={brl(totals.expectedCash)} strong />
                </div>
              </CardContent>
            </Card>
            <PlatformsCompareCard orders={orders} />
          </TabsContent>
        )}

        <TabsContent value="session" className="space-y-4">
          <SessionCard session={session} totals={totals} ordersPending={orders.filter((o) => o.status === "pending").length} />
        </TabsContent>

        {mode === "advanced" && (
          <TabsContent value="movements">
            <MovementsTable orders={orders} movements={movements} />
          </TabsContent>
        )}

        <TabsContent value="withdrawals">
          <WithdrawalsList sessionId={session?.id} restaurantId={restaurantId} canOperate={canOperate && !!session} onAdd={() => setWithdrawDialog(true)} />
        </TabsContent>

        {mode === "advanced" && (
          <TabsContent value="charts" className="space-y-4">
            <ChartsBoard orders={orders} totals={totals} />
          </TabsContent>
        )}

        <TabsContent value="history">
          <SessionsHistoryPanel restaurantId={restaurantId} />
        </TabsContent>

        {canAdmin && (
          <TabsContent value="audit">
            <AuditLogPanel restaurantId={restaurantId} />
          </TabsContent>
        )}
      </Tabs>

      {openDialog && <OpenSessionDialog restaurantId={restaurantId} onClose={(ok) => { setOpenDialog(false); if (ok) qc.invalidateQueries({ queryKey: ["cashSession", restaurantId] }); }} />}
      {closeDialog && session && <CloseSessionDialog session={session} totals={totals} pendingOrders={orders.filter((o) => o.status === "pending").length} onClose={(ok) => { setCloseDialog(false); if (ok) qc.invalidateQueries({ queryKey: ["cashSession", restaurantId] }); }} />}
      {withdrawDialog && session && <WithdrawalDialog sessionId={session.id} onClose={(ok) => { setWithdrawDialog(false); if (ok) { qc.invalidateQueries({ queryKey: ["cashMovements", session.id] }); } }} />}
      {supplyDialog && session && <SupplyDialog sessionId={session.id} onClose={(ok) => { setSupplyDialog(false); if (ok) { qc.invalidateQueries({ queryKey: ["cashMovements", session.id] }); } }} />}
    </div>
  );
}

/* ---------- Cards / UI helpers ---------- */

function StatCard({ icon: Icon, label, value, tone = "primary" }: { icon: any; label: string; value: string; tone?: "primary"|"success"|"danger"|"warning"|"info"|"muted" }) {
  const toneClass: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-amber-500/10 text-amber-600",
    info: "bg-sky-500/10 text-sky-600",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center ${toneClass[tone]}`}><Icon className="w-5 h-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="font-bold text-lg truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, positive, negative, strong }: { label: string; value: string; positive?: boolean; negative?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${strong ? "bg-accent" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${positive ? "text-emerald-600" : ""} ${negative ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

/* ---------- Session card ---------- */

function SessionCard({ session, totals, ordersPending }: { session: any; totals: ReturnType<typeof computeTotals>; ordersPending: number }) {
  if (!session) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Nenhum caixa aberto. Clique em <b>Abrir caixa</b> para iniciar.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Caixa em operação</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Row label="Aberto em" value={new Date(session.opened_at).toLocaleString("pt-BR")} />
          <Row label="Valor inicial" value={brl(session.opening_amount)} />
          <Row label="Entradas dinheiro" value={brl(totals.cashFromOrders)} positive />
          <Row label="Saídas (sangria+troco)" value={brl(totals.changeOut + totals.withdrawals)} negative />
        </div>
        {ordersPending > 0 && (
          <div className="flex items-center gap-2 text-sm rounded-md border border-amber-400 bg-amber-500/10 text-amber-700 p-3">
            <AlertTriangle className="w-4 h-4" /> Existem {ordersPending} pedido(s) pendente(s). Considere finalizar antes de fechar o caixa.
          </div>
        )}
        {session.opening_notes && (
          <div className="text-sm"><span className="text-muted-foreground">Observações de abertura:</span> {session.opening_notes}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Movements table ---------- */

function MovementsTable({ orders, movements }: { orders: OrderLike[]; movements: CashMovement[] }) {
  const [platform, setPlatform] = useState<string>("all");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const filtered = orders.filter((o) => {
    if (platform !== "all" && detectPlatform(o) !== platform) return false;
    if (method !== "all" && normalizeMethod(o.payment_method) !== method) return false;
    if (status !== "all" && o.status !== status) return false;
    return true;
  });
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Movimentações de pedidos</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas plataformas</SelectItem>
                <SelectItem value="pdv">PDV</SelectItem>
                <SelectItem value="delivery">Delivery próprio</SelectItem>
                <SelectItem value="ifood">iFood</SelectItem>
                <SelectItem value="quero">Quero</SelectItem>
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Pagamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos pagamentos</SelectItem>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="preparing">Em preparo</SelectItem>
                <SelectItem value="delivered">Entregues</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>#</TableHead>
              <TableHead>Plataforma</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Entrega</TableHead>
              <TableHead className="text-right">Cupom</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                <TableCell className="font-mono">{o.order_number ?? "-"}</TableCell>
                <TableCell><Badge variant="outline">{detectPlatform(o)}</Badge></TableCell>
                <TableCell>{METHOD_LABEL[normalizeMethod(o.payment_method)] ?? o.payment_method}</TableCell>
                <TableCell className="text-right font-medium">{brl(o.total)}</TableCell>
                <TableCell className="text-right">{brl(o.delivery_fee)}</TableCell>
                <TableCell className="text-right">{o.coupon_code ?? "-"}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum pedido no período</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: any; label: string }> = {
    pending: { v: "destructive", label: "Pendente" },
    accepted: { v: "default", label: "Aceito" },
    preparing: { v: "default", label: "Em preparo" },
    out_for_delivery: { v: "default", label: "Em entrega" },
    awaiting_pickup: { v: "default", label: "Aguardando retirada" },
    delivered: { v: "secondary", label: "Entregue" },
    cancelled: { v: "outline", label: "Cancelado" },
  };
  const item = map[status] ?? { v: "outline", label: status };
  return <Badge variant={item.v}>{item.label}</Badge>;
}

/* ---------- Withdrawals ---------- */

function WithdrawalsList({ sessionId, restaurantId, canOperate, onAdd }: { sessionId?: string; restaurantId: string; canOperate: boolean; onAdd: () => void }) {
  const { data } = useQuery({
    queryKey: ["cashWithdrawals", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_withdrawals")
        .select("id,amount,reason,created_at,created_by")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Sangrias</CardTitle>
        {canOperate && <Button size="sm" onClick={onAdd}><Plus className="w-4 h-4 mr-1" /> Nova sangria</Button>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Motivo</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data ?? []).map((w: any) => (
              <TableRow key={w.id}>
                <TableCell>{new Date(w.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell>{w.reason ?? "-"}</TableCell>
                <TableCell className="text-right text-destructive font-medium">- {brl(w.amount)}</TableCell>
              </TableRow>
            ))}
            {(!data || data.length === 0) && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sem sangrias.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Charts ---------- */

function ChartsBoard({ orders, totals }: { orders: OrderLike[]; totals: ReturnType<typeof computeTotals> }) {
  const methodData = Object.entries(totals.byMethod).map(([k, v]) => ({ name: METHOD_LABEL[k] ?? k, value: Number(v.toFixed(2)) }));
  const byHourMap: Record<string, number> = {};
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const h = new Date(o.created_at).getHours();
    const k = `${String(h).padStart(2, "0")}h`;
    byHourMap[k] = (byHourMap[k] ?? 0) + Number(o.total);
  }
  const hourData = Object.entries(byHourMap).sort(([a], [b]) => a.localeCompare(b)).map(([hour, total]) => ({ hour, total: Number(total.toFixed(2)) }));
  const platformData = [
    { name: "PDV/Delivery", total: (totals.byPlatform.pdv ?? 0) + (totals.byPlatform.delivery ?? 0) },
    { name: "iFood", total: totals.byPlatform.ifood ?? 0 },
    { name: "Quero", total: totals.byPlatform.quero ?? 0 },
  ];
  const grossNet = [{ name: "Bruto", value: totals.gross }, { name: "Líquido", value: totals.net }];
  const COLORS = ["hsl(var(--primary))", "hsl(var(--accent-foreground))", "#10b981", "#f59e0b", "#3b82f6", "#ef4444"];
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Vendas por forma de pagamento</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={methodData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {methodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Vendas por hora</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" /><YAxis />
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Bar dataKey="total" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">iFood vs Quero vs PDV</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={platformData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis />
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Bar dataKey="total" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Bruto x Líquido</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={grossNet}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis />
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformsCompareCard({ orders }: { orders: OrderLike[] }) {
  const data = orders.reduce(
    (acc, o) => {
      if (o.status === "cancelled") return acc;
      const p = detectPlatform(o);
      acc[p].count += 1;
      acc[p].total += Number(o.total);
      return acc;
    },
    { pdv: { count: 0, total: 0 }, delivery: { count: 0, total: 0 }, ifood: { count: 0, total: 0 }, quero: { count: 0, total: 0 } } as Record<string, { count: number; total: number }>,
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Plataformas no dia</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">{k}</div>
            <div className="font-bold text-lg">{brl(v.total)}</div>
            <div className="text-xs text-muted-foreground">{v.count} pedidos</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------- Audit log ---------- */

function AuditLogPanel({ restaurantId }: { restaurantId: string }) {
  const { data } = useQuery({
    queryKey: ["operatorLogs", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operator_logs")
        .select("id,action,entity,actor_id,details,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Auditoria</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Ação</TableHead><TableHead>Entidade</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data ?? []).map((l: any) => (
              <TableRow key={l.id}>
                <TableCell>{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{l.entity}</TableCell>
                <TableCell className="font-mono text-xs">{JSON.stringify(l.details)}</TableCell>
              </TableRow>
            ))}
            {(!data || data.length === 0) && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sem registros.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Dialogs ---------- */

function OpenSessionDialog({ restaurantId, onClose }: { restaurantId: string; onClose: (ok: boolean) => void }) {
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    const { error } = await supabase.rpc("cash_session_open" as any, {
      _restaurant_id: restaurantId,
      _opening_amount: Number(amount) || 0,
      _notes: notes || null,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Caixa aberto");
    onClose(true);
  };
  return (
    <Dialog open onOpenChange={() => onClose(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Abrir caixa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor inicial (R$)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>Abrir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseSessionDialog({ session, totals, pendingOrders, onClose }: { session: any; totals: ReturnType<typeof computeTotals>; pendingOrders: number; onClose: (ok: boolean) => void }) {
  const [bills, setBills] = useState("0");
  const [coins, setCoins] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const counted = Number(bills || 0) + Number(coins || 0);
  const diff = counted - totals.expectedCash;
  const submit = async () => {
    setLoading(true);
    const { error } = await supabase.rpc("cash_session_close" as any, {
      _session_id: session.id,
      _counted_cash: counted,
      _bills: Number(bills) || 0,
      _coins: Number(coins) || 0,
      _notes: notes || null,
      _expected: totals.expectedCash,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Caixa fechado");
    onClose(true);
    setTimeout(() => window.print(), 200);
  };
  return (
    <Dialog open onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Fechar caixa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {pendingOrders > 0 && (
            <div className="flex items-center gap-2 text-sm rounded-md border border-amber-400 bg-amber-500/10 text-amber-700 p-3">
              <AlertTriangle className="w-4 h-4" /> Há {pendingOrders} pedido(s) pendente(s).
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cédulas (R$)</Label><Input type="number" step="0.01" value={bills} onChange={(e) => setBills(e.target.value)} /></div>
            <div><Label>Moedas (R$)</Label><Input type="number" step="0.01" value={coins} onChange={(e) => setCoins(e.target.value)} /></div>
          </div>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Esperado em caixa</span><b>{brl(totals.expectedCash)}</b></div>
            <div className="flex justify-between"><span>Contado</span><b>{brl(counted)}</b></div>
            <div className={`flex justify-between ${Math.abs(diff) > 0.5 ? "text-destructive" : "text-emerald-600"}`}>
              <span>Diferença</span><b>{brl(diff)}</b>
            </div>
          </div>
          <div><Label>Observações finais</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={submit} disabled={loading}><Printer className="w-4 h-4 mr-1" /> Fechar e imprimir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawalDialog({ sessionId, onClose }: { sessionId: string; onClose: (ok: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!Number(amount)) { toast.error("Informe um valor"); return; }
    setLoading(true);
    const { error } = await supabase.rpc("cash_add_withdrawal" as any, { _session_id: sessionId, _amount: Number(amount), _reason: reason || null });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Sangria registrada");
    onClose(true);
  };
  return (
    <Dialog open onOpenChange={() => onClose(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova sangria</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Retirada para banco" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplyDialog({ sessionId, onClose }: { sessionId: string; onClose: (ok: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!Number(amount)) { toast.error("Informe um valor"); return; }
    setLoading(true);
    const { error } = await supabase.rpc("cash_add_supply" as any, { _session_id: sessionId, _amount: Number(amount), _description: desc || null });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Suprimento adicionado");
    onClose(true);
  };
  return (
    <Dialog open onOpenChange={() => onClose(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Suprimento de caixa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Troco de gerente" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
