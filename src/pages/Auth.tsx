import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";

const signInSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

const signUpSchema = signInSchema.extend({
  full_name: z.string().trim().min(2, "Informe seu nome").max(100),
});

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, isMasterAdmin, isManager, loading, rolesLoading } = useAuth();
  const [tab, setTab] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !rolesLoading && user) {
      if (isMasterAdmin) navigate("/admin", { replace: true });
      else if (isManager) navigate("/dashboard", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [user, isMasterAdmin, isManager, loading, rolesLoading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo!");
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: parsed.data.full_name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Você já pode entrar.");
    setTab("signin");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-accent/30">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 font-bold text-xl">
          <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
            <ChefHat className="w-6 h-6 text-primary-foreground" />
          </div>
          MesaPro
        </Link>
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle>Acessar plataforma</CardTitle>
            <CardDescription>Entre ou crie uma conta para gerenciar seu restaurante.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-in">Email</Label>
                    <Input id="email-in" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pwd-in">Senha</Label>
                    <Input id="pwd-in" name="password" type="password" required autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name-up">Nome completo</Label>
                    <Input id="name-up" name="full_name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Email</Label>
                    <Input id="email-up" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pwd-up">Senha</Label>
                    <Input id="pwd-up" name="password" type="password" required minLength={6} autoComplete="new-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
