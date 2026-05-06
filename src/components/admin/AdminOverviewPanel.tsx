import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { OverviewPanel } from "@/components/dashboard/OverviewPanel";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";

export function AdminOverviewPanel() {
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>

      {selected.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Selecione ao menos um restaurante para visualizar.</CardContent></Card>
      ) : (
        <OverviewPanel key={selected.slice().sort().join(",")} restaurantIds={selected} />
      )}
    </div>
  );
}
