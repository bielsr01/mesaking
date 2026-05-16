import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store } from "lucide-react";
import { LoyaltyPanel } from "@/components/dashboard/LoyaltyPanel";
import { useRestaurants } from "./RestaurantMultiSelect";

export function AdminLoyaltyPanel() {
  const { data: restaurants = [], isLoading } = useRestaurants();
  const [restaurantId, setRestaurantId] = useState<string>("");

  useEffect(() => {
    if (!restaurantId && restaurants.length) setRestaurantId(restaurants[0].id);
  }, [restaurants, restaurantId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm whitespace-nowrap">Restaurante:</Label>
          </div>
          <div className="w-full sm:min-w-[260px] sm:flex-1 sm:max-w-md">
            <Select value={restaurantId} onValueChange={setRestaurantId} disabled={isLoading || restaurants.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione o restaurante"} />
              </SelectTrigger>
              <SelectContent>
                {restaurants.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {restaurantId ? (
        <LoyaltyPanel restaurantId={restaurantId} isAdmin />
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione um restaurante para gerenciar o programa de fidelidade.</CardContent></Card>
      )}
    </div>
  );
}
