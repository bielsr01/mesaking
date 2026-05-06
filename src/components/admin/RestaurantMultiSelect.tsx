import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Store, ChevronDown, Check } from "lucide-react";

const sb = supabase as any;

export type RestaurantOption = { id: string; name: string };

export function useRestaurants() {
  return useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data } = await sb.from("restaurants").select("id, name").order("name");
      return (data ?? []) as RestaurantOption[];
    },
  });
}

export function RestaurantMultiSelect({
  all,
  selected,
  onChange,
  autoSelectAll = true,
}: {
  all: RestaurantOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  autoSelectAll?: boolean;
}) {
  useEffect(() => {
    if (autoSelectAll && all.length && selected.length === 0) {
      onChange(all.map((r) => r.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length]);

  const isAll = selected.length === all.length && all.length > 0;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const label = useMemo(() => {
    if (isAll) return "Todos os restaurantes";
    if (selected.length === 0) return "Selecione...";
    if (selected.length === 1) return all.find((r) => r.id === selected[0])?.name ?? "1 restaurante";
    return `${selected.length} restaurantes`;
  }, [selected, all, isAll]);

  return (
    <div className="flex flex-wrap items-center gap-2">
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
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onChange(all.map((r) => r.id))}>Todos</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onChange([])}>Nenhum</Button>
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
      <Badge variant="secondary">{isAll ? `Todos (${all.length})` : `${selected.length} de ${all.length}`}</Badge>
    </div>
  );
}
