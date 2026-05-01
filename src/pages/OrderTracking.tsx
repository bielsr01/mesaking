import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, orderStatusLabel, paymentLabel, orderTypeLabel } from "@/lib/format";
import { Check, ChefHat, Clock, MapPin, Truck, Package, X, Bike, Store } from "lucide-react";

const STEPS_DELIVERY = [
  { key: "pending", label: "Recebido", icon: Clock },
  { key: "accepted", label: "Aceito", icon: Check },
  { key: "preparing", label: "Em preparo", icon: Package },
  { key: "out_for_delivery", label: "Saiu para entrega", icon: Truck },
  { key: "delivered", label: "Entregue", icon: ChefHat },
];

const STEPS_PICKUP = [
  { key: "pending", label: "Recebido", icon: Clock },
  { key: "accepted", label: "Aceito", icon: Check },
  { key: "preparing", label: "Em preparo", icon: Package },
  { key: "awaiting_pickup", label: "Pronto p/ retirada", icon: Store },
  { key: "delivered", label: "Retirado", icon: ChefHat },
];

export default function OrderTracking() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [restaurant, setRestaurant] = useState<any | null>(null);

  const load = async () => {
    const { data: o } = await supabase.from("orders").select("*").eq("public_token", token!).maybeSingle();
    if (!o) return setOrder(null);
    setOrder(o);
    const [{ data: its }, { data: r }] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", o.id),
      supabase.from("restaurants").select("name,slug,logo_url,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,address_cep,phone").eq("id", o.restaurant_id).maybeSingle(),
    ]);
    setItems(its ?? []);
    setRestaurant(r);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`order-${token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if ((payload.new as any)?.public_token === token || (payload.old as any)?.public_token === token) load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [token]);

  if (order === null) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando pedido...</div>;
  if (!order) return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="max-w-md text-center"><CardContent className="py-8 space-y-2">
        <p className="font-semibold">Pedido não encontrado</p>
        <p className="text-sm text-muted-foreground">Verifique o link recebido.</p>
      </CardContent></Card>
    </div>
  );

  const cancelled = order.status === "cancelled";
  const isPickup = order.order_type === "pickup";
  const STEPS = isPickup ? STEPS_PICKUP : STEPS_DELIVERY;
  const currentIdx = STEPS.findIndex((s) => s.key === order.status);

  const storeAddress = restaurant ? [
    restaurant.address_street && `${restaurant.address_street}${restaurant.address_number ? `, ${restaurant.address_number}` : ""}`,
    restaurant.address_complement,
    restaurant.address_neighborhood,
    restaurant.address_city && restaurant.address_state ? `${restaurant.address_city}/${restaurant.address_state}` : restaurant.address_city,
    restaurant.address_cep,
  ].filter(Boolean).join(" • ") : "";

  return (
    <div className="min-h-screen bg-muted/30 pb-12">
      <header className="bg-gradient-warm text-primary-foreground py-6">
        <div className="container">
          <Link to={restaurant ? `/r/${restaurant.slug}` : "/"} className="text-sm opacity-90 hover:opacity-100">← {restaurant?.name ?? "Voltar"}</Link>
          <h1 className="text-2xl font-bold mt-2">Acompanhe seu pedido</h1>
          {order.order_number && (
            <div className="mt-1 text-sm opacity-90">Pedido <span className="font-mono font-bold">#{order.order_number}</span></div>
          )}
        </div>
      </header>

      <main className="container py-6 max-w-2xl space-y-4">
        {/* Tipo do pedido — destaque no topo */}
        <Card className={isPickup ? "border-accent/40" : "border-primary/40"}>
          <CardContent className="py-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full grid place-items-center ${isPickup ? "bg-accent/20 text-accent-foreground" : "bg-primary/10 text-primary"}`}>
              {isPickup ? <Store className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Modalidade</div>
              <div className="font-semibold">{orderTypeLabel[order.order_type] ?? "Delivery"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {cancelled ? (
              <div className="text-center py-6">
                <X className="w-12 h-12 mx-auto text-destructive mb-2" />
                <div className="font-semibold text-lg">Pedido cancelado</div>
                <p className="text-sm text-muted-foreground">Entre em contato com o restaurante para mais informações.</p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {STEPS.map((s, idx) => {
                  const done = idx <= currentIdx;
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="text-center">
                      <div className={`mx-auto w-10 h-10 rounded-full grid place-items-center mb-1 transition-colors ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className={`text-xs ${done ? "font-medium" : "text-muted-foreground"}`}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-center mt-4">
              <Badge className={cancelled ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}>
                {orderStatusLabel[order.status]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold">Itens</h3>
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span>{i.quantity}× {i.product_name}{i.notes && <em className="text-xs text-muted-foreground"> ({i.notes})</em>}</span>
                <span>{brl(Number(i.unit_price) * i.quantity)}</span>
              </div>
            ))}
            <div className="border-t pt-3 flex justify-between font-bold"><span>Total</span><span>{brl(order.total)}</span></div>
            <div className="text-xs text-muted-foreground">{paymentLabel[order.payment_method]}{order.change_for ? ` • troco p/ ${brl(order.change_for)}` : ""}</div>
          </CardContent>
        </Card>

        {isPickup ? (
          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><Store className="w-4 h-4" />Endereço para retirada</h3>
              {storeAddress ? (
                <p className="text-sm">{storeAddress}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Endereço da loja não informado.</p>
              )}
              {restaurant?.phone && <p className="text-xs text-muted-foreground">Contato: {restaurant.phone}</p>}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4" />Endereço de entrega</h3>
              <p className="text-sm">{order.address_street}, {order.address_number}{order.address_complement && ` - ${order.address_complement}`}</p>
              <p className="text-sm text-muted-foreground">{order.address_neighborhood} • {order.address_city}/{order.address_state} • {order.address_cep}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
