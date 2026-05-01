import { ChefHat, LayoutDashboard, ShoppingBag, UtensilsCrossed, Settings, Store, Printer, Plug, ChevronDown, Users, Megaphone, Ticket, Award, Send, ClipboardList } from "lucide-react";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type DashboardView =
  | "overview"
  | "orders"
  | "menu"
  | "customers"
  | "marketing:coupons"
  | "marketing:loyalty"
  | "marketing:bulk"
  | "settings:order-config"
  | "settings:business"
  | "settings:printers"
  | "settings:integrations";

const mainItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "overview", title: "Visão geral", icon: LayoutDashboard },
  { id: "orders", title: "Pedidos", icon: ShoppingBag },
  { id: "menu", title: "Cardápio", icon: UtensilsCrossed },
  { id: "customers", title: "Clientes", icon: Users },
];

const marketingItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "marketing:coupons", title: "Cupons de desconto", icon: Ticket },
  { id: "marketing:loyalty", title: "Programa de fidelidade", icon: Award },
  { id: "marketing:bulk", title: "Envio em massa", icon: Send },
];

const settingsItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "settings:order-config", title: "Configurações de Pedidos", icon: ClipboardList },
  { id: "settings:business", title: "Informações do negócio", icon: Store },
  { id: "settings:printers", title: "Impressões", icon: Printer },
  { id: "settings:integrations", title: "Integrações", icon: Plug },
];

export function AppSidebar({
  active,
  onChange,
  ordersBadge = 0,
  ordersBlinking = false,
}: {
  active: DashboardView;
  onChange: (v: DashboardView) => void;
  ordersBadge?: number;
  ordersBlinking?: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const marketingActive = active.startsWith("marketing:");
  const settingsActive = active.startsWith("settings:");
  const [marketingOpen, setMarketingOpen] = useState(marketingActive);
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
            <ChefHat className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-bold">MesaPro</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={active === item.id}
                    onClick={() => onChange(item.id)}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Marketing */}
              <Collapsible open={marketingOpen || collapsed} onOpenChange={setMarketingOpen} asChild>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={marketingActive} tooltip="Marketing">
                      <Megaphone className="h-4 w-4" />
                      <span>Marketing</span>
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {marketingItems.map((item) => (
                        <SidebarMenuSubItem key={item.id}>
                          <SidebarMenuSubButton asChild isActive={active === item.id}>
                            <button
                              type="button"
                              onClick={() => onChange(item.id)}
                              className="w-full text-left flex items-center gap-2"
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Configurações */}
              <Collapsible open={settingsOpen || collapsed} onOpenChange={setSettingsOpen} asChild>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={settingsActive} tooltip="Configurações">
                      <Settings className="h-4 w-4" />
                      <span>Configurações</span>
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {settingsItems.map((item) => (
                        <SidebarMenuSubItem key={item.id}>
                          <SidebarMenuSubButton asChild isActive={active === item.id}>
                            <button
                              type="button"
                              onClick={() => onChange(item.id)}
                              className="w-full text-left flex items-center gap-2"
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
