import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FinancePanel } from "@/components/dashboard/FinancePanel";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";

export function AdminFinancePanel() {
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>
      <FinancePanel key={selected.slice().sort().join(",")} restaurantIds={selected} />
    </div>
  );
}
