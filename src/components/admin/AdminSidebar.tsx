import { ChefHat, Store, Package, ShoppingBag, ChevronDown, BarChart3, Users, Megaphone, Ticket, BookOpen, Send, Plug, Boxes, Receipt, LineChart, Bike } from "lucide-react";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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

export type AdminView =
  | "overview"
  | "restaurants"
  | "menu"
  | "customers"
  | "marketing:coupons"
  | "marketing:bulk"
  | "settings:integrations"
  | "supply:catalog"
  | "supply:orders"
  | "stock"
  | "expenses:admin"
  | "expenses:stores"
  | "finance";

export function AdminSidebar({ active, onChange, supplyBadge = 0 }: { active: AdminView; onChange: (v: AdminView) => void; supplyBadge?: number }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const supplyActive = active.startsWith("supply:");
  const marketingActive = active.startsWith("marketing:");
  const expensesActive = active.startsWith("expenses:");
  const [supplyOpen, setSupplyOpen] = useState(supplyActive);
  const [marketingOpen, setMarketingOpen] = useState(marketingActive);
  const [expensesOpen, setExpensesOpen] = useState(expensesActive);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
            <ChefHat className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-bold">MesaPro Admin</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "overview"}
                  onClick={() => onChange("overview")}
                  tooltip="Visão geral"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Visão geral</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "restaurants"}
                  onClick={() => onChange("restaurants")}
                  tooltip="Restaurantes"
                >
                  <Store className="h-4 w-4" />
                  <span>Restaurantes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "menu"}
                  onClick={() => onChange("menu")}
                  tooltip="Cardápio"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Cardápio</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "customers"}
                  onClick={() => onChange("customers")}
                  tooltip="Clientes"
                >
                  <Users className="h-4 w-4" />
                  <span>Clientes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

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
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={active === "marketing:coupons"}>
                          <button type="button" onClick={() => onChange("marketing:coupons")} className="w-full text-left flex items-center gap-2">
                            <Ticket className="h-4 w-4" />
                            <span>Cupons de desconto</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={active === "marketing:bulk"}>
                          <button type="button" onClick={() => onChange("marketing:bulk")} className="w-full text-left flex items-center gap-2">
                            <Send className="h-4 w-4" />
                            <span>Envio em massa</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "settings:integrations"}
                  onClick={() => onChange("settings:integrations")}
                  tooltip="Integrações"
                >
                  <Plug className="h-4 w-4" />
                  <span>Integrações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <Collapsible open={supplyOpen || collapsed} onOpenChange={setSupplyOpen} asChild>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={supplyActive} tooltip="Pedido de Insumos">
                      <Package className="h-4 w-4" />
                      <span>Pedido de Insumos</span>
                      {supplyBadge > 0 && (
                        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
                          {supplyBadge > 9 ? "9+" : supplyBadge}
                        </span>
                      )}
                      <ChevronDown className="ml-1 h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={active === "supply:catalog"}>
                          <button type="button" onClick={() => onChange("supply:catalog")} className="w-full text-left flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            <span>Catálogo de insumos</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={active === "supply:orders"}>
                          <button type="button" onClick={() => onChange("supply:orders")} className="w-full text-left flex items-center gap-1.5 min-w-0">
                            <ShoppingBag className="h-4 w-4 shrink-0" />
                            <span className="flex-1 min-w-0 truncate whitespace-nowrap">Pedidos recebidos</span>
                            {supplyBadge > 0 && (
                              <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold grid place-items-center leading-none">
                                {supplyBadge > 9 ? "9+" : supplyBadge}
                              </span>
                            )}
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "stock"}
                  onClick={() => onChange("stock")}
                  tooltip="Estoque"
                >
                  <Boxes className="h-4 w-4" />
                  <span>Estoque</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <Collapsible open={expensesOpen || collapsed} onOpenChange={setExpensesOpen} asChild>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={expensesActive} tooltip="Cadastro de despesas">
                      <Receipt className="h-4 w-4" />
                      <span>Cadastro de despesas</span>
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={active === "expenses:admin"}>
                          <button type="button" onClick={() => onChange("expenses:admin")} className="w-full text-left flex items-center gap-2">
                            <Receipt className="h-4 w-4" />
                            <span>Despesas Admin</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={active === "expenses:stores"}>
                          <button type="button" onClick={() => onChange("expenses:stores")} className="w-full text-left flex items-center gap-2">
                            <Store className="h-4 w-4" />
                            <span>Despesas das lojas</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === "finance"}
                  onClick={() => onChange("finance")}
                  tooltip="Receitas - Despesas"
                >
                  <LineChart className="h-4 w-4" />
                  <span>Receitas - Despesas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
