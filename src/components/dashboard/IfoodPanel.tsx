import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { brl } from "@/lib/format";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const sb = supabase as any;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function IfoodPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<number>(now.getMonth());
  const [year, setYear] = useState<number>(now.getFullYear());
  const [sales, setSales] = useState("");
  const [net, setNet] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const list = useQuery({
    queryKey: ["ifood-sales", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("ifood_sales").select("*").eq("restaurant_id", restaurantId).order("date_from", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const reset = () => {
    setMonth(now.getMonth()); setYear(now.getFullYear());
    setSales(""); setNet(""); setNotes("");
  };

  const salesNum = Number(sales || 0);
  const netNum = Number(net || 0);
  const feesNum = Math.max(0, salesNum - netNum);

  const save = async () => {
    if (salesNum <= 0) return toast.error("Informe o valor das vendas");
    if (netNum <= 0) return toast.error("Informe o total faturamento");
    if (netNum > salesNum) return toast.error("Faturamento não pode ser maior que vendas");

    const ref = new Date(year, month, 1);
    const from = startOfMonth(ref);
    const to = endOfMonth(ref);

    setSaving(true);
    const { error } = await sb.from("ifood_sales").insert({
      restaurant_id: restaurantId,
      date_from: format(from, "yyyy-MM-dd"),
      date_to: format(to, "yyyy-MM-dd"),
      orders_count: 0,
      gross_revenue: salesNum,
      fees: feesNum,
      net_revenue: netNum,
      notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Mês iFood registrado");
    qc.invalidateQueries({ queryKey: ["ifood-sales", restaurantId] });
    qc.invalidateQueries({ queryKey: ["overview-ifood", restaurantId] });
    reset();
    setOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir registro?")) return;
    const { error } = await sb.from("ifood_sales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ifood-sales", restaurantId] });
    qc.invalidateQueries({ queryKey: ["overview-ifood", restaurantId] });
  };

  const totals = (list.data ?? []).reduce(
    (a, r) => ({
      sales: a.sales + Number(r.gross_revenue || 0),
      net: a.net + Number(r.net_revenue || 0),
      fees: a.fees + Number(r.fees || 0),
    }),
    { sales: 0, net: 0, fees: 0 }
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="w-full h-20 text-lg gap-2"><Plus className="w-6 h-6" />Registrar mês de vendas iFood</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar mês iFood</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Mês</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Valor das vendas (R$)</Label>
                <Input type="number" step="0.01" value={sales} onChange={(e) => setSales(e.target.value)} />
              </div>
              <div>
                <Label>Total faturamento (R$)</Label>
                <Input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)} />
              </div>
            </div>
            {(sales || net) && (
              <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
                <div className="flex justify-between"><span className="text-muted-foreground">Vendas</span><span className="font-medium">{brl(salesNum)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Taxas, serviços e ajustes</span><span className="font-medium text-red-600">- {brl(feesNum)}</span></div>
                <div className="flex justify-between border-t pt-1"><span>Faturamento</span><span className="font-semibold">{brl(netNum)}</span></div>
              </div>
            )}
            <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <StatCard label="Valor das vendas" value={brl(totals.sales)} />
        <StatCard label="Taxas, serviços e ajustes" value={`- ${brl(totals.fees)}`} negative />
        <StatCard label="Total faturamento" value={brl(totals.net)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Registro mensal iFood</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Taxas/Ajustes</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((r) => {
                const d = new Date(r.date_from + "T00:00");
                return (
                  <TableRow key={r.id}>
                    <TableCell className="capitalize">{format(d, "MMMM 'de' yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.gross_revenue))}</TableCell>
                    <TableCell className="text-right text-red-600">- {brl(Number(r.fees))}</TableCell>
                    <TableCell className="text-right font-medium">{brl(Number(r.net_revenue))}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">{r.notes}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                );
              })}
              {(list.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum mês registrado. Clique no botão acima para adicionar.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`text-2xl font-bold ${negative ? "text-red-600" : ""}`}>{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
