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
import { clients as initialClients } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { MapPin, Phone, Edit, Plus } from 'lucide-react';
import Link from 'next/link';
import { ClientDialog } from '@/components/common/ClientDialog';
import type { Client } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function ClientsPage() {
  const [clients, setClients] = useState(initialClients);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const router = useRouter();

  const handleAddClick = () => {
    setSelectedClient(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    setSelectedClient(client);
    setIsDialogOpen(true);
  };

  const handleSaveClient = (clientData: Omit<Client, 'id' | 'balance_due' | 'pricing_overrides'>) => {
    if (selectedClient) {
      // Edit existing client
      setClients(
        clients.map((c) =>
          c.id === selectedClient.id ? { ...c, ...clientData } : c
        )
      );
    } else {
      // Add new client
      const newClient: Client = {
        id: `client-${Date.now()}`,
        balance_due: 0,
        pricing_overrides: {},
        ...clientData,
      };
      setClients([newClient, ...clients]);
    }
  };
  
  const handleNavigate = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(googleMapsUrl, '_blank');
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Clients</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleAddClick}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clients.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>No clients found.</p>
              <Button variant="link" onClick={handleAddClick}>Add your first client</Button>
            </CardContent>
          </Card>
        )}
        {clients.map((client) => (
          <Card key={client.id} className="cursor-pointer hover:bg-card/80" onClick={() => router.push(`/clients/${client.id}`)}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {client.name}
                <Button variant="ghost" size="icon" onClick={(e) => handleEditClick(e, client)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                Balance Due:{' '}
                <span
                  className={
                    client.balance_due > 0 ? 'text-accent' : 'text-primary'
                  }
                >
                  ${client.balance_due.toFixed(2)}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{client.address_data.formatted_address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{client.contact_phone}</span>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" className="w-full" onClick={(e) => handleNavigate(e, client.address_data.formatted_address)}>
                Navigate
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      <ClientDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        client={selectedClient}
        onSave={handleSaveClient}
      />
    </div>
  );
}
