'use client';

import { useState } from 'react';
import {
  collection,
  doc,
} from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Phone, Edit, Plus } from 'lucide-react';
import type { Provider } from '@/lib/types';
import { ProviderDialog } from '@/components/common/ProviderDialog';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';

export default function ProvidersPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const providersCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'providers');
  }, [firestore, user]);

  const { data: providers, isLoading } = useCollection<Provider>(providersCollection);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  const handleAddClick = () => {
    setSelectedProvider(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (provider: Provider) => {
    setSelectedProvider(provider);
    setIsDialogOpen(true);
  };

  const handleSaveProvider = (providerData: Omit<Provider, 'id'>) => {
     if (!providersCollection || !firestore) return;

    if (selectedProvider) {
      // Edit existing provider
      const providerRef = doc(firestore, 'providers', selectedProvider.id);
      updateDocumentNonBlocking(providerRef, providerData);
    } else {
      // Add new provider
      addDocumentNonBlocking(providersCollection, providerData);
    }
  };
  
  const handleNavigate = (e: React.MouseEvent, lat: number, lng: number) => {
    e.stopPropagation();
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(googleMapsUrl, '_blank');
  };

  const showLoading = isLoading || isUserLoading;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Providers</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleAddClick} disabled={showLoading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        </div>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {showLoading && <p>Loading providers...</p>}
        {!showLoading && providers && providers.length === 0 && (
          <Card className="md:col-span-2 lg:grid-cols-3">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>No providers found.</p>
              <Button variant="link" onClick={handleAddClick}>Add your first provider</Button>
            </CardContent>
          </Card>
        )}
        {providers && providers.map((provider) => (
          <Card key={provider.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {provider.name}
                <Button variant="ghost" size="icon" onClick={() => handleEditClick(provider)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>{provider.address_data.formatted_address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{provider.contact_phone}</span>
              </div>
            </CardContent>
             <CardFooter className="gap-2">
                <Button variant="outline" className="w-full" onClick={(e) => handleNavigate(e, provider.address_data.lat, provider.address_data.lng)}>
                    Navigate
                </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      <ProviderDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        provider={selectedProvider}
        onSave={handleSaveProvider}
      />
    </div>
  );
}
