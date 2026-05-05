import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Gift, Search } from "lucide-react";

const sb = supabase as any;

type Reward = {
  id: string;
  restaurant_id: string;
  product_id: string | null;
  name: string;
  points_cost: number;
  stock: number | null;
  is_active: boolean;
};

type Member = { id: string; name: string; phone: string; points: number };

export function LoyaltyRewardsTab({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();

  const productsQ = useQuery({
    queryKey: ["loyalty-products-list", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("products").select("id, name, price").eq("restaurant_id", restaurantId).eq("is_active", true).order("name");
      return (data ?? []) as { id: string; name: string; price: number }[];
    },
  });

  const rewardsQ = useQuery({
    queryKey: ["loyalty-rewards", restaurantId],
    queryFn: async (): Promise<Reward[]> => {
      const { data } = await sb.from("loyalty_rewards").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const membersQ = useQuery({
    queryKey: ["loyalty-members", restaurantId],
    queryFn: async (): Promise<Member[]> => {
      const { data } = await sb.from("loyalty_members").select("id, name, phone, points").eq("restaurant_id", restaurantId).order("name");
      return data ?? [];
    },
  });

  // Reward dialog
  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [productId, setProductId] = useState<string>("none");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("100");
  const [stock, setStock] = useState("");
  const [active, setActive] = useState(true);

  const openCreate = () => {
    setEditing(null);
    setProductId("none"); setName(""); setCost("100"); setStock(""); setActive(true);
    setDlg(true);
  };
  const openEdit = (r: Reward) => {
    setEditing(r);
    setProductId(r.product_id ?? "none");
    setName(r.name);
    setCost(String(r.points_cost));
    setStock(r.stock == null ? "" : String(r.stock));
    setActive(r.is_active);
    setDlg(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Informe o nome");
    const payload = {
      restaurant_id: restaurantId,
      product_id: productId === "none" ? null : productId,
      name: name.trim(),
      points_cost: Math.max(0, Math.floor(Number(cost) || 0)),
      stock: stock === "" ? null : Math.max(0, Math.floor(Number(stock) || 0)),
      is_active: active,
    };
    const { error } = editing
      ? await sb.from("loyalty_rewards").update(payload).eq("id", editing.id)
      : await sb.from("loyalty_rewards").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    setDlg(false);
    qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta recompensa?")) return;
    const { error } = await sb.from("loyalty_rewards").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
  };

  // Redeem dialog
  const [redeemDlg, setRedeemDlg] = useState(false);
  const [redeemReward, setRedeemReward] = useState<Reward | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const openRedeem = (r: Reward) => {
    setRedeemReward(r);
    setSelectedMember(null);
    setMemberSearch("");
    setRedeemDlg(true);
  };

  const doRedeem = async () => {
    if (!redeemReward || !selectedMember) return toast.error("Selecione um cliente");
    const { error } = await sb.rpc("redeem_loyalty_points", {
      _restaurant_id: restaurantId,
      _member_id: selectedMember.id,
      _reward_id: redeemReward.id,
    });
    if (error) return toast.error(error.message);
    toast.success(`${redeemReward.points_cost} pontos resgatados de ${selectedMember.name}`);
    setRedeemDlg(false);
    qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
    qc.invalidateQueries({ queryKey: ["loyalty-members", restaurantId] });
    qc.invalidateQueries({ queryKey: ["loyalty-tx", restaurantId] });
  };

  const filteredMembers = (() => {
    const q = memberSearch.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (membersQ.data ?? []).filter((m) => {
      if (!q) return true;
      const pd = (m.phone || "").replace(/\D/g, "");
      return m.name.toLowerCase().includes(q) || (digits && pd.includes(digits));
    });
  })();

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Cadastre produtos do cardápio que podem ser resgatados com pontos</div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova recompensa</Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recompensa</TableHead>
              <TableHead>Produto vinculado</TableHead>
              <TableHead className="text-right">Pontos</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-56">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rewardsQ.data ?? []).map((r) => {
              const prod = productsQ.data?.find((p) => p.id === r.product_id);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{prod?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-bold">{r.points_cost}</TableCell>
                  <TableCell className="text-right">{r.stock == null ? "∞" : r.stock}</TableCell>
                  <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Ativa" : "Inativa"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => openRedeem(r)}><Gift className="w-4 h-4 mr-1" />Resgatar</Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {(rewardsQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma recompensa cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/edit reward */}
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar recompensa" : "Nova recompensa"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Produto do cardápio (opcional)</Label>
              <Select value={productId} onValueChange={(v) => {
                setProductId(v);
                if (v !== "none" && !name.trim()) {
                  const p = productsQ.data?.find((x) => x.id === v);
                  if (p) setName(p.name);
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {(productsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Nome da recompensa</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Custo em pontos</Label><Input type="number" min="0" step="1" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
              <div className="space-y-1"><Label>Estoque (vazio = ilimitado)</Label><Input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="text-sm font-medium">Ativa</div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem */}
      <Dialog open={redeemDlg} onOpenChange={setRedeemDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resgatar: {redeemReward?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">Custo: <strong>{redeemReward?.points_cost} pontos</strong></div>
            <div className="space-y-1">
              <Label>Buscar cliente</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Nome ou telefone" value={memberSearch} onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); }} />
              </div>
            </div>
            <div className="border rounded-lg max-h-64 overflow-auto">
              {filteredMembers.slice(0, 50).map((m) => {
                const enough = redeemReward ? m.points >= redeemReward.points_cost : false;
                const sel = selectedMember?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMember(m)}
                    className={`w-full text-left p-2 border-b last:border-b-0 hover:bg-accent ${sel ? "bg-accent" : ""}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.phone}</div>
                      </div>
                      <Badge variant={enough ? "default" : "secondary"}>{m.points} pts</Badge>
                    </div>
                  </button>
                );
              })}
              {filteredMembers.length === 0 && (
                <div className="text-center text-muted-foreground py-6 text-sm">Nenhum cliente</div>
              )}
            </div>
            {selectedMember && redeemReward && (
              <div className="text-sm border rounded-lg p-3 bg-muted/50">
                Saldo após resgate: <strong>{selectedMember.points - redeemReward.points_cost} pontos</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemDlg(false)}>Cancelar</Button>
            <Button
              onClick={doRedeem}
              disabled={!selectedMember || (redeemReward != null && selectedMember.points < redeemReward.points_cost)}
            >
              <Gift className="w-4 h-4 mr-1" />Confirmar resgate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
