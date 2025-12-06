
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
import { useState } from 'react';
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

  // STAGE 1: Memoize the client document reference.
  // It will be null until both firestore and clientId are available.
  const clientRef = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);
  
  // STAGE 2: Fetch the client document using the memoized reference.
  // The hook will wait until clientRef is not null.
  const { data: client, isLoading: isClientLoading } = useDoc<Client>(clientRef);

  // STAGE 3: Memoize the transactions query.
  // It will be null until firestore and clientId are available.
  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    return query(collection(firestore, 'transactions'), where('clientId', '==', clientId));
  }, [firestore, clientId]);

  // STAGE 4: Fetch the transactions using the memoized query.
  const { data: clientTransactions, isLoading: isTransactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const handleSaveClient = (clientData: Omit<Client, 'id' | 'balance_due'>) => {
    if (!clientRef) return;
    updateDocumentNonBlocking(clientRef, clientData);
  };
  
  // --- Definitive Loading Logic ---
  // The page is in a loading state if we are still verifying the user's auth status,
  // or if we have started fetching the client but haven't finished yet.
  const isLoading = isUserLoading || isClientLoading;

  // --- Definitive 404 Logic ---
  // ONLY show a 404 page if ALL loading is complete AND the client data is null.
  // This prevents showing a 404 prematurely.
  if (!isLoading && !client) {
    notFound();
  }

  // Show a loading screen while authentication or critical data fetching is in progress.
  if (isLoading) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
            <p className="text-muted-foreground">Loading client details...</p>
        </div>
    );
  }
  
  // If we reach this point, it is guaranteed that `isLoading` is false and `client` exists.
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

    