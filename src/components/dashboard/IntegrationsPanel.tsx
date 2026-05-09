import { EvolutionIntegrationCard } from "./EvolutionIntegrationCard";
import { IhubIntegrationCard } from "./IhubIntegrationCard";

export function IntegrationsPanel({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EvolutionIntegrationCard scope="restaurant" restaurantId={restaurantId} />
        <IhubIntegrationCard restaurantId={restaurantId} />
      </div>
    </div>
  );
}
