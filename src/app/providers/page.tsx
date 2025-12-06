'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { providers as initialProviders } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { MapPin, Phone, Edit, Plus } from 'lucide-react';
import type { Provider } from '@/lib/types';
import { ProviderDialog } from '@/components/common/ProviderDialog';

export default function ProvidersPage() {
  const [providers, setProviders] = useState(initialProviders);
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
    if (selectedProvider) {
      setProviders(
        providers.map((p) =>
          p.id === selectedProvider.id ? { ...p, ...providerData } : p
        )
      );
    } else {
      const newProvider: Provider = {
        id: `prov-${Date.now()}`,
        ...providerData,
      };
      setProviders([newProvider, ...providers]);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Providers</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleAddClick}>
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {providers.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>No providers found.</p>
              <Button variant="link" onClick={handleAddClick}>Add your first provider</Button>
            </CardContent>
          </Card>
        )}
        {providers.map((provider) => (
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{provider.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{provider.contact_phone}</span>
              </div>
            </CardContent>
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
