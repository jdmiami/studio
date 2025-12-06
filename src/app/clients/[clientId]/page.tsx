'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, MapPin, Phone, Plus } from 'lucide-react';
import Link from 'next/link';
import { TransactionCard } from '@/components/common/TransactionCard';
import { notFound } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ClientDialog } from '@/components/common/ClientDialog';
import type { Client, Transaction } from '@/lib/types';
import { useCollection, useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking, useUser } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';

export default function ClientDetailsPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const router = useRouter();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);

  const { data: client, isLoading: isClientLoading } = useDoc<Client>(clientRef);

  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return query(collection(firestore, 'transactions'), where('clientId', '==', clientId));
  }, [firestore, clientId]);

  const { data: clientTransactions, isLoading: isTransactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const handleSaveClient = (clientData: Omit<Client, 'id' | 'balance_due'>) => {
    if (!clientRef) return;
    updateDocumentNonBlocking(clientRef, clientData);
  };
  
  const isLoading = isUserLoading || isClientLoading;

  // We must wait for both user and client data to finish loading before rendering.
  if (isLoading) {
    return <div className="p-8">Loading client details...</div>;
  }

  // After loading is complete, if the client is still not found, then show the 404 page.
  if (!client) {
    notFound();
  }


  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-headline text-3xl font-semibold">{client.name}</h1>
        <div className="ml-auto flex items-center gap-2">
           <Link href="/sales">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Sale
            </Button>
          </Link>
          <Button variant="outline" size="icon" onClick={() => setIsDialogOpen(true)}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Contact Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex items-start gap-3 text-sm">
                        <MapPin className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                        <span>{client.address_data.formatted_address}</span>
                    </div>
                     <div className="flex items-center gap-3 text-sm">
                        <Phone className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                        <span>{client.contact_phone}</span>
                    </div>
                </CardContent>
            </Card>
        </div>
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                     {isTransactionsLoading ? <p className="p-6 text-muted-foreground">Loading transactions...</p> : 
                     (clientTransactions && clientTransactions.length > 0 ? (
                        <div className="space-y-4">
                            {clientTransactions.map((transaction) => (
                            <TransactionCard key={transaction.id} transaction={transaction} />
                            ))}
                        </div>
                        ) : (
                        <div className="p-6 pt-0 text-center text-muted-foreground">
                            <p>No transactions for this client yet.</p>
                            <Link href="/sales"><Button variant="link">Create a sale</Button></Link>
                        </div>
                        ))}
                </CardContent>
            </Card>
        </div>
      </div>

       <ClientDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        client={client}
        onSave={handleSaveClient}
      />
    </div>
  );
}

    