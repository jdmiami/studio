
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Home,
  LogIn,
  LogOut,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Building,
  FileText,
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
import { VoiceCommandButton } from './VoiceCommandButton';
import { Logo } from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { BottomNavBar } from './BottomNavBar';
import { useAuth, useUser } from '@/firebase';

/**
 * The main application shell component.
 * It provides the sidebar navigation, header, and main content area.
 * It also handles responsiveness for mobile devices using a bottom navigation bar.
 *
 * @param props - The component props.
 * @param props.children - The content to be rendered within the shell.
 * @returns The AppShell component.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const isAuthPage = pathname === '/login' || pathname === '/onboarding';

  if (isAuthPage) {
    return <>{children}</>;
  }
  
  const menuItems = [
    { href: '/', label: 'Feed', icon: Home },
    { href: '/invoices', label: 'Invoices', icon: FileText },
    { href: '/inventory', label: 'Inventory', icon: Boxes },
    { href: '/clients', label: 'Clients', icon: Users },
    { href: '/sales', label: 'New Sale', icon: ShoppingCart },
    { href: '/restocks', label: 'Restocks', icon: Truck },
    { href: '/providers', label: 'Providers', icon: Building },
  ];

  const handleLogout = () => {
    auth.signOut();
  };

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
              {user ? (
                 <SidebarMenuButton tooltip="Logout" onClick={handleLogout}>
                  <LogOut />
                  <span>Logout</span>
                </SidebarMenuButton>
              ) : (
                <Link href="/login">
                  <SidebarMenuButton tooltip="Login">
                    <LogIn />
                    <span>Login</span>
                  </SidebarMenuButton>
                </Link>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-3 p-2">
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={user?.photoURL || undefined}
                alt="User Avatar"
              />
              <AvatarFallback>{user?.email?.[0]?.toUpperCase() || 'A'}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">
                {isUserLoading ? 'Loading...' : user ? (user.isAnonymous ? 'Anonymous' : user.email) : 'Not Signed In'}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user && !user.isAnonymous && user.email === 'cocoyou305@gmail.com' ? 'Admin' : 'Driver'}
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
