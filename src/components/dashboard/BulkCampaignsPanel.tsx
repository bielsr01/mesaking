// Shared bulk-campaigns panel.
// - In dashboard mode: scope="restaurant", restaurantId required.
// - In admin mode: scope="admin", with multi-restaurant filter.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, Play, Pause, Plus, Search, Filter, X, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { unmaskPhone } from "@/lib/format";
import { RestaurantMultiSelect, useRestaurants } from "@/components/admin/RestaurantMultiSelect";
import { Select as RSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sb = supabase as any;

type ClientType = "elite" | "best" | "frequent" | "new" | "none";
type ClientStatus = "active" | "inactive" | "sleeping" | "risk";

const TYPE_LABELS: Record<ClientType, string> = {
  elite: "Comprador Elite (+8)", best: "Melhor Comprador (5–7)",
  frequent: "Comprador Frequente (3–4)", new: "Novo Cliente (1–2)", none: "Sem pedido",
};
const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Ativo (≤15 dias)", inactive: "Inativo (16–30 dias)",
  sleeping: "Dormindo (31–90 dias)", risk: "Em risco (+90 dias)",
};
function getClientType(o: number): ClientType { if (o >= 8) return "elite"; if (o >= 5) return "best"; if (o >= 3) return "frequent"; if (o >= 1) return "new"; return "none"; }
function getClientStatus(t: string | null): ClientStatus | null {
  if (!t) return null; const d = (Date.now() - new Date(t).getTime()) / 86400000;
  if (d <= 15) return "active"; if (d <= 30) return "inactive"; if (d <= 90) return "sleeping"; return "risk";
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  running: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", running: "Em execução", paused: "Pausada", completed: "Concluída", failed: "Falhou",
};

export function BulkCampaignsPanel({
  scope, restaurantId,
}: { scope: "restaurant" | "admin"; restaurantId?: string }) {
  const qc = useQueryClient();
  const restaurantsQ = useRestaurants();
  const allRest = restaurantsQ.data ?? [];
  const [adminFilter, setAdminFilter] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const filterIds = scope === "admin" ? adminFilter : [restaurantId!];
  const filterKey = filterIds.slice().sort().join(",");

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["bulk-campaigns", scope, filterKey],
    enabled: scope === "restaurant" ? !!restaurantId : adminFilter.length > 0,
    refetchInterval: 5000,
    queryFn: async () => {
      let q = sb.from("bulk_campaigns").select("*").order("created_at", { ascending: false }).limit(200);
      if (scope === "restaurant") q = q.eq("restaurant_id", restaurantId);
      else q = q.in("restaurant_id", adminFilter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const restNameById = useMemo(() => { const m = new Map<string,string>(); allRest.forEach(r=>m.set(r.id,r.name)); return m; }, [allRest]);

  const setStatus = async (id: string, status: "running" | "paused") => {
    const patch: any = { status };
    if (status === "running") patch.started_at = new Date().toISOString();
    const { error } = await sb.from("bulk_campaigns").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    if (status === "running") {
      // kick worker immediately (don't wait)
      supabase.functions.invoke("bulk-campaign-worker", { body: {} }).catch(() => {});
      toast.success("Campanha iniciada");
    } else toast.success("Campanha pausada");
    qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
  };

  const remove = async (id: string) => {
    const { error } = await sb.from("bulk_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
  };

  return (
    <div className="space-y-4">
      {scope === "admin" && (
        <Card><CardContent className="p-4">
          <RestaurantMultiSelect all={allRest} selected={adminFilter} onChange={setAdminFilter} />
        </CardContent></Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5" /> Campanhas</CardTitle>
            <CardDescription>Crie campanhas, selecione contatos e envie via Evolution API.</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={scope === "admin" && adminFilter.length === 0}>
            <Plus className="w-4 h-4 mr-1" /> Nova campanha
          </Button>
        </CardHeader>
        <CardContent>
          {scope === "admin" && adminFilter.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Selecione ao menos um restaurante.</div>
          ) : isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (campaigns ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma campanha ainda.</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead>
                  {scope === "admin" && <TableHead>Restaurante</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead className="text-center">Falhas</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(campaigns ?? []).map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      {scope === "admin" && <TableCell><Badge variant="outline">{restNameById.get(c.restaurant_id) ?? "—"}</Badge></TableCell>}
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                        {c.status === "running" && c.paused_until && new Date(c.paused_until).getTime() > Date.now() && (
                          <div className="text-[10px] text-yellow-700 dark:text-yellow-300 mt-0.5">
                            Pausa auto até {new Date(c.paused_until).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{c.sent}</TableCell>
                      <TableCell className="text-center">{c.failed}</TableCell>
                      <TableCell className="text-center">{c.total}</TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(c.status === "draft" || c.status === "paused") && (
                            <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "running")}>
                              <Play className="w-3.5 h-3.5 mr-1" /> Play
                            </Button>
                          )}
                          {c.status === "running" && (
                            <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "paused")}>
                              <Pause className="w-3.5 h-3.5 mr-1" /> Pausar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(c.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateCampaignDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          scope={scope}
          restaurantIds={scope === "admin" ? adminFilter : [restaurantId!]}
          allRest={allRest}
          onCreated={() => qc.invalidateQueries({ queryKey: ["bulk-campaigns"] })}
        />
      )}
    </div>
  );
}

function CreateCampaignDialog({
  open, onOpenChange, scope, restaurantIds, allRest, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  scope: "restaurant" | "admin"; restaurantIds: string[];
  allRest: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [interval, setInterval] = useState(8);
  const [pauseAfter, setPauseAfter] = useState(0);
  const [pauseMinutes, setPauseMinutes] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<ClientType>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<ClientStatus>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // For admin: required restaurant target (one campaign = one restaurant)
  const [targetRestaurant, setTargetRestaurant] = useState<string>(scope === "restaurant" ? restaurantIds[0] : "");
  const [saving, setSaving] = useState(false);

  const idsKey = restaurantIds.slice().sort().join(",");
  const { data: customers, isLoading } = useQuery({
    queryKey: ["bulk-pick-customers", idsKey],
    enabled: open && restaurantIds.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("customers")
        .select("id, restaurant_id, name, phone, orders_count, last_order_at")
        .in("restaurant_id", restaurantIds)
        .order("created_at", { ascending: false }).limit(2000);
      return data ?? [];
    },
  });

  const restNameById = useMemo(() => { const m = new Map<string,string>(); allRest.forEach(r=>m.set(r.id,r.name)); return m; }, [allRest]);

  const filtered = (customers ?? []).filter((c: any) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(c.name?.toLowerCase().includes(q) || unmaskPhone(c.phone || "").includes(unmaskPhone(search)))) return false;
    }
    if (typeFilters.size > 0 && !typeFilters.has(getClientType(c.orders_count))) return false;
    if (statusFilters.size > 0) { const s = getClientStatus(c.last_order_at); if (!s || !statusFilters.has(s)) return false; }
    return true;
  });

  const togglePick = (id: string) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const pickAllVisible = () => { const n = new Set(picked); filtered.forEach((c: any) => n.add(c.id)); setPicked(n); };
  const clearAll = () => setPicked(new Set());
  const toggleType = (t: ClientType) => { const n = new Set(typeFilters); n.has(t) ? n.delete(t) : n.add(t); setTypeFilters(n); };
  const toggleStatus = (s: ClientStatus) => { const n = new Set(statusFilters); n.has(s) ? n.delete(s) : n.add(s); setStatusFilters(n); };

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Informe o nome");
    if (!text.trim()) return toast.error("Escreva a mensagem");
    if (picked.size === 0) return toast.error("Selecione ao menos 1 contato");
    if (scope === "admin" && !targetRestaurant) return toast.error("Selecione o restaurante para a campanha");

    const chosen = (customers ?? []).filter((c: any) => picked.has(c.id));
    setSaving(true);
    try {
      const { data: camp, error } = await sb.from("bulk_campaigns").insert({
        restaurant_id: scope === "admin" ? targetRestaurant : restaurantIds[0],
        is_admin: false,
        name, message_text: text, media_url: mediaUrl || null,
        interval_seconds: interval,
        pause_after_messages: pauseAfter,
        pause_duration_minutes: pauseMinutes,
        total: chosen.length, status: "draft",
      }).select("id").single();
      if (error) throw error;

      const rows = chosen.map((c: any) => ({
        campaign_id: camp.id, customer_id: c.id, name: c.name, phone: c.phone,
      }));
      // chunk insert
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error: e2 } = await sb.from("bulk_campaign_recipients").insert(slice);
        if (e2) throw e2;
      }
      toast.success("Campanha criada");
      onCreated();
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || "Erro"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>Selecione contatos e escreva a mensagem. Use {"{nome}"} para personalizar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Nome da campanha</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Promoção de quarta" />
            </div>
            {scope === "admin" && (
              <div className="space-y-2 col-span-2">
                <Label>Restaurante (envio será feito pela instância dele)</Label>
                <RSelect value={targetRestaurant} onValueChange={setTargetRestaurant}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {restaurantIds.map((id) => (
                      <SelectItem key={id} value={id}>{restNameById.get(id) ?? id}</SelectItem>
                    ))}
                  </SelectContent>
                </RSelect>
              </div>
            )}
            <div className="space-y-2 col-span-2">
              <Label>Mensagem</Label>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá {nome}, temos uma oferta especial..." />
            </div>
            <div className="space-y-2">
              <Label>URL da imagem (opcional)</Label>
              <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Intervalo entre envios (segundos)</Label>
              <Input type="number" min={1} value={interval} onChange={(e) => setInterval(Number(e.target.value) || 8)} />
            </div>
            <div className="space-y-2">
              <Label>Pausar a cada N mensagens (0 = desligado)</Label>
              <Input type="number" min={0} value={pauseAfter} onChange={(e) => setPauseAfter(Math.max(0, Number(e.target.value) || 0))} placeholder="Ex: 100" />
            </div>
            <div className="space-y-2">
              <Label>Duração da pausa (minutos)</Label>
              <Input type="number" min={0} value={pauseMinutes} onChange={(e) => setPauseMinutes(Math.max(0, Number(e.target.value) || 0))} placeholder="Ex: 60" />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Contatos ({picked.size} selecionados)</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={pickAllVisible}>Selecionar visíveis</Button>
                <Button size="sm" variant="outline" onClick={clearAll}>Limpar</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-1" /> Filtros
                    {(typeFilters.size + statusFilters.size) > 0 && <Badge variant="secondary" className="ml-2">{typeFilters.size + statusFilters.size}</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tipo</div>
                      {(Object.keys(TYPE_LABELS) as ClientType[]).map(t => (
                        <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={typeFilters.has(t)} onCheckedChange={() => toggleType(t)} />
                          {TYPE_LABELS[t]}
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Status</div>
                      {(Object.keys(STATUS_LABELS) as ClientStatus[]).map(s => (
                        <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={statusFilters.has(s)} onCheckedChange={() => toggleStatus(s)} />
                          {STATUS_LABELS[s]}
                        </label>
                      ))}
                    </div>
                    {(typeFilters.size + statusFilters.size > 0) && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setTypeFilters(new Set()); setStatusFilters(new Set()); }}>
                        <X className="w-4 h-4 mr-1" /> Limpar filtros
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="border rounded-lg max-h-72 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
              ) : (
                <Table>
                  <TableBody>
                    {filtered.map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => togglePick(c.id)}>
                        <TableCell className="w-10"><Checkbox checked={picked.has(c.id)} onCheckedChange={() => togglePick(c.id)} /></TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        {scope === "admin" && <TableCell><Badge variant="outline">{restNameById.get(c.restaurant_id) ?? "—"}</Badge></TableCell>}
                        <TableCell className="text-xs text-muted-foreground">{c.orders_count} ped.</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>{saving ? "Criando..." : "Criar campanha"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
