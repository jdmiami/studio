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
import { MapPin, Phone, Edit } from 'lucide-react';
import Link from 'next/link';
import { ClientDialog } from '@/components/common/ClientDialog';
import type { Client } from '@/lib/types';

export default function ClientsPage() {
  const [clients, setClients] = useState(initialClients);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const handleAddClick = () => {
    setSelectedClient(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (client: Client) => {
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
  
  const handleNavigate = (address: string) => {
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(googleMapsUrl, '_blank');
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Clients</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleAddClick}>Add Client</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Card key={client.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {client.name}
                <Button variant="ghost" size="icon" onClick={() => handleEditClick(client)}>
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
              <Button variant="outline" className="w-full" onClick={() => handleNavigate(client.address_data.formatted_address)}>
                Navigate
              </Button>
              <Button className="w-full" disabled>View Details</Button>
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
