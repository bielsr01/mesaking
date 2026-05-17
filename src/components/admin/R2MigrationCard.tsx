import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Cloud, Loader2, Trash2 } from "lucide-react";

export function R2MigrationCard() {
  const [result, setResult] = useState<any>(null);
  const [purgeResult, setPurgeResult] = useState<any>(null);

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

  const purge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("r2-purge-supabase", { body: {} });
      if (error) throw new Error(error.message || "Falha");
      return data;
    },
    onSuccess: (data) => {
      setPurgeResult(data);
      toast.success("Imagens do Supabase removidas");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao apagar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Cloud className="h-4 w-4" /> Armazenamento de imagens (Cloudflare R2)</CardTitle>
        <CardDescription>
          Todo upload novo já vai direto para o R2. Use os botões abaixo apenas se precisar reexecutar a migração
          ou apagar definitivamente as imagens antigas que ainda estão no storage do Supabase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Migrando...</> : "Reexecutar migração"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={purge.isPending}>
                {purge.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Apagando...</> : <><Trash2 className="h-4 w-4 mr-2" /> Apagar imagens do Supabase</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar TODAS as imagens do Supabase?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação apaga permanentemente todos os arquivos dos buckets <b>menu-images</b> e <b>expense-receipts</b>.
                  Só prossiga se já confirmou que as imagens estão carregando do R2. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => purge.mutate()}>Apagar tudo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {result && (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[200px]">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {purgeResult && (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[200px]">
            {JSON.stringify(purgeResult, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
