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
import { Pencil, Trash2, Plus, Search, Users } from "lucide-react";
import { formatPhone, unmaskPhone } from "@/lib/format";

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
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || unmaskPhone(c.phone).includes(unmaskPhone(search));
  });

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
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum cliente {search ? "encontrado" : "cadastrado ainda"}.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="text-center">Pedidos</TableHead>
                  <TableHead>Último pedido</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell>{c.address_city ? `${c.address_city}${c.address_state ? `/${c.address_state}` : ""}` : "—"}</TableCell>
                    <TableCell className="text-center">{c.orders_count}</TableCell>
                    <TableCell>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
