import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Store, Copy } from "lucide-react";
import { MenuManager } from "@/components/dashboard/MenuManager";
import { useRestaurants } from "./RestaurantMultiSelect";
import { AdminMenuClonerDialog } from "./AdminMenuClonerDialog";

export function AdminMenuPanel() {
  const { data: restaurants = [] } = useRestaurants();
  const [selected, setSelected] = useState<string>("");
  const [cloneOpen, setCloneOpen] = useState(false);

  useEffect(() => {
    if (!selected && restaurants.length) setSelected(restaurants[0].id);
  }, [restaurants, selected]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <Store className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Restaurante:</span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecione um restaurante" />
            </SelectTrigger>
            <SelectContent>
              {restaurants.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Button variant="outline" onClick={() => setCloneOpen(true)} disabled={!selected || restaurants.length < 2}>
              <Copy className="w-4 h-4 mr-2" /> Clonar cardápio
            </Button>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <AdminMenuClonerDialog destRestaurantId={selected} open={cloneOpen} onOpenChange={setCloneOpen} />
      )}

      {selected ? (
        <MenuManager key={selected} restaurantId={selected} />
      ) : (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Selecione um restaurante para gerenciar o cardápio.</CardContent></Card>
      )}
    </div>
  );
}
