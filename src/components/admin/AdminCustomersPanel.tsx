import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, Filter, X } from "lucide-react";
import { unmaskPhone } from "@/lib/format";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const sb = supabase as any;

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

export function AdminCustomersPanel() {
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<ClientType>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<ClientStatus>>(new Set());
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
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(c.name?.toLowerCase().includes(q) || unmaskPhone(c.phone || "").includes(unmaskPhone(search)))) return false;
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

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Clientes</CardTitle>
          <CardDescription>Visualize e classifique clientes de todas as lojas selecionadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Pedidos</TableHead>
                    <TableHead>Último pedido</TableHead>
                    <TableHead>Cadastrado</TableHead>
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
                        <TableCell><Badge variant="outline">{nameById.get(c.restaurant_id) ?? "—"}</Badge></TableCell>
                        <TableCell>{t ? <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[t]}`}>{TYPE_LABELS[t]}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        <TableCell>{s ? <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s]}`}>{STATUS_LABELS[s]}</span> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        <TableCell className="text-center">{c.orders_count}</TableCell>
                        <TableCell>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell>{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      </TableRow>
                    );
                  })}
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
