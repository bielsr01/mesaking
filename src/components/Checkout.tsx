import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { setActiveOrder } from "@/components/ActiveOrderBanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { brl } from "@/lib/format";
import { toast } from "sonner";

const schema = z.object({
  customer_name: z.string().trim().min(2, "Informe seu nome").max(80),
  customer_phone: z.string().trim().min(8, "Telefone inválido").max(20),
  address_cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  address_street: z.string().trim().min(2).max(120),
  address_number: z.string().trim().min(1).max(10),
  address_complement: z.string().trim().max(80).optional(),
  address_neighborhood: z.string().trim().min(2).max(80),
  address_city: z.string().trim().min(2).max(80),
  address_state: z.string().trim().length(2),
  address_notes: z.string().trim().max(200).optional(),
  payment_method: z.enum(["cash", "pix", "card_on_delivery"]),
  change_for: z.string().optional(),
});

export function Checkout({ open, onOpenChange, restaurantId }: { open: boolean; onOpenChange: (o: boolean) => void; restaurantId: string }) {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [cep, setCep] = useState("");
  const [addr, setAddr] = useState({ street: "", neighborhood: "", city: "", state: "" });
  const [payment, setPayment] = useState<"cash" | "pix" | "card_on_delivery">("cash");

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) return toast.error("CEP não encontrado");
      setAddr({ street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "" });
    } catch { toast.error("Falha ao buscar CEP"); }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (cart.items.length === 0) return toast.error("Carrinho vazio");

    setBusy(true);
    const subtotal = cart.total;
    const total = subtotal;

    const { data: order, error } = await supabase.from("orders").insert({
      restaurant_id: restaurantId,
      customer_name: parsed.data.customer_name,
      customer_phone: parsed.data.customer_phone,
      address_cep: parsed.data.address_cep,
      address_street: parsed.data.address_street,
      address_number: parsed.data.address_number,
      address_complement: parsed.data.address_complement || null,
      address_neighborhood: parsed.data.address_neighborhood,
      address_city: parsed.data.address_city,
      address_state: parsed.data.address_state,
      address_notes: parsed.data.address_notes || null,
      payment_method: parsed.data.payment_method,
      change_for: parsed.data.payment_method === "cash" && parsed.data.change_for ? Number(parsed.data.change_for) : null,
      subtotal, total,
    }).select("id, public_token").single();

    if (error || !order) { setBusy(false); return toast.error(error?.message || "Erro"); }

    const items = cart.items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      product_name: i.name,
      unit_price: i.price,
      quantity: i.quantity,
      notes: i.notes || null,
    }));
    const { error: ie } = await supabase.from("order_items").insert(items);
    if (ie) { setBusy(false); return toast.error(ie.message); }

    cart.clear();
    setBusy(false);
    onOpenChange(false);
    setActiveOrder(restaurantId, order.public_token);
    toast.success("Pedido enviado! Acompanhe o status no topo da tela.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Finalizar pedido</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2"><Label>Nome</Label><Input name="customer_name" required /></div>
            <div className="space-y-2 col-span-2"><Label>Telefone</Label><Input name="customer_phone" placeholder="(11) 99999-0000" required /></div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <h3 className="font-semibold text-sm">Endereço de entrega</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2 col-span-1">
                <Label>CEP</Label>
                <Input name="address_cep" value={cep} onChange={(e) => { setCep(e.target.value); }} onBlur={(e) => lookupCep(e.target.value)} placeholder="00000-000" required />
              </div>
              <div className="space-y-2 col-span-2"><Label>Rua</Label><Input name="address_street" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Número</Label><Input name="address_number" required /></div>
              <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input name="address_complement" placeholder="Apto, bloco..." /></div>
              <div className="space-y-2 col-span-2"><Label>Bairro</Label><Input name="address_neighborhood" value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} required /></div>
              <div className="space-y-2 col-span-2"><Label>Cidade</Label><Input name="address_city" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} required /></div>
              <div className="space-y-2"><Label>UF</Label><Input name="address_state" maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} required /></div>
            </div>
            <div className="space-y-2"><Label>Observação do endereço</Label><Textarea name="address_notes" rows={2} placeholder="Ponto de referência, instruções..." /></div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <h3 className="font-semibold text-sm">Pagamento</h3>
            <RadioGroup name="payment_method" value={payment} onValueChange={(v) => setPayment(v as any)} className="space-y-2">
              {[
                { v: "cash", l: "Dinheiro" },
                { v: "pix", l: "Pix" },
                { v: "card_on_delivery", l: "Cartão na entrega" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted">
                  <RadioGroupItem value={o.v} />
                  <span>{o.l}</span>
                </label>
              ))}
            </RadioGroup>
            {payment === "cash" && (
              <div className="space-y-2"><Label>Troco para (opcional)</Label><Input name="change_for" type="number" step="0.01" placeholder="Ex: 50.00" /></div>
            )}
          </div>

          <div className="border-t pt-3 flex justify-between font-bold text-lg"><span>Total</span><span>{brl(cart.total)}</span></div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? "Enviando..." : "Confirmar pedido"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
