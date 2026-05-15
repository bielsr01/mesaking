import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Image as ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fetchProducts, menuKeys } from "./MenuManager";
import { brl } from "@/lib/format";

export const suggestionKeys = {
  list: (rid: string) => ["order_suggestions", rid] as const,
};

export interface SuggestionRow {
  id: string;
  product_id: string;
  sort_order: number;
}

export async function fetchSuggestions(restaurantId: string): Promise<SuggestionRow[]> {
  const { data } = await supabase
    .from("order_suggestions")
    .select("id, product_id, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order");
  return (data ?? []) as SuggestionRow[];
}

export function OrderSuggestionsPanel({ restaurantId, canEdit = true }: { restaurantId: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: menuKeys.products(restaurantId),
    queryFn: () => fetchProducts(restaurantId),
    staleTime: 30_000,
  });
  const { data: suggestions = [] } = useQuery({
    queryKey: suggestionKeys.list(restaurantId),
    queryFn: () => fetchSuggestions(restaurantId),
    staleTime: 30_000,
  });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedIds = useMemo(() => new Set(suggestions.map((s) => s.product_id)), [suggestions]);
  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => !selectedIds.has(p.id) && (!term || p.name.toLowerCase().includes(term)));
  }, [products, selectedIds, search]);

  const reload = () => qc.invalidateQueries({ queryKey: suggestionKeys.list(restaurantId) });

  const addProduct = async (productId: string) => {
    const next = suggestions.length;
    const { error } = await supabase
      .from("order_suggestions")
      .insert({ restaurant_id: restaurantId, product_id: productId, sort_order: next });
    if (error) return toast.error(error.message);
    reload();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("order_suggestions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide px-1 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Sugestão de pedidos
        </h3>
        {canEdit && (
          <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setSearch(""); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Adicionar item</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader><DialogTitle>Selecionar item do cardápio</DialogTitle></DialogHeader>
              <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="overflow-y-auto space-y-2 pr-1">
                {available.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto disponível.</p>
                ) : available.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { addProduct(p.id); setPickerOpen(false); }}
                    className="w-full flex gap-3 items-center p-2 rounded-md border hover:bg-muted text-left"
                  >
                    <div className="w-12 h-12 rounded bg-muted overflow-hidden grid place-items-center shrink-0">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-primary font-semibold">{brl(p.price)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Esses itens não aparecem no cardápio público — eles são oferecidos como upgrade dentro do carrinho do cliente.
      </p>

      {suggestions.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Nenhum item de sugestão cadastrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const p = productById.get(s.product_id);
            if (!p) return (
              <Card key={s.id} className="opacity-60">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-1 text-sm text-muted-foreground italic">Produto removido do cardápio</div>
                  {canEdit && <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4" /></Button>}
                </CardContent>
              </Card>
            );
            return (
              <Card key={s.id}>
                <CardContent className="p-3 flex gap-3 items-center">
                  <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden grid place-items-center shrink-0">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-sm font-semibold text-primary">{brl(p.price)}</div>
                  </div>
                  {canEdit && <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4" /></Button>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
