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
import { MessageCircle, Save, History, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const DEFAULT_POPUP_TEXT = "Obrigado pelo seu pedido! Que tal mandar um oi pra gente no WhatsApp? 💚";
const DEFAULT_POPUP_MSG = "Olá! Acabei de fazer o pedido #{{pedido}} no valor de {{total}}. Meu nome é {{nome}}.";

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

  const { data: popup } = useQuery({
    queryKey: ["evolution-popup", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("evolution_integrations")
        .select("id, popup_enabled, popup_text, popup_whatsapp_message")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const [drafts, setDrafts] = useState<Record<string, Template>>({});
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupText, setPopupText] = useState(DEFAULT_POPUP_TEXT);
  const [popupMsg, setPopupMsg] = useState(DEFAULT_POPUP_MSG);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    setPopupEnabled(!!popup?.popup_enabled);
    setPopupText(popup?.popup_text ?? DEFAULT_POPUP_TEXT);
    setPopupMsg(popup?.popup_whatsapp_message ?? DEFAULT_POPUP_MSG);
  }, [popup]);

  const update = (key: string, patch: Partial<Template>) =>
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const saveAll = async () => {
    setSaving(true);
    try {
      // Save all templates
      const payloads = EVENTS.map((ev) => {
        const row = drafts[ev.key];
        return {
          restaurant_id: restaurantId,
          event_key: ev.key,
          enabled: !!row?.enabled,
          template: row?.template ?? ev.defaultTemplate,
          delay_minutes: Math.max(0, Number(row?.delay_minutes) || 0),
        };
      });
      const { error: tplErr } = await sb
        .from("evolution_message_templates")
        .upsert(payloads, { onConflict: "restaurant_id,event_key" });
      if (tplErr) throw tplErr;

      // Save popup (only if integration row exists)
      if (popup?.id) {
        const { error: popErr } = await sb.from("evolution_integrations")
          .update({ popup_enabled: popupEnabled, popup_text: popupText, popup_whatsapp_message: popupMsg })
          .eq("id", popup.id);
        if (popErr) throw popErr;
      } else if (popupEnabled) {
        toast.warning("Configure a integração WhatsApp antes de ativar o popup.");
      }

      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["evolution-templates", restaurantId] });
      qc.invalidateQueries({ queryKey: ["evolution-popup", restaurantId] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const [historyOpen, setHistoryOpen] = useState(false);

  const eventTitle = (k: string) => EVENTS.find((e) => e.key === k)?.title ?? k;

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <MessageCircle className="w-5 h-5 text-green-600" />
        <h3 className="text-base sm:text-lg font-semibold">Mensagens automáticas (WhatsApp)</h3>
        <Button variant="outline" size="sm" className="sm:ml-auto w-full sm:w-auto" onClick={() => setHistoryOpen(true)}>
          <History className="w-4 h-4 mr-1" /> Registro de disparos
        </Button>
      </div>
      <DispatchHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        restaurantId={restaurantId}
        eventTitle={eventTitle}
      />
      <p className="text-sm text-muted-foreground">
        Configure mensagens automáticas enviadas ao cliente em cada etapa do pedido. Variáveis disponíveis:{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{{nome}}"}</code>{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{{pedido}}"}</code>{" "}
        <code className="text-xs bg-muted px-1 rounded">{"{{total}}"}</code>
      </p>

      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Popup pós-pedido (cardápio)</div>
            <div className="text-xs text-muted-foreground">
              Ao finalizar o pedido, exibe um popup convidando o cliente a abrir o WhatsApp da loja com mensagem pronta.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Ativo</Label>
            <Switch checked={popupEnabled} onCheckedChange={setPopupEnabled} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Texto do popup</Label>
          <Textarea
            rows={2}
            value={popupText}
            onChange={(e) => setPopupText(e.target.value)}
            disabled={!popupEnabled}
            placeholder="Mensagem mostrada na tela do cliente"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Mensagem pré-preenchida no WhatsApp</Label>
          <Textarea
            rows={3}
            value={popupMsg}
            onChange={(e) => setPopupMsg(e.target.value)}
            disabled={!popupEnabled}
            placeholder="Texto que abrirá no WhatsApp ao clicar no botão"
          />
          <p className="text-[11px] text-muted-foreground">
            Variáveis: <code className="bg-background px-1 rounded">{"{{nome}}"}</code>{" "}
            <code className="bg-background px-1 rounded">{"{{pedido}}"}</code>{" "}
            <code className="bg-background px-1 rounded">{"{{total}}"}</code>. O número usado é o telefone cadastrado da loja.
          </p>
        </div>
      </div>

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
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-background/95 backdrop-blur border-t flex justify-end">
        <Button onClick={saveAll} disabled={saving} className="bg-green-600 hover:bg-green-700">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Salvar todas as configurações
        </Button>
      </div>
    </Card>
  );
}

function statusBadge(s: string) {
  if (s === "sent") return <Badge className="bg-green-600 hover:bg-green-600">Enviado</Badge>;
  if (s === "failed") return <Badge variant="destructive">Falhou</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

function DispatchHistoryDialog({
  open, onOpenChange, restaurantId, eventTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  eventTitle: (k: string) => string;
}) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["evolution-queue", restaurantId],
    queryFn: async () => {
      const { data } = await sb
        .from("evolution_message_queue")
        .select("id,event_key,phone,message,status,attempts,error,scheduled_at,sent_at,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Registro de disparos
          </DialogTitle>
          <DialogDescription>Últimas 200 mensagens enfileiradas para envio via WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => refetch()}>Atualizar</Button>
        </div>
        <div className="overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agendado</TableHead>
                <TableHead>Enviado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum disparo registrado.</TableCell></TableRow>
              )}
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{eventTitle(r.event_key)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell className="text-xs max-w-[280px]">
                    <div className="truncate" title={r.message}>{r.message}</div>
                    {r.error && <div className="text-destructive text-[11px] mt-1 truncate" title={r.error}>Erro: {r.error}</div>}
                  </TableCell>
                  <TableCell>
                    {statusBadge(r.status)}
                    {r.attempts > 0 && <div className="text-[11px] text-muted-foreground mt-1">Tent.: {r.attempts}</div>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("pt-BR") : "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
