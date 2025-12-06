'use client';

import { createContext, useContext, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Client, Product, Provider } from '@/lib/types';
import { usePathname, useRouter } from 'next/navigation';

const OnboardingContext = createContext<boolean>(false);

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const pathname = usePathname();

  const clientsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'clients') : null, [firestore]);
  const { data: clients, isLoading: isClientsLoading } = useCollection<Client>(clientsCollection);

  const productsCollection = useMemoFirebase(() => firestore ? collection(firestore, 'products') : null, [firestore]);
  const { data: products, isLoading: isProductsLoading } = useCollection<Product>(productsCollection);

  const providersCollection = useMemoFirebase(() => firestore ? collection(firestore, 'providers') : null, [firestore]);
  const { data: providers, isLoading: isProvidersLoading } = useCollection<Provider>(providersCollection);

  const isLoading = isUserLoading || isClientsLoading || isProductsLoading || isProvidersLoading;
  
  const isSetupComplete = !!(clients && products && providers && clients.length > 0 && products.length > 0 && providers.length > 0);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }
    
    const isAuthPage = pathname === '/login' || pathname === '/onboarding';

    if (!isSetupComplete && !isAuthPage) {
      router.replace('/onboarding');
    } else if (isSetupComplete && pathname === '/onboarding') {
      router.replace('/');
    }
  }, [isLoading, isSetupComplete, user, pathname, router]);

  if (isLoading) {
    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <p className="text-muted-foreground">Loading application...</p>
        </div>
    );
  }

  return (
    <OnboardingContext.Provider value={isSetupComplete}>
      {children}
    </OnboardingContext.Provider>
  );
}
