import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { brl } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const sb = supabase as any;

export function IfoodPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
  const [orders, setOrders] = useState("");
  const [gross, setGross] = useState("");
  const [fees, setFees] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const list = useQuery({
    queryKey: ["ifood-sales", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("ifood_sales").select("*").eq("restaurant_id", restaurantId).order("date_from", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const reset = () => { setRange({ from: new Date(), to: new Date() }); setOrders(""); setGross(""); setFees(""); setNotes(""); };

  const save = async () => {
    if (!range?.from) return toast.error("Selecione a data");
    const g = Number(gross || 0);
    const f = Number(fees || 0);
    if (g <= 0) return toast.error("Informe o faturamento bruto");
    setSaving(true);
    const { error } = await sb.from("ifood_sales").insert({
      restaurant_id: restaurantId,
      date_from: format(range.from, "yyyy-MM-dd"),
      date_to: format(range.to ?? range.from, "yyyy-MM-dd"),
      orders_count: Number(orders || 0),
      gross_revenue: g,
      fees: f,
      net_revenue: g - f,
      notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Venda iFood registrada");
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
    (a, r) => ({ orders: a.orders + (r.orders_count || 0), gross: a.gross + Number(r.gross_revenue || 0), net: a.net + Number(r.net_revenue || 0), fees: a.fees + Number(r.fees || 0) }),
    { orders: 0, gross: 0, net: 0, fees: 0 }
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="w-full h-20 text-lg gap-2"><Plus className="w-6 h-6" />Registrar vendas manualmente por iFood</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar vendas iFood</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Período</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !range && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {range?.from ? (range.to && range.to.getTime() !== range.from.getTime() ? `${format(range.from, "dd/MM/yy")} - ${format(range.to, "dd/MM/yy")}` : format(range.from, "dd/MM/yy")) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Pedidos</Label><Input type="number" min="0" value={orders} onChange={(e) => setOrders(e.target.value)} /></div>
              <div><Label>Faturamento bruto (R$)</Label><Input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} /></div>
              <div><Label>Taxas iFood (R$)</Label><Input type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} /></div>
            </div>
            {gross && (
              <div className="text-sm text-muted-foreground">Líquido: <span className="font-semibold text-foreground">{brl(Number(gross) - Number(fees || 0))}</span></div>
            )}
            <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard label="Pedidos" value={totals.orders.toString()} />
        <StatCard label="Faturamento bruto" value={brl(totals.gross)} />
        <StatCard label="Taxas iFood" value={brl(totals.fees)} />
        <StatCard label="Faturamento líquido" value={brl(totals.net)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Registro de vendas iFood</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Taxas</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.date_from === r.date_to ? format(new Date(r.date_from + "T00:00"), "dd/MM/yyyy") : `${format(new Date(r.date_from + "T00:00"), "dd/MM/yy")} - ${format(new Date(r.date_to + "T00:00"), "dd/MM/yy")}`}</TableCell>
                  <TableCell className="text-right">{r.orders_count}</TableCell>
                  <TableCell className="text-right">{brl(Number(r.gross_revenue))}</TableCell>
                  <TableCell className="text-right">{brl(Number(r.fees))}</TableCell>
                  <TableCell className="text-right font-medium">{brl(Number(r.net_revenue))}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">{r.notes}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              {(list.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro ainda. Clique no botão acima para adicionar.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></CardContent></Card>
  );
}
