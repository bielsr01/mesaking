import { ChefHat, LayoutDashboard, ShoppingBag, UtensilsCrossed, Settings, Store, Printer, Plug, ChevronDown, Users, Megaphone, Ticket, Award, Send, ClipboardList, Package, Receipt, Bike } from "lucide-react";
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
  | "ifood"
  | "menu"
  | "customers"
  | "marketing:coupons"
  | "marketing:loyalty"
  | "marketing:bulk"
  | "settings:order-config"
  | "settings:business"
  | "settings:printers"
  | "settings:integrations"
  | "supply-orders"
  | "expenses";

const mainItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "overview", title: "Visão geral", icon: LayoutDashboard },
  { id: "orders", title: "Pedidos", icon: ShoppingBag },
  { id: "ifood", title: "iFood", icon: Bike },
  { id: "menu", title: "Cardápio", icon: UtensilsCrossed },
  { id: "customers", title: "Clientes", icon: Users },
];

const marketingItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "marketing:coupons", title: "Cupons de desconto", icon: Ticket },
  { id: "marketing:bulk", title: "Envio em massa", icon: Send },
];

const loyaltyItem: { id: DashboardView; title: string; icon: any } = {
  id: "marketing:loyalty",
  title: "Programa de fidelidade",
  icon: Award,
};

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
  const marketingActive = active.startsWith("marketing:") && active !== "marketing:loyalty";
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
              {mainItems.map((item) => {
                const isOrders = item.id === "orders";
                const showBlink = isOrders && ordersBlinking;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={active === item.id}
                      onClick={() => onChange(item.id)}
                      tooltip={item.title}
                      className={showBlink ? "text-destructive animate-pulse" : ""}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {isOrders && ordersBadge > 0 && (
                        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
                          {ordersBadge > 9 ? "9+" : ordersBadge}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

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

              {/* Programa de fidelidade (item raiz, abaixo de Marketing) */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === loyaltyItem.id}
                  onClick={() => onChange(loyaltyItem.id)}
                  tooltip={loyaltyItem.title}
                >
                  <loyaltyItem.icon className="h-4 w-4" />
                  <span>{loyaltyItem.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

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

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "supply-orders"}
                  onClick={() => onChange("supply-orders")}
                  tooltip="Pedido de Insumos"
                >
                  <Package className="h-4 w-4" />
                  <span>Pedido de Insumos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "expenses"}
                  onClick={() => onChange("expenses")}
                  tooltip="Cadastro de despesas"
                >
                  <Receipt className="h-4 w-4" />
                  <span>Cadastro de despesas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
