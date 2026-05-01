import { ChefHat, LayoutDashboard, ShoppingBag, UtensilsCrossed, Settings, Store, Printer, Plug, ChevronDown } from "lucide-react";
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
  | "settings:business"
  | "settings:printers"
  | "settings:integrations";

const mainItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "overview", title: "Visão geral", icon: LayoutDashboard },
  { id: "orders", title: "Pedidos", icon: ShoppingBag },
  { id: "menu", title: "Cardápio", icon: UtensilsCrossed },
];

const settingsItems: { id: DashboardView; title: string; icon: any }[] = [
  { id: "settings:business", title: "Informações do negócio", icon: Store },
  { id: "settings:printers", title: "Impressões", icon: Printer },
  { id: "settings:integrations", title: "Integrações", icon: Plug },
];

export function AppSidebar({
  active,
  onChange,
}: {
  active: DashboardView;
  onChange: (v: DashboardView) => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const settingsActive = active.startsWith("settings:");
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
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configurações de Pedidos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
                          <SidebarMenuSubButton
                            asChild
                            isActive={active === item.id}
                          >
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
