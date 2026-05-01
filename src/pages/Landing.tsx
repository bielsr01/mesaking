import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChefHat, ShoppingBag, BarChart3, Smartphone, Zap, Shield } from "lucide-react";

export default function Landing() {
  const { user, isMasterAdmin, isManager } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary-foreground" />
            </div>
            <span>MesaPro</span>
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <>
                {isMasterAdmin && (
                  <Button asChild variant="ghost"><Link to="/admin">Admin</Link></Button>
                )}
                {isManager && (
                  <Button asChild><Link to="/dashboard">Painel</Link></Button>
                )}
              </>
            ) : (
              <>
                <Button asChild variant="ghost"><Link to="/auth">Entrar</Link></Button>
                <Button asChild><Link to="/auth?mode=signup">Criar conta</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="container py-20 md:py-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" /> Plataforma SaaS multi-tenant
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Gerencie sua rede de <span className="bg-gradient-warm bg-clip-text text-transparent">restaurantes</span> em um só lugar
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Cardápio digital, pedidos em tempo real e painel completo para cada unidade. Seus clientes pedem, você acompanha tudo numa tela só.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="text-base">
              <Link to="/auth?mode=signup">Começar grátis</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base">
              <Link to="/auth">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container pb-24 grid md:grid-cols-3 gap-6">
        {[
          { icon: ShoppingBag, title: "Pedidos em tempo real", desc: "Acompanhe novos pedidos chegando instantaneamente, sem precisar atualizar a tela." },
          { icon: Smartphone, title: "Cardápio digital", desc: "Cada restaurante tem sua própria página de pedidos com fotos, categorias e checkout completo." },
          { icon: BarChart3, title: "Visão da rede", desc: "Master Admin acompanha todas as unidades, faturamento e operação em um painel global." },
          { icon: Shield, title: "Multi-tenant seguro", desc: "Cada gerente vê apenas seu restaurante. Permissões granulares no banco de dados." },
          { icon: Zap, title: "Busca de CEP", desc: "Endereço preenchido automaticamente via ViaCEP. Menos atrito no checkout do cliente." },
          { icon: ChefHat, title: "Cardápio dinâmico", desc: "Categorias e produtos com fotos, descrições, preços e ativação instantânea." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl bg-card border p-6 shadow-soft hover:shadow-elegant transition-shadow">
            <div className="w-11 h-11 rounded-xl bg-accent text-accent-foreground flex items-center justify-center mb-4">
              <f.icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        MesaPro — sistema de gestão para redes de restaurantes
      </footer>
    </div>
  );
}
