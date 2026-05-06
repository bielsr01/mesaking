import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users } from "lucide-react";
import { unmaskPhone } from "@/lib/format";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";
import { Badge } from "@/components/ui/badge";

const sb = supabase as any;

export function AdminCustomersPanel() {
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const idsKey = selected.slice().sort().join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", idsKey],
    enabled: selected.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("customers")
        .select("id, restaurant_id, name, phone, orders_count, last_order_at, created_at")
        .in("restaurant_id", selected)
        .order("created_at", { ascending: false })
        .limit(1000);
      return (data ?? []) as any[];
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [all]);

  const filtered = (data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || unmaskPhone(c.phone || "").includes(unmaskPhone(search));
  });

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Clientes</CardTitle>
          <CardDescription>Visualize clientes de todas as lojas selecionadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {selected.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Selecione ao menos um restaurante.</div>
          ) : isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Restaurante</TableHead>
                    <TableHead className="text-center">Pedidos</TableHead>
                    <TableHead>Último pedido</TableHead>
                    <TableHead>Cadastrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell><Badge variant="outline">{nameById.get(c.restaurant_id) ?? "—"}</Badge></TableCell>
                      <TableCell className="text-center">{c.orders_count}</TableCell>
                      <TableCell>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-xs text-muted-foreground">Total: <strong>{filtered.length}</strong> cliente(s)</div>
        </CardContent>
      </Card>
    </div>
  );
}
