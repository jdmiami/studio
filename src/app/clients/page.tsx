
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
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Plus, Eye } from 'lucide-react';
import { ClientDialog } from '@/components/common/ClientDialog';
import type { Client } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function ClientsPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const clientsCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'clients');
  }, [firestore, user]);

  const { data: clients, isLoading } = useCollection<Client>(clientsCollection);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const router = useRouter();

  const handleAddClick = () => {
    setSelectedClient(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (client: Client) => {
    setSelectedClient(client);
    setIsDialogOpen(true);
  };

  const handleSaveClient = (clientData: Omit<Client, 'id' | 'balance_due'>) => {
    if (!clientsCollection || !firestore) return;

    if (selectedClient) {
      // Edit existing client
      const clientRef = doc(firestore, 'clients', selectedClient.id);
      updateDocumentNonBlocking(clientRef, clientData);
    } else {
      // Add new client
      addDocumentNonBlocking(clientsCollection, {
        ...clientData,
        balance_due: 0,
      });
    }
  };
  
  const showLoading = isLoading || isUserLoading;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Clients</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleAddClick} disabled={showLoading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </div>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>All Clients</CardTitle>
          <CardDescription>A list of all your clients.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead className="w-[140px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    Loading clients...
                  </TableCell>
                </TableRow>
              )}
              {!showLoading && clients?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No clients found.
                  </TableCell>
                </TableRow>
              )}
              {clients?.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.contact_phone}</TableCell>
                  <TableCell className={`text-right font-semibold ${client.balance_due > 0 ? 'text-accent' : ''}`}>
                    ${client.balance_due.toFixed(2)}
                  </TableCell>
                  <TableCell className="flex justify-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => router.push(`/clients/${client.id}`)}>
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">View Client</span>
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleEditClick(client)}>
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit Client</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <ClientDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        client={selectedClient}
        onSave={handleSaveClient}
      />
    </div>
  );
}
