import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { brl, formatPhone, statusLabelFor } from "@/lib/format";
import { Plus, Check, Trash2, Award, RefreshCw, Pencil, History, Search, BarChart3 } from "lucide-react";
import { LoyaltyRewardsTab } from "./LoyaltyRewardsTab";
import { LoyaltyMetricsDialog } from "./LoyaltyMetricsDialog";

const sb = supabase as any;

type Settings = { restaurant_id: string; enabled: boolean; points_per_real: number };
type Member = { id: string; name: string; phone: string; points: number; created_at: string };
type Tx = {
  id: string;
  member_id: string;
  order_id: string | null;
  points: number;
  status: "pending" | "credited";
  created_at: string;
  credited_at?: string | null;
  loyalty_members?: { name: string; phone: string };
  orders?: { order_number: number; status: string; total: number; created_at: string };
};

export function LoyaltyPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [metricsOpen, setMetricsOpen] = useState(false);

  // ---- Settings ----
  const settingsQ = useQuery({
    queryKey: ["loyalty-settings", restaurantId],
    queryFn: async (): Promise<Settings> => {
      const { data } = await sb.from("loyalty_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
      return data ?? { restaurant_id: restaurantId, enabled: false, points_per_real: 1 };
    },
  });
  const [enabled, setEnabled] = useState(false);
  const [pointsPerReal, setPointsPerReal] = useState("1");
  useEffect(() => {
    if (settingsQ.data) {
      setEnabled(!!settingsQ.data.enabled);
      setPointsPerReal(String(settingsQ.data.points_per_real ?? 1));
    }
  }, [settingsQ.data]);

  const saveSettings = async () => {
    const payload = {
      restaurant_id: restaurantId,
      enabled,
      points_per_real: Number(pointsPerReal) || 0,
    };
    const { error } = await sb.from("loyalty_settings").upsert(payload, { onConflict: "restaurant_id" });
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["loyalty-settings", restaurantId] });
  };

  // ---- Members ----
  const membersQ = useQuery({
    queryKey: ["loyalty-members", restaurantId],
    queryFn: async (): Promise<Member[]> => {
      const { data } = await sb
        .from("loyalty_members")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [memberDialog, setMemberDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPoints, setNewPoints] = useState("0");
  const [search, setSearch] = useState("");
  const [historyMember, setHistoryMember] = useState<Member | null>(null);

  const openCreate = () => {
    setEditingMember(null);
    setNewName(""); setNewPhone(""); setNewPoints("0");
    setMemberDialog(true);
  };
  const openEdit = (m: Member) => {
    setEditingMember(m);
    setNewName(m.name); setNewPhone(m.phone); setNewPoints(String(m.points));
    setMemberDialog(true);
  };

  const saveMember = async () => {
    if (!newName.trim() || !newPhone.trim()) return toast.error("Preencha nome e telefone");
    const points = Math.floor(Number(newPoints) || 0);
    if (editingMember) {
      const { error } = await sb.from("loyalty_members")
        .update({ name: newName.trim(), phone: formatPhone(newPhone), points })
        .eq("id", editingMember.id);
      if (error) return toast.error(error.message);
      toast.success("Cadastro atualizado");
    } else {
      const { error } = await sb.from("loyalty_members").insert({
        restaurant_id: restaurantId,
        name: newName.trim(),
        phone: formatPhone(newPhone),
        points,
      });
      if (error) return toast.error(error.message);
      toast.success("Cliente cadastrado");
    }
    setMemberDialog(false);
    qc.invalidateQueries({ queryKey: ["loyalty-members", restaurantId] });
  };

  const deleteMember = async (id: string) => {
    if (!confirm("Excluir este cadastro? Todas as transações também serão removidas.")) return;
    const { error } = await sb.from("loyalty_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["loyalty-members", restaurantId] });
    qc.invalidateQueries({ queryKey: ["loyalty-tx", restaurantId] });
  };

  // ---- Pending transactions ----
  const txQ = useQuery({
    queryKey: ["loyalty-tx", restaurantId],
    queryFn: async (): Promise<Tx[]> => {
      const { data } = await sb
        .from("loyalty_transactions")
        .select("*, loyalty_members(name, phone)")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const txs = (data ?? []) as Tx[];
      // fetch related orders
      const orderIds = txs.map((t) => t.order_id).filter(Boolean) as string[];
      if (orderIds.length) {
        const { data: orders } = await sb
          .from("orders")
          .select("id, order_number, status, total, created_at, order_type")
          .in("id", orderIds);
        const map = new Map<string, any>((orders ?? []).map((o: any) => [o.id, o]));
        txs.forEach((t) => { if (t.order_id) t.orders = map.get(t.order_id) as any; });
      }
      return txs;
    },
  });

  const creditTx = async (id: string) => {
    const { error } = await sb.rpc("credit_loyalty_points", { _tx_id: id });
    if (error) return toast.error(error.message);
    toast.success("Pontos creditados");
    qc.invalidateQueries({ queryKey: ["loyalty-tx", restaurantId] });
    qc.invalidateQueries({ queryKey: ["loyalty-members", restaurantId] });
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Apagar este registro?")) return;
    const { error } = await sb.from("loyalty_transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["loyalty-tx", restaurantId] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2"><Award className="w-5 h-5" />Programa de fidelidade</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMetricsOpen(true)}>
            <BarChart3 className="w-4 h-4 mr-1" />Métricas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["loyalty-settings", restaurantId] });
              qc.invalidateQueries({ queryKey: ["loyalty-members", restaurantId] });
              qc.invalidateQueries({ queryKey: ["loyalty-tx", restaurantId] });
              toast.success("Atualizado");
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1" />Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
            <TabsTrigger value="members">Cadastro</TabsTrigger>
            <TabsTrigger value="credit">Creditar Pontos</TabsTrigger>
            <TabsTrigger value="rewards">Resgatar Pontos</TabsTrigger>
          </TabsList>

          <TabsContent value="rewards">
            <LoyaltyRewardsTab restaurantId={restaurantId} />
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="space-y-4 pt-4 max-w-md">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <div className="font-medium">Ativar programa</div>
                <p className="text-xs text-muted-foreground">Quando ativo, clientes podem optar por pontuar ao fazer pedido.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="space-y-2">
              <Label>Pontos por R$ 1,00</Label>
              <Input type="number" step="0.01" min="0" value={pointsPerReal} onChange={(e) => setPointsPerReal(e.target.value)} />
              <p className="text-xs text-muted-foreground">Padrão: 1 ponto por real gasto.</p>
            </div>
            <Button onClick={saveSettings}>Salvar</Button>
          </TabsContent>

          {/* Members */}
          <TabsContent value="members" className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div className="relative w-full sm:max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome ou telefone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">{membersQ.data?.length ?? 0} cadastrados</div>
                <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Novo cadastro</Button>
              </div>
            </div>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="text-right">Pontos disponíveis</TableHead>
                    <TableHead className="w-40 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const q = search.trim().toLowerCase();
                    const digits = q.replace(/\D/g, "");
                    const list = (membersQ.data ?? []).filter((m) => {
                      if (!q) return true;
                      const phoneDigits = (m.phone || "").replace(/\D/g, "");
                      return m.name.toLowerCase().includes(q) || (digits && phoneDigits.includes(digits));
                    });
                    if (list.length === 0) {
                      return (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
                      );
                    }
                    return list.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>{m.phone}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-bold">{m.points}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Histórico" onClick={() => setHistoryMember(m)}><History className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(m)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" title="Excluir" onClick={() => deleteMember(m.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Credit */}
          <TabsContent value="credit" className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground">Pedidos com pontos pendentes de crédito</div>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pontos</TableHead>
                    <TableHead className="text-right w-40">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(txQ.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono">#{t.orders?.order_number ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{t.loyalty_members?.name}</div>
                        <div className="text-xs text-muted-foreground">{t.loyalty_members?.phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.orders?.status === "delivered" || t.orders?.status === "completed" ? "default" : "secondary"}>
                          {t.orders?.status ? statusLabelFor(t.orders.status, (t.orders as any).order_type) : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{t.orders ? brl(Number(t.orders.total)) : "—"}</TableCell>
                      <TableCell className="text-right font-bold">{t.points}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => creditTx(t.id)}><Check className="w-4 h-4 mr-1" />Creditar</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteTx(t.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(txQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum registro pendente</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={memberDialog} onOpenChange={setMemberDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingMember ? "Editar cadastro" : "Novo cadastro"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div className="space-y-1"><Label>Telefone</Label><Input value={newPhone} onChange={(e) => setNewPhone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" /></div>
              <div className="space-y-1"><Label>Pontos</Label><Input type="number" min="0" step="1" value={newPoints} onChange={(e) => setNewPoints(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMemberDialog(false)}>Cancelar</Button>
              <Button onClick={saveMember}>{editingMember ? "Salvar" : "Cadastrar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MemberHistoryDialog
          member={historyMember}
          restaurantId={restaurantId}
          onClose={() => setHistoryMember(null)}
        />

        <LoyaltyMetricsDialog open={metricsOpen} onOpenChange={setMetricsOpen} restaurantId={restaurantId} />
      </CardContent>
    </Card>
  );
}

function MemberHistoryDialog({
  member, restaurantId, onClose,
}: { member: Member | null; restaurantId: string; onClose: () => void }) {
  const historyQ = useQuery({
    queryKey: ["loyalty-history", member?.id],
    enabled: !!member,
    queryFn: async (): Promise<Tx[]> => {
      const { data } = await sb
        .from("loyalty_transactions")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("member_id", member!.id)
        .order("created_at", { ascending: false });
      const txs = (data ?? []) as Tx[];
      const orderIds = txs.map((t) => t.order_id).filter(Boolean) as string[];
      if (orderIds.length) {
        const { data: orders } = await sb
          .from("orders")
          .select("id, order_number, status, total, created_at, order_type")
          .in("id", orderIds);
        const map = new Map<string, any>((orders ?? []).map((o: any) => [o.id, o]));
        txs.forEach((t) => { if (t.order_id) t.orders = map.get(t.order_id) as any; });
      }
      return txs;
    },
  });

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico — {member?.name}</DialogTitle>
        </DialogHeader>
        <div className="border rounded-lg max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(historyQ.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">
                    {t.status === "credited" && t.credited_at
                      ? new Date(t.credited_at).toLocaleString("pt-BR")
                      : new Date(t.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-mono">{t.orders?.order_number ? `#${t.orders.order_number}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === "credited" ? "default" : "secondary"}>
                      {t.status === "credited" ? "Creditado" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{t.points}</TableCell>
                </TableRow>
              ))}
              {(historyQ.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sem histórico</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

