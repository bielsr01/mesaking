import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Cloud, Loader2 } from "lucide-react";

export function R2MigrationCard() {
  const [result, setResult] = useState<any>(null);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("r2-migrate", { body: {} });
      if (error) throw new Error(error.message || "Falha");
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Migração concluída: ${data?.uploaded ?? 0} arquivos enviados, ${data?.url_replacements ?? 0} URLs atualizadas`);
    },
    onError: (e: any) => toast.error(e.message || "Falha na migração"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Cloud className="h-4 w-4" /> Migrar imagens para Cloudflare R2</CardTitle>
        <CardDescription>
          Copia todos os arquivos atualmente no storage do Supabase (menu-images e expense-receipts) para o R2 e
          atualiza as URLs no banco. Operação pode levar alguns minutos. Rode apenas uma vez.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Migrando...</> : "Iniciar migração"}
        </Button>
        {result && (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px]">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
