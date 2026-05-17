import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { brl, formatPhone, formatIfoodPhone, orderTypeLabel, paymentLabel } from "@/lib/format";
import {
  DEFAULT_PRINT_SETTINGS,
  PrintSettings,
  normalizePrintSettings,
} from "@/components/dashboard/PrintSettings";

export default function CustomerTicketPublic() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!orderId) return;
      const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!o) { setLoading(false); return; }
      setOrder(o);
      const [{ data: its }, { data: r }] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase
          .from("restaurants")
          .select("name,logo_url,address_street,address_number,address_neighborhood,address_city,address_state,address_cep,print_settings")
          .eq("id", (o as any).restaurant_id)
          .maybeSingle(),
      ]);
      setItems(its ?? []);
      setRestaurant(r);
      setLoading(false);
    })();
  }, [orderId]);

  useEffect(() => {
    if (!loading && order) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, order]);

  if (loading) return <div className="p-6 text-sm">Carregando ticket…</div>;
  if (!order) return <div className="p-6 text-sm">Pedido não encontrado.</div>;

  const ps: PrintSettings = normalizePrintSettings(
    (restaurant as any)?.print_settings,
    DEFAULT_PRINT_SETTINGS,
  );

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
          .ticket, .ticket * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000 !important; }
        }
        .ticket { width: 72mm; margin: 0 auto; padding: 8px; font-family: 'Arial',sans-serif; color: #000; font-size: 14px; line-height: 1.45; font-weight: 500; }
        .ticket h1 { font-size: 17px; font-weight: 900; margin: 0; text-align: center; }
        .ticket .muted { color: #000; font-weight: 500; }
        .ticket .center { text-align: center; }
        .ticket .row { display: flex; justify-content: space-between; gap: 8px; }
        .ticket .sep { border-top: 1px solid #000; margin: 6px 0; }
        .ticket .item-name { font-weight: 800; }
        .ticket .total { font-size: 16px; font-weight: 900; }
        .ticket .logo { max-width: 50mm; max-height: 25mm; display: block; margin: 0 auto 6px; object-fit: contain; filter: contrast(1.4) brightness(0.85); }
      `}</style>

      <div className="no-print" style={{ padding: 12, textAlign: "center", background: "#f5f5f5" }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 16px", border: "1px solid #333", borderRadius: 6, cursor: "pointer", background: "#fff" }}
        >
          🖨️ Imprimir ticket do cliente
        </button>
      </div>

      <div className="ticket">
        {ps.logo && restaurant?.logo_url && (
          <img src={restaurant.logo_url} alt="" className="logo" />
        )}
        {ps.business_name && restaurant?.name && <h1>{restaurant.name}</h1>}
        {ps.business_address && fullBizAddress && (
          <div className="center muted" style={{ marginTop: 4 }}>{fullBizAddress}</div>
        )}

        {ps.order_type_date && (
          <>
            <div className="sep" />
            <div className="center">{dateStr}</div>
            <div className="center" style={{ fontWeight: 800, marginTop: 2 }}>
              {orderTypeLabel[order.order_type as "delivery" | "pickup"]} #{order.order_number}
            </div>
          </>
        )}

        {(ps.customer_name || ps.customer_phone || ps.customer_address) && <div className="sep" />}
        {ps.customer_name && <div><strong>{order.customer_name}</strong></div>}
        {ps.customer_phone && (
          <div>{order.external_source === "ifood" ? formatIfoodPhone(order.customer_phone) : formatPhone(order.customer_phone)}</div>
        )}
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

        {ps.extra_message_enabled && (ps.extra_message ?? "").trim() && (
          <>
            <div className="sep" />
            <div className="center" style={{ whiteSpace: "pre-wrap" }}>{ps.extra_message}</div>
          </>
        )}

        <div className="sep" />
        <div className="center muted" style={{ fontSize: 10 }}>
          Esse documento não tem valor fiscal.
        </div>
      </div>
    </>
  );
}
