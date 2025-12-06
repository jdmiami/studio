'use client';

import { createContext, useContext, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Client, Product, Provider } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';

const OnboardingContext = createContext<{ isSetupComplete: boolean }>({ isSetupComplete: false });

export function useOnboarding() {
  return useContext(OnboardingContext);
}

const ONBOARDING_SETUP_PATHS = ['/providers', '/clients', '/inventory', '/settings'];

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

  const isLoading = isUserLoading || isClientsLoading || isProductsLoading || isProvidersLoading;
  
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
  // Show a global loader only if we are not on an auth page and still loading critical data
  if (isLoading && !isAuthRelatedPage) {
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
