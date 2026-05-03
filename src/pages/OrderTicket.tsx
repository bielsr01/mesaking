import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { brl, formatPhone, orderTypeLabel, paymentLabel } from "@/lib/format";
import { DEFAULT_PRINT_SETTINGS, PrintSettings, normalizePrintSettings } from "@/components/dashboard/PrintSettings";

interface OrderRow {
  id: string;
  order_number: number;
  order_type: "delivery" | "pickup";
  customer_name: string;
  customer_phone: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  address_notes: string | null;
  payment_method: string;
  change_for: number | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  restaurant_id: string;
}

interface ItemRow {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

interface RestaurantRow {
  name: string;
  logo_url: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  print_settings: PrintSettings | null;
}

export default function OrderTicket() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [restaurant, setRestaurant] = useState<RestaurantRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!orderId) return;
      const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!o) { setLoading(false); return; }
      setOrder(o as OrderRow);
      const [{ data: its }, { data: r }] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase
          .from("restaurants")
          .select("name,logo_url,address_street,address_number,address_neighborhood,address_city,address_state,address_cep,print_settings")
          .eq("id", (o as OrderRow).restaurant_id)
          .maybeSingle(),
      ]);
      setItems((its ?? []) as ItemRow[]);
      setRestaurant(r as unknown as RestaurantRow);
      setLoading(false);
    })();
  }, [orderId]);

  useEffect(() => {
    if (!loading && order) {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [loading, order]);

  if (loading) return <div className="p-6 text-sm">Carregando ticket…</div>;
  if (!order) return <div className="p-6 text-sm">Pedido não encontrado.</div>;

  const ps: PrintSettings = normalizePrintSettings(restaurant?.print_settings as any, DEFAULT_PRINT_SETTINGS);
  const fullBizAddress = [
    [restaurant?.address_street, restaurant?.address_number].filter(Boolean).join(", "),
    restaurant?.address_neighborhood,
    [restaurant?.address_city, restaurant?.address_state].filter(Boolean).join(" - "),
    restaurant?.address_cep,
  ].filter(Boolean).join(" • ");

  const fullCustAddress = [
    [order.address_street, order.address_number].filter(Boolean).join(", "),
    order.address_complement,
    order.address_neighborhood,
    [order.address_city, order.address_state].filter(Boolean).join(" - "),
    order.address_cep,
  ].filter(Boolean).join(" • ");

  const created = new Date(order.created_at);
  const dateStr = `${created.toLocaleDateString("pt-BR")} - ${created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 4mm; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
        }
        .ticket {
          width: 72mm;
          margin: 0 auto;
          padding: 8px;
          font-family: 'Courier New', monospace;
          color: #000;
          font-size: 12px;
          line-height: 1.35;
        }
        .ticket h1 { font-size: 14px; font-weight: 700; margin: 0; text-align: center; }
        .ticket .muted { color: #333; }
        .ticket .center { text-align: center; }
        .ticket .row { display: flex; justify-content: space-between; gap: 8px; }
        .ticket .sep { border-top: 1px dashed #000; margin: 6px 0; }
        .ticket .item-name { font-weight: 700; }
        .ticket .total { font-size: 14px; font-weight: 700; }
        .ticket .logo { max-width: 50mm; max-height: 25mm; display: block; margin: 0 auto 6px; object-fit: contain; }
      `}</style>

      <div className="no-print" style={{ padding: 12, textAlign: "center", background: "#f5f5f5" }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 16px", border: "1px solid #333", borderRadius: 6, cursor: "pointer", background: "#fff" }}
        >
          🖨️ Imprimir novamente
        </button>
      </div>

      <div className="ticket">
        {ps.logo && restaurant?.logo_url && (
          <img src={restaurant.logo_url} alt="" className="logo" />
        )}

        {ps.business_name && restaurant?.name && (
          <h1>{restaurant.name}</h1>
        )}
        {ps.business_address && fullBizAddress && (
          <div className="center muted" style={{ marginTop: 4 }}>{fullBizAddress}</div>
        )}

        {ps.order_type_date && (
          <>
            <div className="sep" />
            <div className="center">{dateStr}</div>
            <div className="center" style={{ fontWeight: 700, marginTop: 2 }}>
              {orderTypeLabel[order.order_type]} #{order.order_number}
            </div>
          </>
        )}

        {(ps.customer_name || ps.customer_phone || ps.customer_address) && <div className="sep" />}
        {ps.customer_name && <div><strong>{order.customer_name}</strong></div>}
        {ps.customer_phone && <div>{formatPhone(order.customer_phone)}</div>}
        {ps.customer_address && order.order_type === "delivery" && fullCustAddress && (
          <div style={{ marginTop: 2 }}>{fullCustAddress}{order.address_notes ? ` (${order.address_notes})` : ""}</div>
        )}

        {ps.products && (
          <>
            <div className="sep" />
            {items.map((it) => (
              <div key={it.id} style={{ marginBottom: 4 }}>
                <div className="row">
                  <span className="item-name">{it.quantity}× {it.product_name}</span>
                  {ps.prices && <span>{brl(it.unit_price * it.quantity)}</span>}
                </div>
                {it.notes && <div className="muted" style={{ fontSize: 11 }}>obs: {it.notes}</div>}
              </div>
            ))}
          </>
        )}
        {ps.prices && (
          <>
            <div className="sep" />
            <div className="row"><span>Subtotal</span><span>{brl(order.subtotal)}</span></div>
            {order.order_type === "delivery" && (
              <div className="row"><span>Taxa de entrega</span><span>{brl(order.delivery_fee)}</span></div>
            )}
            <div className="row total" style={{ marginTop: 4 }}>
              <span>TOTAL</span><span>{brl(order.total)}</span>
            </div>
          </>
        )}
        {ps.payment_method && (
          <div className="muted" style={{ marginTop: 4 }}>
            Pagamento: {paymentLabel[order.payment_method]}
            {order.change_for ? ` (troco p/ ${brl(order.change_for)})` : ""}
          </div>
        )}

        <div className="sep" />
        <div className="center muted" style={{ fontSize: 10 }}>
          Esse documento não tem valor fiscal.
        </div>
      </div>
    </>
  );
}
