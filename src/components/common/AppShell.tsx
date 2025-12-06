"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Home,
  LogOut,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { VoiceCommandButton } from './VoiceCommandButton';
import { Logo } from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { BottomNavBar } from './BottomNavBar';

const userAvatar = PlaceHolderImages.find((img) => img.id === 'user-avatar');

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  if (pathname === '/login') {
    return <>{children}</>;
  }
  
  const menuItems = [
    { href: '/', label: 'Feed', icon: Home },
    { href: '/inventory', label: 'Inventory', icon: Boxes },
    { href: '/clients', label: 'Clients', icon: Users },
    { href: '/sales', label: 'Sales', icon: ShoppingCart },
    { href: '/restocks', label: 'Restocks', icon: Truck },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link href="/settings">
                <SidebarMenuButton tooltip="Settings" isActive={pathname === '/settings'}>
                  <Settings />
                  <span>Settings</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link href="/login">
                <SidebarMenuButton tooltip="Logout">
                  <LogOut />
                  <span>Logout</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-3 p-2">
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={userAvatar?.imageUrl}
                alt="User Avatar"
                data-ai-hint={userAvatar?.imageHint}
              />
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">
                Admin Driver
              </span>
              <span className="truncate text-xs text-muted-foreground">
                admin@cocosales.ai
              </span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur-sm md:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="flex-1">
            {/* Can add breadcrumbs or page title here */}
          </div>
        </header>
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </SidebarInset>
      <VoiceCommandButton />
      {isMobile && <BottomNavBar menuItems={menuItems} />}
    </SidebarProvider>
  );
}
