import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BulkCampaignsPanel } from "@/components/dashboard/BulkCampaignsPanel";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";

export function AdminBulkCampaignsPanel() {
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>

      {selected.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Selecione ao menos um restaurante para visualizar.</CardContent></Card>
      ) : (
        <BulkCampaignsPanel key={selected.slice().sort().join(",")} scope="admin" restaurantIds={selected} onRestaurantIdsChange={setSelected} />
      )}
    </div>
  );
}
