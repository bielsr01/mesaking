import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Search, Users, Filter, X } from "lucide-react";
import { formatPhone, unmaskPhone } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type ClientType = "elite" | "best" | "frequent" | "new" | "none";
type ClientStatus = "active" | "inactive" | "sleeping" | "risk";

const TYPE_LABELS: Record<ClientType, string> = {
  elite: "Comprador Elite (+8)",
  best: "Melhor Comprador (5–7)",
  frequent: "Comprador Frequente (3–4)",
  new: "Novo Cliente (1–2)",
  none: "Sem pedido",
};
const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Ativo (≤15 dias)",
  inactive: "Inativo (16–30 dias)",
  sleeping: "Dormindo (31–90 dias)",
  risk: "Em risco (+90 dias)",
};

function getClientType(orders: number): ClientType | null {
  if (orders >= 8) return "elite";
  if (orders >= 5) return "best";
  if (orders >= 3) return "frequent";
  if (orders >= 1) return "new";
  if (orders === 0) return "none";
  return null;
}

function getClientStatus(lastOrderAt: string | null): ClientStatus | null {
  if (!lastOrderAt) return null;
  const days = (Date.now() - new Date(lastOrderAt).getTime()) / 86400000;
  if (days <= 15) return "active";
  if (days <= 30) return "inactive";
  if (days <= 90) return "sleeping";
  return "risk";
}

const TYPE_BADGE: Record<ClientType, string> = {
  elite: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  best: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  frequent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  new: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  none: "bg-muted text-muted-foreground",
};
const STATUS_BADGE: Record<ClientStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  inactive: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  sleeping: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  risk: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

type Customer = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  email: string | null;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  notes: string | null;
  orders_count: number;
  last_order_at: string | null;
  created_at: string;
};

const empty = {
  name: "", phone: "", email: "",
  address_cep: "", address_street: "", address_number: "", address_complement: "",
  address_neighborhood: "", address_city: "", address_state: "", notes: "",
};

export function CustomersPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [typeFilters, setTypeFilters] = useState<Set<ClientType>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<ClientStatus>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["customers", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers" as any)
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const filtered = (data ?? []).filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(c.name.toLowerCase().includes(q) || unmaskPhone(c.phone).includes(unmaskPhone(search)))) return false;
    }
    if (typeFilters.size > 0) {
      const t = getClientType(c.orders_count);
      if (!t || !typeFilters.has(t)) return false;
    }
    if (statusFilters.size > 0) {
      const s = getClientStatus(c.last_order_at);
      if (!s || !statusFilters.has(s)) return false;
    }
    return true;
  });

  const toggleType = (t: ClientType) => {
    const n = new Set(typeFilters);
    n.has(t) ? n.delete(t) : n.add(t);
    setTypeFilters(n);
  };
  const toggleStatus = (s: ClientStatus) => {
    const n = new Set(statusFilters);
    n.has(s) ? n.delete(s) : n.add(s);
    setStatusFilters(n);
  };
  const clearFilters = () => { setTypeFilters(new Set()); setStatusFilters(new Set()); };
  const activeFilterCount = typeFilters.size + statusFilters.size;

  const openNew = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone, email: c.email ?? "",
      address_cep: c.address_cep ?? "", address_street: c.address_street ?? "",
      address_number: c.address_number ?? "", address_complement: c.address_complement ?? "",
      address_neighborhood: c.address_neighborhood ?? "", address_city: c.address_city ?? "",
      address_state: c.address_state ?? "", notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) return toast.error("Informe o nome");
    if (unmaskPhone(form.phone).length < 10) return toast.error("Telefone inválido");
    setBusy(true);
    const payload: any = {
      restaurant_id: restaurantId,
      name: form.name.trim(),
      phone: formatPhone(form.phone),
      email: form.email.trim() || null,
      address_cep: form.address_cep || null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      address_neighborhood: form.address_neighborhood || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
      notes: form.notes || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("customers" as any).update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("customers" as any).insert(payload));
    }
    setBusy(false);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return toast.error("Já existe um cliente com este telefone");
      return toast.error(error.message);
    }
    toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["customers", restaurantId] });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("customers" as any).delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluído");
    setDeleteId(null);
    qc.invalidateQueries({ queryKey: ["customers", restaurantId] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Clientes</CardTitle>
            <CardDescription>
              Cadastre, edite e gerencie seus clientes. Quem faz pedido pelo delivery é salvo automaticamente.
            </CardDescription>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo cliente</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-1" /> Filtros
                {activeFilterCount > 0 && <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tipo de cliente</div>
                  <div className="space-y-2">
                    {(Object.keys(TYPE_LABELS) as ClientType[]).map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={typeFilters.has(t)} onCheckedChange={() => toggleType(t)} />
                        {TYPE_LABELS[t]}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Status</div>
                  <div className="space-y-2">
                    {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={statusFilters.has(s)} onCheckedChange={() => toggleStatus(s)} />
                        {STATUS_LABELS[s]}
                      </label>
                    ))}
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                    <X className="w-4 h-4 mr-1" /> Limpar filtros
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(typeFilters).map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {TYPE_LABELS[t]}
                  <button onClick={() => toggleType(t)}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
              {Array.from(statusFilters).map((s) => (
                <Badge key={s} variant="secondary" className="gap-1">
                  {STATUS_LABELS[s]}
                  <button onClick={() => toggleStatus(s)}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum cliente {search || activeFilterCount ? "encontrado" : "cadastrado ainda"}.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Pedidos</TableHead>
                  <TableHead>Último pedido</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const t = getClientType(c.orders_count);
                  const s = getClientStatus(c.last_order_at);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{t ? <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[t]}`}>{TYPE_LABELS[t]}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell>{s ? <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s]}`}>{STATUS_LABELS[s]}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell className="text-center">{c.orders_count}</TableCell>
                      <TableCell>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Telefone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(11) 99999-0000" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>CEP</Label><Input value={form.address_cep} onChange={(e) => setForm({ ...form, address_cep: e.target.value })} /></div>
              <div className="space-y-2"><Label>Rua</Label><Input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} /></div>
              <div className="space-y-2"><Label>Número</Label><Input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} /></div>
              <div className="space-y-2"><Label>Complemento</Label><Input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} /></div>
              <div className="space-y-2 col-span-2"><Label>Bairro</Label><Input value={form.address_neighborhood} onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value })} /></div>
              <div className="space-y-2"><Label>Cidade</Label><Input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} /></div>
              <div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-2 col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
