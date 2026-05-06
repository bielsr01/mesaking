import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Store, ChevronDown, Check } from "lucide-react";
import { OverviewPanel } from "@/components/dashboard/OverviewPanel";

const sb = supabase as any;

export function AdminOverviewPanel() {
  const restaurantsQ = useQuery({
    queryKey: ["admin-overview-restaurants"],
    queryFn: async () => {
      const { data } = await sb.from("restaurants").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  // Default to "all" once list loads
  useEffect(() => {
    if (all.length && selected.length === 0) {
      setSelected(all.map((r) => r.id));
    }
  }, [all.length]);

  const isAll = selected.length === all.length && all.length > 0;
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const label = useMemo(() => {
    if (isAll) return "Todos os restaurantes";
    if (selected.length === 0) return "Selecione...";
    if (selected.length === 1) return all.find((r) => r.id === selected[0])?.name ?? "1 restaurante";
    return `${selected.length} restaurantes`;
  }, [selected, all, isAll]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Store className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Restaurantes:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[220px] justify-between">
                {label}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setSelected(all.map((r) => r.id))}>Todos</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setSelected([])}>Nenhum</Button>
              </div>
              <div className="max-h-72 overflow-auto space-y-1">
                {all.map((r) => {
                  const checked = selected.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(r.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left text-sm"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(r.id)} />
                      <span className="flex-1 truncate">{r.name}</span>
                      {checked && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  );
                })}
                {all.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-4">Nenhum restaurante</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Badge variant="secondary" className="ml-auto">
            {isAll ? `Todos (${all.length})` : `${selected.length} de ${all.length}`}
          </Badge>
        </CardContent>
      </Card>

      {selected.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Selecione ao menos um restaurante para visualizar.</CardContent></Card>
      ) : (
        <OverviewPanel key={selected.slice().sort().join(",")} restaurantIds={selected} />
      )}
    </div>
  );
}
