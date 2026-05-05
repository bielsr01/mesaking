import { ChefHat, Store, Package, ShoppingBag, ChevronDown } from "lucide-react";
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

export type AdminView = "restaurants" | "supply:catalog" | "supply:orders";

export function AdminSidebar({ active, onChange }: { active: AdminView; onChange: (v: AdminView) => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const supplyActive = active.startsWith("supply:");
  const [supplyOpen, setSupplyOpen] = useState(supplyActive);

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
                  isActive={active === "restaurants"}
                  onClick={() => onChange("restaurants")}
                  tooltip="Restaurantes"
                >
                  <Store className="h-4 w-4" />
                  <span>Restaurantes</span>
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
