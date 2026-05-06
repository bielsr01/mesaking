import { ChefHat, Store, Package, ShoppingBag, ChevronDown, BarChart3, Users, Megaphone, Ticket, BookOpen, Send, Plug } from "lucide-react";
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
  | "supply:orders";

export function AdminSidebar({ active, onChange }: { active: AdminView; onChange: (v: AdminView) => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const supplyActive = active.startsWith("supply:");
  const marketingActive = active.startsWith("marketing:");
  const [supplyOpen, setSupplyOpen] = useState(supplyActive);
  const [marketingOpen, setMarketingOpen] = useState(marketingActive);

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
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
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
                          <button type="button" onClick={() => onChange("supply:orders")} className="w-full text-left flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4" />
                            <span>Pedidos recebidos</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
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
