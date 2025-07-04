
import { Home, Wifi, Ship, Users, Bell, Settings } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

const allNavigationItems = [
  { title: "Dashboard", url: "/", icon: Home, roles: ['super_admin', 'empresa_admin', 'gerente_embarcacao'] },
  { title: "Hotspots", url: "/hotspots", icon: Wifi, roles: ['super_admin', 'empresa_admin'] },
  { title: "Embarcações", url: "/embarcacoes", icon: Ship, roles: ['super_admin', 'empresa_admin'] },
  { title: "Tripulantes", url: "/tripulantes", icon: Users, roles: ['super_admin', 'empresa_admin', 'gerente_embarcacao'] },
  { title: "Alertas", url: "/alertas", icon: Bell, roles: ['super_admin', 'empresa_admin', 'gerente_embarcacao'] },
  { title: "Configurações", url: "/configuracoes", icon: Settings, roles: ['super_admin', 'empresa_admin', 'gerente_embarcacao'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { user, hasRole } = useAuth();
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Filtrar itens de navegação baseado no role do usuário
  const navigationItems = allNavigationItems.filter(item => 
    hasRole(item.roles as any)
  );

  return (
    <Sidebar className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                    className="w-full"
                  >
                    <NavLink 
                      to={item.url} 
                      className={({ isActive }) => 
                        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                          isActive 
                            ? "bg-accent text-accent-foreground font-medium" 
                            : "text-muted-foreground"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {/* Informações do usuário */}
        {user && !isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Usuário
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-3 py-2 text-sm">
                <p className="font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
