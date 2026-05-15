import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Save } from "lucide-react";

const sb = supabase as any;

const EVENTS: { key: string; title: string; defaultTemplate: string }[] = [
  { key: "order_received", title: "Pedido recebido", defaultTemplate: "Olá {{nome}}! Recebemos seu pedido #{{pedido}} no valor de R$ {{total}}. Em breve confirmaremos. 🍽️" },
  { key: "order_accepted", title: "Pedido aceito", defaultTemplate: "Boas notícias, {{nome}}! Seu pedido #{{pedido}} foi aceito. ✅" },
  { key: "order_in_production", title: "Pedido em produção", defaultTemplate: "{{nome}}, seu pedido #{{pedido}} já está sendo preparado. 👨‍🍳" },
  { key: "order_out_for_delivery", title: "Pedido saiu para entrega", defaultTemplate: "{{nome}}, seu pedido #{{pedido}} saiu para entrega. 🛵" },
  { key: "order_awaiting_pickup", title: "Pedido aguardando retirada", defaultTemplate: "{{nome}}, seu pedido #{{pedido}} está pronto para retirada. 🛍️" },
  { key: "order_delivered_pickup", title: "Pedido entregue (retirada)", defaultTemplate: "{{nome}}, obrigado por retirar seu pedido #{{pedido}}! Volte sempre. 💚" },
  { key: "order_delivered_delivery", title: "Pedido entregue (delivery)", defaultTemplate: "{{nome}}, seu pedido #{{pedido}} foi entregue. Bom apetite! 😋" },
  { key: "order_delivered_pdv", title: "Pedido entregue (PDV/balcão)", defaultTemplate: "Obrigado pela compra, {{nome}}! Pedido #{{pedido}}." },
  { key: "order_delivered_quero", title: "Pedido entregue (Quero Delivery)", defaultTemplate: "{{nome}}, seu pedido #{{pedido}} foi entregue pelo Quero Delivery. Bom apetite! 😋" },
];

type Template = { id?: string; restaurant_id: string; event_key: string; enabled: boolean; template: string; delay_minutes: number };

export function EvolutionMessagesPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["evolution-templates", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("evolution_message_templates")
        .select("*").eq("restaurant_id", restaurantId);
      return (data ?? []) as Template[];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, Template>>({});

  useEffect(() => {
    const map: Record<string, Template> = {};
    for (const ev of EVENTS) {
      const existing = rows?.find((r) => r.event_key === ev.key);
      map[ev.key] = existing ?? {
        restaurant_id: restaurantId,
        event_key: ev.key,
        enabled: false,
        template: ev.defaultTemplate,
        delay_minutes: 0,
      };
    }
    setDrafts(map);
  }, [rows, restaurantId]);

  const update = (key: string, patch: Partial<Template>) =>
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const save = async (key: string) => {
    const row = drafts[key];
    if (!row) return;
    const payload = {
      restaurant_id: restaurantId,
      event_key: row.event_key,
      enabled: row.enabled,
      template: row.template,
      delay_minutes: Math.max(0, Number(row.delay_minutes) || 0),
    };
    const { error } = await sb
      .from("evolution_message_templates")
      .upsert(payload, { onConflict: "restaurant_id,event_key" });
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Mensagem salva");
    qc.invalidateQueries({ queryKey: ["evolution-templates", restaurantId] });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-green-600" />
        <h3 className="text-lg font-semibold">Mensagens automáticas (WhatsApp)</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure mensagens automáticas enviadas ao cliente em cada etapa do pedido. Variáveis disponíveis:{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{{nome}}"}</code>{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{{pedido}}"}</code>{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{{total}}"}</code>
      </p>

      <div className="space-y-3">
        {EVENTS.map((ev) => {
          const d = drafts[ev.key];
          if (!d) return null;
          return (
            <div key={ev.key} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{ev.title}</div>
                  <div className="text-xs text-muted-foreground">Evento: {ev.key}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Ativo</Label>
                  <Switch checked={d.enabled} onCheckedChange={(v) => update(ev.key, { enabled: v })} />
                </div>
              </div>
              <div>
                <Label className="text-sm">Mensagem</Label>
                <Textarea
                  rows={3}
                  value={d.template}
                  onChange={(e) => update(ev.key, { template: e.target.value })}
                  disabled={!d.enabled}
                />
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label className="text-sm">Atraso (minutos)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="w-32"
                    value={d.delay_minutes}
                    onChange={(e) => update(ev.key, { delay_minutes: Number(e.target.value) })}
                    disabled={!d.enabled}
                  />
                </div>
                <Button size="sm" onClick={() => save(ev.key)} className="ml-auto">
                  <Save className="w-4 h-4 mr-1" /> Salvar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
