import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Eye, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, formatPhone, formatIfoodPhone, orderStatusLabel } from "@/lib/format";
import { OrderDetailsDialog } from "./OrderDetailsDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

type Channel = "all" | "delivery" | "pdv" | "ifood" | "quero";
type DateRange = "7d" | "30d" | "month" | "custom";

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: string;
  order_type: string;
  external_source: string | null;
  created_at: string;
  updated_at: string;
  [k: string]: any;
}

interface Item {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Novos" },
  { value: "preparing", label: "Em preparo" },
  { value: "out_for_delivery", label: "Em entrega" },
  { value: "awaiting_pickup", label: "Aguardando retirada" },
  { value: "delivered", label: "Entregues" },
  { value: "cancelled", label: "Cancelados" },
];

function rangeFor(kind: DateRange, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  if (kind === "7d") {
    const from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (kind === "30d") {
    const from = new Date(now); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (kind === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from, to };
  }
  return {
    from: customFrom ?? new Date(now.getFullYear(), now.getMonth(), 1),
    to: customTo ?? to,
  };
}

export function OrderHistoryDialog({
  open, onOpenChange, restaurantId,
}: { open: boolean; onOpenChange: (v: boolean) => void; restaurantId: string }) {
  const [channel, setChannel] = useState<Channel>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateKind, setDateKind] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [detailsTarget, setDetailsTarget] = useState<Order | null>(null);
  const { can } = usePermissions(restaurantId);
  const canViewFeeBreakdown = can("finance.view_fee_breakdown");

  const range = useMemo(() => rangeFor(dateKind, customFrom, customTo), [dateKind, customFrom, customTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["order-history", restaurantId, range.from.toISOString(), range.to.toISOString()],
    enabled: open,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);
      const list = (orders ?? []) as Order[];
      const ids = list.map((o) => o.id);
      const itemsByOrder: Record<string, Item[]> = {};
      if (ids.length) {
        const { data: its } = await supabase.from("order_items").select("*").in("order_id", ids);
        (its ?? []).forEach((it: any) => { (itemsByOrder[it.order_id] ||= []).push(it); });
      }
      return { orders: list, items: itemsByOrder };
    },
  });

  const orders = data?.orders ?? [];
  const items = data?.items ?? {};

  const channelOrders = orders.filter((o) => {
    if (channel === "all") return true;
    if (channel === "pdv") return o.order_type === "pdv";
    if (channel === "ifood") return o.external_source === "ifood";
    if (channel === "quero") return o.external_source === "quero";
    return o.order_type !== "pdv" && o.external_source !== "ifood" && o.external_source !== "quero";
  });

  const filtered = channelOrders.filter((o) => {
    if (status !== "all" && o.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !String(o.order_number).includes(q) &&
        !(o.customer_name ?? "").toLowerCase().includes(q) &&
        !(o.customer_phone ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const statusColor = (s: string) => {
    if (s === "pending") return "bg-warning text-warning-foreground";
    if (s === "delivered") return "bg-success text-success-foreground";
    if (s === "cancelled") return "bg-destructive text-destructive-foreground";
    return "bg-primary text-primary-foreground";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de pedidos</DialogTitle>
            <DialogDescription>Todos os pedidos do período selecionado.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="pdv">PDV</TabsTrigger>
                <TabsTrigger value="delivery">Delivery / Retirada</TabsTrigger>
                <TabsTrigger value="ifood">iFood</TabsTrigger>
                <TabsTrigger value="quero">Quero Delivery</TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs value={status} onValueChange={setStatus}>
              <TabsList className="flex-wrap h-auto">
                {STATUS_FILTERS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={dateKind} onValueChange={(v) => setDateKind(v as DateRange)}>
                <TabsList>
                  <TabsTrigger value="7d">Últimos 7 dias</TabsTrigger>
                  <TabsTrigger value="30d">Últimos 30 dias</TabsTrigger>
                  <TabsTrigger value="month">Este mês</TabsTrigger>
                  <TabsTrigger value="custom">Personalizado</TabsTrigger>
                </TabsList>
              </Tabs>

              {dateKind === "custom" && (
                <div className="flex gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("gap-2", !customFrom && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4" />
                        {customFrom ? format(customFrom, "dd/MM/yyyy") : "Data início"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("gap-2", !customTo && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4" />
                        {customTo ? format(customTo, "dd/MM/yyyy") : "Data fim"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div className="relative ml-auto">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nº, cliente, telefone…"
                  className="pl-8 h-9 w-64"
                />
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[90px_130px_1fr_120px_110px_110px_50px] gap-2 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground">
                <div>Pedido</div>
                <div>Data</div>
                <div>Cliente</div>
                <div>Origem</div>
                <div>Status</div>
                <div className="text-right">Valor</div>
                <div></div>
              </div>
              {isLoading ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Nenhum pedido encontrado.</div>
              ) : (
                <div className="divide-y">
                  {filtered.map((o) => {
                    const origem = o.external_source === "ifood" ? "iFood"
                      : o.external_source === "quero" ? "Quero Delivery"
                      : o.order_type === "pdv" ? "PDV"
                      : o.order_type === "pickup" ? "Retirada"
                      : "Delivery";
                    const phoneFmt = o.external_source === "ifood" ? formatIfoodPhone(o.customer_phone) : formatPhone(o.customer_phone);
                    return (
                    <div key={o.id} className="grid grid-cols-[90px_130px_1fr_120px_110px_110px_50px] gap-2 px-3 py-2 items-center text-sm hover:bg-accent/30">
                      <div className="font-mono">#{o.order_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")}<br />
                        {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{o.customer_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{phoneFmt}</div>
                      </div>
                      <div>
                        <Badge variant="outline" className="text-xs">{origem}</Badge>
                      </div>
                      <div>
                        <Badge className={statusColor(o.status)}>{orderStatusLabel[o.status as keyof typeof orderStatusLabel]}</Badge>
                      </div>
                      <div className="text-right font-semibold">{brl(Number(o.total))}</div>
                      <div className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setDetailsTarget(o)} title="Ver detalhes">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-right">
              {filtered.length} pedido(s) • {brl(filtered.reduce((s, o) => s + Number(o.total), 0))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OrderDetailsDialog
        order={detailsTarget as any}
        items={detailsTarget ? (items[detailsTarget.id] ?? []) as any : []}
        onClose={() => setDetailsTarget(null)}
        onAdvance={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
        onPrint={() => {}}
        pending={false}
        canChangeStatus={false}
        canEditOrders={false}
      />
    </>
  );
}
