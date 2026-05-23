import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Mic, CalendarCheck, CalendarRange, Newspaper, LineChart, HeartPulse, UserCircle, Mail, LogOut, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { SakuraLogo } from "@/components/SakuraLogo";
import { supabase } from "@/integrations/supabase/client";
import { whoAmI } from "@/lib/invites.functions";

const items = [
  { title: "Chat", url: "/chat", icon: MessageCircle },
  { title: "Voice", url: "/voice", icon: Mic },
  { title: "Check-in", url: "/checkin", icon: CalendarCheck },
  { title: "Planner", url: "/planner", icon: CalendarRange },
  { title: "News", url: "/news", icon: Newspaper },
  { title: "Markets", url: "/markets", icon: LineChart },
  { title: "Health", url: "/health", icon: HeartPulse },
  { title: "Profile", url: "/profile", icon: UserCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const who = useServerFn(whoAmI);
  const { data: me } = useQuery({ queryKey: ["whoami"], queryFn: () => who({ data: undefined }) });

  const isActive = (url: string) => path === url || path.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/chat" className="flex items-center gap-2 px-2 py-1">
          <SakuraLogo size={28} spin />
          {!collapsed && <span className="font-display text-xl text-gradient-sakura">Sakura</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Garden</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {me?.role === "admin" && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/invites")}>
                      <Link to="/invites">
                        <Mail className="h-4 w-4" />
                        <span>Invites</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/settings")}>
                      <Link to="/settings">
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={async () => { await supabase.auth.signOut(); nav({ to: "/" }); }}>
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
