import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { FULL_PERMISSIONS, Permissions, mergePermissions, PDV_STATUSES, DELIVERY_STATUSES, IFOOD_STATUSES } from "@/lib/permissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props { restaurantId: string }

interface AccessGroup { id: string; name: string; permissions: any; is_default: boolean }
interface MemberRow { user_id: string; access_group_id: string | null; full_name: string | null; email: string | null; is_owner: boolean }

const SECTIONS: Array<{ key: keyof Permissions; label: string; rows: Array<{ path: string; label: string }> }> = [
  { key: "overview", label: "Visão geral", rows: [{ path: "overview.view", label: "Visualizar" }] },
  { key: "orders", label: "Pedidos", rows: [
    { path: "orders.view", label: "Visualizar" },
    { path: "orders.channels.pdv", label: "Ver pedidos PDV" },
    { path: "orders.channels.delivery", label: "Ver pedidos Delivery" },
    { path: "orders.channels.pickup", label: "Ver pedidos Retirada" },
    { path: "orders.channels.ifood", label: "Ver pedidos iFood" },
    { path: "orders.change_status", label: "Mudar Status" },
    { path: "orders.edit", label: "Pode editar/excluir pedido" },
    { path: "orders.create_pdv_order", label: "Pode fazer um novo pedido PDV" },
  ]},
  { key: "menu", label: "Cardápio", rows: [
    { path: "menu.view", label: "Visualizar cardápio" },
    { path: "menu.edit", label: "Editar/excluir itens, categorias e grupos" },
  ]},
  { key: "customers", label: "Clientes", rows: [
    { path: "customers.view", label: "Visualizar" },
    { path: "customers.edit", label: "Editar dados" },
    { path: "customers.delete", label: "Excluir cliente" },
  ]},
  { key: "marketing", label: "Marketing", rows: [
    { path: "marketing.coupons.view", label: "Ver Cupons de desconto" },
    { path: "marketing.coupons.edit", label: "Editar/criar/excluir cupons" },
    { path: "marketing.bulk.view", label: "Ver Envio em massa" },
    { path: "marketing.bulk.edit", label: "Editar/criar campanhas" },
  ]},
  { key: "loyalty", label: "Programa de fidelidade", rows: [
    { path: "loyalty.view", label: "Acessar programa" },
    { path: "loyalty.toggle_program", label: "Pode ativar/desativar o programa" },
    { path: "loyalty.member_create", label: "Cadastrar cliente no programa" },
    { path: "loyalty.member_delete", label: "Excluir cliente do programa" },
    { path: "loyalty.credit_points", label: "Creditar pontos" },
    { path: "loyalty.redeem_points", label: "Resgatar pontos" },
    { path: "loyalty.manual_adjust", label: "Ajuste manual de pontos" },
    { path: "loyalty.rewards.view", label: "Ver recompensas" },
    { path: "loyalty.rewards.edit", label: "Editar/criar recompensas" },
    { path: "loyalty.rewards.delete", label: "Excluir recompensas" },
  ]},
  { key: "settings", label: "Configurações", rows: [{ path: "settings.view", label: "Visualizar configurações" }] },
  { key: "supply_orders", label: "Pedido de Insumos", rows: [
    { path: "supply_orders.view", label: "Visualizar" },
    { path: "supply_orders.edit", label: "Criar/editar pedidos" },
  ]},
  { key: "stock", label: "Estoque", rows: [
    { path: "stock.view", label: "Visualizar" },
    { path: "stock.edit", label: "Editar estoque" },
  ]},
  { key: "expenses", label: "Cadastro de despesas", rows: [
    { path: "expenses.view", label: "Visualizar despesas" },
    { path: "expenses.edit", label: "Cadastrar, editar e excluir despesa" },
  ] },
  { key: "finance", label: "Receitas - Despesas", rows: [{ path: "finance.view", label: "Visualizar" }] },
  { key: "access_management", label: "Gestão de Acessos", rows: [{ path: "access_management.view", label: "Visualizar e gerenciar usuários" }] },
];

function getAt(obj: any, path: string) {
  return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setAt(obj: any, path: string, value: any) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!o[keys[i]] || typeof o[keys[i]] !== "object") o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

// Dependências: child -> parent (se child=true => parent=true; se parent=false => todos seus children=false)
const PERMISSION_DEPENDENCIES: Record<string, string> = {
  "orders.channels.pdv": "orders.view",
  "orders.channels.delivery": "orders.view",
  "orders.channels.pickup": "orders.view",
  "orders.channels.ifood": "orders.view",
  "orders.change_status": "orders.view",
  "orders.edit": "orders.view",
  "orders.create_pdv_order": "orders.channels.pdv",
  "menu.edit": "menu.view",
  "customers.edit": "customers.view",
  "customers.delete": "customers.view",
  "marketing.coupons.edit": "marketing.coupons.view",
  "marketing.bulk.edit": "marketing.bulk.view",
  "loyalty.toggle_program": "loyalty.view",
  "loyalty.member_create": "loyalty.view",
  "loyalty.member_delete": "loyalty.view",
  "loyalty.credit_points": "loyalty.view",
  "loyalty.redeem_points": "loyalty.view",
  "loyalty.manual_adjust": "loyalty.view",
  "loyalty.rewards.view": "loyalty.view",
  "loyalty.rewards.edit": "loyalty.rewards.view",
  "loyalty.rewards.delete": "loyalty.rewards.view",
  "supply_orders.edit": "supply_orders.view",
  "stock.edit": "stock.view",
  "expenses.edit": "expenses.view",
};

function applyDependencies(perms: any, path: string, value: boolean) {
  setAt(perms, path, value);
  if (value) {
    // habilitar toda a cadeia de pais
    let p = PERMISSION_DEPENDENCIES[path];
    while (p) {
      setAt(perms, p, true);
      p = PERMISSION_DEPENDENCIES[p];
    }
  } else {
    // desabilitar todos os filhos (transitivo)
    const children = Object.entries(PERMISSION_DEPENDENCIES)
      .filter(([, parent]) => parent === path)
      .map(([child]) => child);
    for (const c of children) applyDependencies(perms, c, false);
  }
}

export function AccessManagementPanel({ restaurantId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const groupsQ = useQuery({
    queryKey: ["accessGroups", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_groups")
        .select("id,name,permissions,is_default")
        .eq("restaurant_id", restaurantId)
        .order("created_at");
      if (error) throw error;
      return data as AccessGroup[];
    },
  });

  const membersQ = useQuery({
    queryKey: ["restaurantMembersFull", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data: rest } = await supabase.from("restaurants").select("owner_id").eq("id", restaurantId).maybeSingle();
      const ownerId = (rest as any)?.owner_id as string | null;
      const { data: mems } = await supabase
        .from("restaurant_members")
        .select("user_id,access_group_id")
        .eq("restaurant_id", restaurantId);
      const ids = new Set<string>();
      if (ownerId) ids.add(ownerId);
      (mems ?? []).forEach((m: any) => ids.add(m.user_id));
      const list = Array.from(ids);
      const profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (list.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", list);
        (profs ?? []).forEach((p: any) => { profilesMap[p.id] = { full_name: p.full_name, email: null }; });
      }
      const rows: MemberRow[] = list.map((id) => {
        const mem = (mems ?? []).find((m: any) => m.user_id === id);
        return {
          user_id: id,
          access_group_id: mem ? (mem as any).access_group_id : null,
          full_name: profilesMap[id]?.full_name ?? null,
          email: profilesMap[id]?.email ?? null,
          is_owner: id === ownerId,
        };
      });
      // Owner first, gestores totais (sem grupo) depois, restantes por nome
      rows.sort((a, b) => {
        if (a.is_owner && !b.is_owner) return -1;
        if (!a.is_owner && b.is_owner) return 1;
        const aFull = !a.access_group_id, bFull = !b.access_group_id;
        if (aFull && !bFull) return -1;
        if (!aFull && bFull) return 1;
        return (a.full_name ?? a.user_id).localeCompare(b.full_name ?? b.user_id);
      });
      return rows;
    },
  });

  // Ensure default "Gestor" group exists (read-only marker) — optional, skipped to avoid duplicate seeds.
  // Group dialog
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; editing?: AccessGroup | null }>({ open: false });
  const [groupName, setGroupName] = useState("");
  const [perms, setPerms] = useState<Permissions>(FULL_PERMISSIONS);

  function openGroupCreate() {
    setGroupDialog({ open: true, editing: null });
    setGroupName("");
    setPerms(JSON.parse(JSON.stringify(FULL_PERMISSIONS)));
  }
  function openGroupEdit(g: AccessGroup) {
    setGroupDialog({ open: true, editing: g });
    setGroupName(g.name);
    setPerms(mergePermissions(g.permissions ?? {}));
  }
  async function saveGroup() {
    if (!groupName.trim()) { toast.error("Informe o nome do grupo"); return; }
    if (groupDialog.editing) {
      const { error } = await supabase.from("access_groups")
        .update({ name: groupName.trim(), permissions: perms as any })
        .eq("id", groupDialog.editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("access_groups")
        .insert({ restaurant_id: restaurantId, name: groupName.trim(), permissions: perms as any });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Grupo salvo");
    setGroupDialog({ open: false });
    qc.invalidateQueries({ queryKey: ["accessGroups", restaurantId] });
  }
  async function deleteGroup(g: AccessGroup) {
    if (!confirm(`Excluir grupo "${g.name}"? Usuários nesse grupo voltarão a ser gestores totais.`)) return;
    const { error } = await supabase.from("access_groups").delete().eq("id", g.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Grupo excluído");
    qc.invalidateQueries({ queryKey: ["accessGroups", restaurantId] });
    qc.invalidateQueries({ queryKey: ["restaurantMembersFull", restaurantId] });
  }

  // User dialog
  const [userDialog, setUserDialog] = useState<{ open: boolean; editing?: MemberRow | null }>({ open: false });
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uGroupId, setUGroupId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function openUserCreate() {
    setUserDialog({ open: true, editing: null });
    setUName(""); setUEmail(""); setUPassword(""); setUGroupId("");
  }
  function openUserEdit(m: MemberRow) {
    setUserDialog({ open: true, editing: m });
    setUName(m.full_name ?? "");
    setUEmail("");
    setUPassword("");
    setUGroupId(m.access_group_id ?? "");
  }
  async function saveUser() {
    setSaving(true);
    try {
      if (userDialog.editing) {
        const body: any = {
          restaurant_id: restaurantId,
          target_user_id: userDialog.editing.user_id,
          access_group_id: uGroupId || null,
        };
        if (uName) body.name = uName;
        if (uEmail) body.email = uEmail;
        if (uPassword) body.password = uPassword;
        const { error } = await supabase.functions.invoke("admin-update-sub-user", { body });
        if (error) throw error;
        toast.success("Usuário atualizado");
      } else {
        if (!uName || !uEmail || !uPassword) { toast.error("Preencha nome, email e senha"); setSaving(false); return; }
        const { error } = await supabase.functions.invoke("admin-create-sub-user", {
          body: { restaurant_id: restaurantId, name: uName, email: uEmail, password: uPassword, access_group_id: uGroupId || null },
        });
        if (error) throw error;
        toast.success("Usuário criado");
      }
      setUserDialog({ open: false });
      qc.invalidateQueries({ queryKey: ["restaurantMembersFull", restaurantId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }
  async function deleteUser(m: MemberRow) {
    if (m.is_owner) { toast.error("Não é possível excluir o dono"); return; }
    if (!confirm(`Excluir o usuário "${m.full_name ?? m.user_id}"?`)) return;
    const { error } = await supabase.functions.invoke("admin-update-sub-user", {
      body: { restaurant_id: restaurantId, target_user_id: m.user_id, action: "delete" },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Usuário removido");
    qc.invalidateQueries({ queryKey: ["restaurantMembersFull", restaurantId] });
  }

  const groups = groupsQ.data ?? [];
  const members = membersQ.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Grupos de acesso</CardTitle>
          <Button size="sm" onClick={openGroupCreate}><Plus className="w-4 h-4" /> Cadastrar grupo</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado. Usuários sem grupo têm acesso total (Gestor).</p>}
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between border rounded p-3">
              <div className="font-medium">{g.name}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openGroupEdit(g)}><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="destructive" onClick={() => deleteGroup(g)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Usuários do restaurante</CardTitle>
          <Button size="sm" onClick={openUserCreate}><Plus className="w-4 h-4" /> Cadastrar usuário</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => {
            const groupName = m.access_group_id ? (groups.find((g) => g.id === m.access_group_id)?.name ?? "Grupo removido") : "Gestor";
            return (
              <div key={m.user_id} className="flex items-center justify-between border rounded p-3 gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.full_name ?? "(sem nome)"}{m.user_id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}</div>
                  <div className="text-xs text-muted-foreground truncate">ID: {m.user_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={!m.access_group_id ? "default" : "secondary"}>{groupName}</Badge>
                  {!m.is_owner && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openUserEdit(m)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteUser(m)}><Trash2 className="w-4 h-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Group dialog */}
      <Dialog open={groupDialog.open} onOpenChange={(o) => setGroupDialog({ open: o })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{groupDialog.editing ? "Editar grupo" : "Novo grupo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do grupo</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ex.: Atendente, Caixa..." />
            </div>
            <div className="space-y-4">
              {SECTIONS.map((sec) => (
                <div key={String(sec.key)} className="border rounded p-3 space-y-2">
                  <div className="font-semibold">{sec.label}</div>
                  {sec.rows.map((r) => {
                    return (
                      <div key={r.path} className="flex items-center justify-between">
                        <Label className="cursor-pointer">{r.label}</Label>
                        <Switch
                          checked={!!getAt(perms, r.path)}
                          onCheckedChange={(v) => {
                            const next = JSON.parse(JSON.stringify(perms));
                            applyDependencies(next, r.path, v);
                            setPerms(next);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog({ open: false })}>Cancelar</Button>
            <Button onClick={saveGroup}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User dialog */}
      <Dialog open={userDialog.open} onOpenChange={(o) => setUserDialog({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{userDialog.editing ? "Editar usuário" : "Novo usuário"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={uName} onChange={(e) => setUName(e.target.value)} /></div>
            <div><Label>Email{userDialog.editing && <span className="text-xs text-muted-foreground"> (deixe em branco para manter)</span>}</Label><Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} /></div>
            <div><Label>Senha{userDialog.editing && <span className="text-xs text-muted-foreground"> (deixe em branco para manter)</span>}</Label><Input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} /></div>
            <div>
              <Label>Grupo de acesso</Label>
              <Select value={uGroupId || "__full"} onValueChange={(v) => setUGroupId(v === "__full" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__full">Gestor (acesso total)</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog({ open: false })}>Cancelar</Button>
            <Button onClick={saveUser} disabled={saving}><KeyRound className="w-4 h-4" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
