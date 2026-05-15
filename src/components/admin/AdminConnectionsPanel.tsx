import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EvolutionIntegrationCard } from "@/components/dashboard/EvolutionIntegrationCard";
import { IhubIntegrationCard } from "@/components/dashboard/IhubIntegrationCard";
import { QueroIntegrationCard } from "@/components/dashboard/QueroIntegrationCard";

export function AdminConnectionsPanel() {
  const [scope, setScope] = useState<string>("admin");

  const { data: restaurants } = useQuery({
    queryKey: ["admin-connections-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id,name").order("name");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Visualizar integrações de</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin (geral)</SelectItem>
              {(restaurants ?? []).map((r: any) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure aqui chaves, tokens e detalhes. Cada restaurante vê apenas o status e um botão para verificar a conexão.
        </p>
      </div>

      {scope === "admin" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EvolutionIntegrationCard scope="admin" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EvolutionIntegrationCard scope="restaurant" restaurantId={scope} />
          <IhubIntegrationCard restaurantId={scope} />
          <QueroIntegrationCard restaurantId={scope} />
        </div>
      )}
    </div>
  );
}
