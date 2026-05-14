import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl, orderStatusLabel, getNextStatus, paymentLabel, formatPhone } from "@/lib/format";
import { MapPin, Navigation, Phone, MessageCircle, Printer, Trash2, X, User, Clock, CornerDownRight } from "lucide-react";

interface OrderLike {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_cep: string;
  address_notes: string | null;
  payment_method: string;
  change_for: number | null;
  subtotal: number;
  delivery_fee: number;
  discount?: number | null;
  service_fee?: number | null;
  total: number;
  status: string;
  order_type: string;
  created_at: string;
  updated_at?: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  external_source?: string | null;
}

interface ItemLike {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

interface OptionRow {
  id: string;
  order_item_id: string;
  group_name: string | null;
  item_name: string | null;
  extra_price: number;
}

function waLink(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) {
    // ok
  } else if (n.length === 10 || n.length === 11) {
    n = "55" + n;
  } else if (n.length < 10) {
    return null;
  }
  return `https://wa.me/${n}`;
}

const STATUS_FLOW: Record<string, string[]> = {
  delivery: ["pending", "preparing", "out_for_delivery", "delivered"],
  pickup: ["pending", "preparing", "awaiting_pickup", "delivered"],
  pdv: ["preparing", "delivered"],
};

function statusTimeline(o: OrderLike) {
  const flow = STATUS_FLOW[o.order_type] ?? STATUS_FLOW.delivery;
  const cancelled = o.status === "cancelled";
  const idx = flow.indexOf(o.status);
  return flow.map((s, i) => ({
    status: s,
    label: orderStatusLabel[s] ?? s,
    done: !cancelled && idx >= 0 && i <= idx,
    current: !cancelled && s === o.status,
  })).concat(cancelled ? [{ status: "cancelled", label: "Cancelado", done: true, current: true }] : []);
}

interface Props {
  order: OrderLike | null;
  items: ItemLike[];
  onClose: () => void;
  onAdvance: (o: OrderLike) => void;
  onCancel: (o: OrderLike) => void;
  onDelete: (o: OrderLike) => void;
  onPrint: (o: OrderLike) => void;
  pending?: boolean;
  canChangeStatus: boolean;
  canEditOrders: boolean;
}

export function OrderDetailsDialog({
  order, items, onClose, onAdvance, onCancel, onDelete, onPrint,
  pending, canChangeStatus, canEditOrders,
}: Props) {
  const { data: options = [] } = useQuery({
    queryKey: ["order-item-options", order?.id],
    enabled: !!order && items.length > 0,
    queryFn: async () => {
      const ids = items.map((i) => i.id);
      const { data } = await supabase
        .from("order_item_options")
        .select("id,order_item_id,group_name,item_name,extra_price")
        .in("order_item_id", ids);
      return (data ?? []) as OptionRow[];
    },
  });

  if (!order) return null;
  const next = getNextStatus(order.status, order.order_type as any);
  const isPdv = order.order_type === "pdv";
  const isPickup = order.order_type === "pickup";
  const hasCoords = order.delivery_latitude != null && order.delivery_longitude != null;
  const fullAddress = [
    `${order.address_street ?? ""}${order.address_number ? `, ${order.address_number}` : ""}`,
    order.address_complement ? order.address_complement : null,
    order.address_neighborhood ? `${order.address_neighborhood}` : null,
    order.address_city ? `${order.address_city}${order.address_state ? ` - ${order.address_state}` : ""}` : null,
    order.address_cep || null,
  ].filter(Boolean).join(", ");
  const addressMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
  const coordsMapUrl = hasCoords
    ? `https://www.google.com/maps?q=${order.delivery_latitude},${order.delivery_longitude}`
    : null;
  const timeline = statusTimeline(order);

  const optsByItem: Record<string, OptionRow[]> = {};
  options.forEach((o) => { (optsByItem[o.order_item_id] ||= []).push(o); });

  const handleAdvance = () => { onAdvance(order); onClose(); };
  const handleCancel = () => { onCancel(order); onClose(); };
  const handleDelete = () => { onDelete(order); onClose(); };
  const handlePrint = () => { onPrint(order); };

  const wa = waLink(order.customer_phone);

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes Completos do Pedido #{order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <section className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold flex items-center gap-2">
                <User className="w-4 h-4" /> {order.customer_name}
                <Badge variant="outline" className="font-mono">#{order.order_number}</Badge>
              </div>
              <Badge className={
                order.status === "delivered" ? "bg-success text-success-foreground" :
                order.status === "cancelled" ? "bg-destructive text-destructive-foreground" :
                order.status === "pending" ? "bg-warning text-warning-foreground" :
                "bg-primary text-primary-foreground"
              }>{orderStatusLabel[order.status] ?? order.status}</Badge>
            </div>

            <div className="text-xs uppercase tracking-wide text-muted-foreground mt-2">Dados de contato</div>
            <div className="text-sm flex items-center flex-wrap gap-3">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                {new Date(order.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                {formatPhone(order.customer_phone)}
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer"
                    className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-success text-success-foreground">
                    <MessageCircle className="w-3 h-3" />
                  </a>
                )}
              </span>
            </div>

            {!isPdv && !isPickup && (
              <>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mt-2">Endereço de entrega</div>
                <div className="text-sm flex gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    {order.address_street}, {order.address_number}
                    {order.address_complement && ` - ${order.address_complement}`}<br />
                    <span className="text-muted-foreground">
                      {order.address_neighborhood}{order.address_city ? ` • ${order.address_city}` : ""}
                      {order.address_state ? ` - ${order.address_state}` : ""}
                    </span>
                    {order.address_cep && <div className="text-xs text-muted-foreground">CEP {order.address_cep}</div>}
                    {order.address_notes && <div className="text-xs italic text-muted-foreground mt-0.5">"{order.address_notes}"</div>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="outline">
                    <a href={addressMapUrl} target="_blank" rel="noreferrer" className="gap-1">
                      <MapPin className="w-4 h-4" /> Abrir no mapa
                    </a>
                  </Button>
                  {coordsMapUrl && (
                    <Button asChild size="sm" variant="outline">
                      <a href={coordsMapUrl} target="_blank" rel="noreferrer" className="gap-1">
                        <Navigation className="w-4 h-4" /> Abrir coordenadas
                      </a>
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Itens + pagamento */}
          <div className="grid md:grid-cols-2 gap-3">
            <section className="rounded-lg border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Itens do pedido (comanda)</div>
              <div className="space-y-3 text-sm">
                {items.map((it) => {
                  const opts = optsByItem[it.id] ?? [];
                  const extrasPerUnit = opts.reduce((s, o) => s + Number(o.extra_price ?? 0), 0);
                  const baseUnit = Number(it.unit_price) - extrasPerUnit;
                  const baseTotal = baseUnit * it.quantity;
                  return (
                    <div key={it.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{it.quantity}× {it.product_name}</span>
                        <span className="tabular-nums">{brl(baseTotal)}</span>
                      </div>
                      {it.notes && <div className="text-xs italic text-muted-foreground">{it.notes}</div>}
                      {opts.map((opt) => (
                        <div key={opt.id} className="flex justify-between gap-2 text-xs pl-3">
                          <span>
                            <span className="font-semibold">{opt.group_name ?? "Opção"}:</span>{" "}
                            <span>{opt.item_name}</span>
                          </span>
                          {Number(opt.extra_price) > 0 && (
                            <span className="tabular-nums text-muted-foreground">+ {brl(Number(opt.extra_price) * it.quantity)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-xs text-muted-foreground">Sem itens.</div>}
              </div>
            </section>

            <section className="rounded-lg border p-3 space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Resumo do pagamento</div>
              <div className="flex justify-between">
                <span>Forma de pagamento:</span>
                <span className="font-bold">{paymentLabel[order.payment_method] ?? order.payment_method}</span>
              </div>
              <div className="flex justify-between"><span>Subtotal:</span><span className="tabular-nums">{brl(order.subtotal)}</span></div>
              {Number(order.delivery_fee) > 0 && (
                <div className="flex justify-between"><span>Taxa de entrega:</span><span className="tabular-nums">{brl(Number(order.delivery_fee))}</span></div>
              )}
              {Number(order.service_fee ?? 0) > 0 && (
                <div className="flex justify-between"><span>Taxa de serviço:</span><span className="tabular-nums">{brl(Number(order.service_fee))}</span></div>
              )}
              {Number(order.discount ?? 0) > 0 && (
                <div className="flex justify-between"><span>Descontos:</span><span className="tabular-nums">- {brl(Number(order.discount))}</span></div>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between items-center">
                <span className="font-semibold">Valor:</span>
                <span className="text-lg font-bold tabular-nums">{brl(order.total)}</span>
              </div>
              {order.payment_method === "cash" && Number(order.change_for ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground pt-1">
                  Troco para {brl(Number(order.change_for))}{" "}
                  <span>(Entregar {brl(Math.max(0, Number(order.change_for) - Number(order.total)))} para o cliente)</span>
                </div>
              )}
            </section>
          </div>

          {/* Histórico de status */}
          <section className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Histórico de atualização</div>
            <ol className="space-y-1.5 text-sm">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    t.status === "cancelled" ? "bg-destructive" :
                    t.done ? (t.current ? "bg-success" : "bg-primary") : "bg-muted-foreground/30"
                  }`} />
                  <span className={t.done ? "" : "text-muted-foreground"}>{t.label}</span>
                  {t.current && order.updated_at && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(order.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {/* Ações */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handlePrint} title="Imprimir ticket">
              <Printer className="w-4 h-4" />
            </Button>
            {!["delivered", "cancelled"].includes(order.status) && canChangeStatus && next && !(order.external_source === "ifood" && next === "delivered") && (
              <Button size="sm" className="flex-1 min-w-[180px]" onClick={handleAdvance} disabled={pending}>
                {pending ? "Enviando…" : order.status === "pending" ? "✓ Aceitar pedido" : `→ ${orderStatusLabel[next]}`}
              </Button>
            )}
            {!["delivered", "cancelled"].includes(order.status) && canChangeStatus && (
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={pending} className="gap-1">
                <X className="w-4 h-4" /> Cancelar
              </Button>
            )}
            {canEditOrders && (
              <Button size="sm" variant="outline" onClick={handleDelete}
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground gap-1">
                <Trash2 className="w-4 h-4" /> Excluir
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
