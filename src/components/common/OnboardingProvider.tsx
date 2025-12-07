
'use client';

import { createContext, useContext, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Client, Product, Provider } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';

const OnboardingContext = createContext<{ isSetupComplete: boolean }>({ isSetupComplete: false });

/**
 * Hook to access the onboarding context.
 *
 * @returns The onboarding context value, including whether setup is complete.
 */
export function useOnboarding() {
  return useContext(OnboardingContext);
}

const ONBOARDING_SETUP_PATHS = ['/providers', '/clients', '/inventory', '/settings'];

/**
 * A provider component that manages the user's onboarding status.
 * Checks if the user has completed the necessary setup steps (added providers, products, and clients).
 * Redirects the user to the onboarding page or login page as appropriate.
 *
 * @param props - The component props.
 * @param props.children - The child components.
 * @returns The OnboardingProvider component.
 */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const pathname = usePathname();

  const clientsCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'clients');
  }, [firestore, user]);
  const { data: clients, isLoading: isClientsLoading } = useCollection<Client>(clientsCollection);

  const productsCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'products');
  }, [firestore, user]);
  const { data: products, isLoading: isProductsLoading } = useCollection<Product>(productsCollection);

  const providersCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'providers');
  }, [firestore, user]);
  const { data: providers, isLoading: isProvidersLoading } = useCollection<Provider>(providersCollection);

  const isLoading = isClientsLoading || isProductsLoading || isProvidersLoading;
  
  const isSetupComplete = !!(clients && products && providers && clients.length > 0 && products.length > 0 && providers.length > 0);

  useEffect(() => {
    if (isUserLoading) { // Wait until user status is known
      return;
    }
    
    const isAuthPage = pathname === '/login';
    const isOnboardingPage = pathname === '/onboarding';
    
    // Allow access to setup pages even if setup is not complete
    const isAllowedDuringOnboarding = ONBOARDING_SETUP_PATHS.includes(pathname);

    if (!user && !isAuthPage) {
        router.replace('/login');
        return;
    }

    if(user && !isLoading) {
        // If setup is not complete, and the user is not on a permitted page, redirect to onboarding.
        if (!isSetupComplete && !isAuthPage && !isOnboardingPage && !isAllowedDuringOnboarding) {
          router.replace('/onboarding');
        } 
        // If setup is complete and the user lands on the onboarding page, redirect them to the dashboard.
        else if (isSetupComplete && isOnboardingPage) {
          router.replace('/');
        }
    }

  }, [isLoading, isSetupComplete, user, isUserLoading, pathname, router]);

  const isAuthRelatedPage = pathname === '/login' || pathname === '/onboarding';
  // Show a global loader only while we are confirming user auth state
  if (isUserLoading && !isAuthRelatedPage) {
    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <p className="text-muted-foreground">Loading application...</p>
        </div>
    );
  }

  return (
    <OnboardingContext.Provider value={{ isSetupComplete }}>
      {children}
    </OnboardingContext.Provider>
  );
}
