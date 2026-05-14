import { ChefHat, LayoutDashboard, ShoppingBag, UtensilsCrossed, Settings, Store, Printer, Plug, ChevronDown, ChevronRight, Users, Megaphone, Ticket, Award, Send, ClipboardList, Package, Receipt, Boxes, LineChart, ShieldCheck } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { Permissions } from "@/lib/permissions";
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
  | "settings:integrations"
  | "settings:access"
  | "supply-orders"
  | "stock"
  | "expenses"
  | "finance";

const mainItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "overview", title: "Visão geral", icon: LayoutDashboard },
  { id: "orders", title: "Pedidos", icon: ShoppingBag },
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
  { id: "settings:access", title: "Gestão de Acessos", icon: ShieldCheck },
];

export function AppSidebar({
  active,
  onChange,
  ordersBadge = 0,
  ordersBlinking = false,
  permissions,
  isFullAccess = true,
}: {
  active: DashboardView;
  onChange: (v: DashboardView) => void;
  ordersBadge?: number;
  ordersBlinking?: boolean;
  permissions?: Permissions;
  isFullAccess?: boolean;
}) {
  const can = (path: string): any => {
    if (isFullAccess || !permissions) return true;
    return path.split(".").reduce((o: any, k) => (o ? o[k] : undefined), permissions);
  };
  const visibleMain = mainItems.filter((it) => {
    if (it.id === "overview") return !!can("overview.view");
    if (it.id === "orders") return !!can("orders.view");
    if (it.id === "menu") return !!can("menu.view");
    if (it.id === "customers") return !!can("customers.view");
    return true;
  });
  const visibleMarketing = marketingItems.filter((it) => {
    if (it.id === "marketing:coupons") return !!can("marketing.coupons.view");
    if (it.id === "marketing:bulk") return !!can("marketing.bulk.view");
    return true;
  });
  const visibleSettings = settingsItems.filter((it) => {
    if (it.id === "settings:access") return !!can("access_management.view");
    return !!can("settings.view");
  });
  const showLoyalty = !!can("loyalty.view");
  const showSupply = !!can("supply_orders.view");
  const showStock = !!can("stock.view");
  const showExpenses = !!can("expenses.view");
  const showFinance = !!can("finance.view");
  const showSettings = !!can("settings.view") || !!can("access_management.view");
  const showMarketing = visibleMarketing.length > 0;
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
              {visibleMain.map((item) => {
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

              {showMarketing && (
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
                        {visibleMarketing.map((item) => (
                          <SidebarMenuSubItem key={item.id}>
                            <SidebarMenuSubButton asChild isActive={active === item.id}>
                              <button type="button" onClick={() => onChange(item.id)} className="w-full text-left flex items-center gap-2">
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
              )}

              {showLoyalty && (
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
              )}

              {showSettings && visibleSettings.length > 0 && (
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
                        {visibleSettings.map((item) => (
                          <SidebarMenuSubItem key={item.id}>
                            <SidebarMenuSubButton asChild isActive={active === item.id}>
                              <button type="button" onClick={() => onChange(item.id)} className="w-full text-left flex items-center gap-2">
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
              )}

              {showSupply && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={active === "supply-orders"} onClick={() => onChange("supply-orders")} tooltip="Pedido de Insumos">
                    <Package className="h-4 w-4" />
                    <span>Pedido de Insumos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {showStock && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={active === "stock"} onClick={() => onChange("stock")} tooltip="Estoque">
                    <Boxes className="h-4 w-4" />
                    <span>Estoque</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {showExpenses && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={active === "expenses"} onClick={() => onChange("expenses")} tooltip="Cadastro de despesas">
                    <Receipt className="h-4 w-4" />
                    <span>Cadastro de despesas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {showFinance && (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={active === "finance"} onClick={() => onChange("finance")} tooltip="Receitas - Despesas">
                    <LineChart className="h-4 w-4" />
                    <span>Receitas - Despesas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
