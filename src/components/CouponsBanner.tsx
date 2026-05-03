import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ticket } from "lucide-react";
import { brl } from "@/lib/format";

type Coupon = {
  id: string;
  code: string;
  name: string;
  discount_type: "percent" | "value";
  discount_value: number;
  min_order_value: number;
  ends_at: string | null;
  service_delivery: boolean;
  service_pickup: boolean;
  apply_to: "order" | "items";
};

export function CouponsBanner({ restaurantId }: { restaurantId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    const now = new Date().toISOString();
    (async () => {
      const { data } = await supabase
        .from("coupons" as any)
        .select("id,code,name,discount_type,discount_value,min_order_value,ends_at,service_delivery,service_pickup,apply_to,starts_at,show_on_menu,is_active")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .eq("show_on_menu", true);
      const filtered = ((data ?? []) as any[]).filter((c) => {
        if (c.starts_at && c.starts_at > now) return false;
        if (c.ends_at && c.ends_at < now) return false;
        return true;
      });
      setCoupons(filtered as Coupon[]);
    })();
  }, [restaurantId]);

  if (coupons.length === 0) return null;

  return (
    <div className="container pt-2">
      <Card className="flex items-center justify-between gap-3 p-3 border-2 border-dashed border-primary/40 bg-primary/5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Ticket className="w-4 h-4 text-primary" /> Descontos disponíveis
          <Badge variant="secondary" className="ml-1">{coupons.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>Ver</Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-primary" /> Descontos disponíveis
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {coupons.map((c) => {
              const value = c.discount_type === "percent" ? `${Number(c.discount_value)}% OFF` : `${brl(c.discount_value)} OFF`;
              const services: string[] = [];
              if (c.service_delivery) services.push("Delivery");
              if (c.service_pickup) services.push("Retirada");
              return (
                <Card key={c.id} className="border-2 border-dashed border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-extrabold text-primary leading-none">{value}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{c.code}</Badge>
                  </div>
                  <div className="text-sm font-medium mt-1">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                    {Number(c.min_order_value) > 0 && <div>Pedido mínimo {brl(c.min_order_value)}</div>}
                    {c.apply_to === "items" && <div>Válido para itens selecionados</div>}
                    {services.length > 0 && <div>{services.join(" · ")}</div>}
                    {c.ends_at && <div>Até {new Date(c.ends_at).toLocaleDateString()}</div>}
                  </div>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
