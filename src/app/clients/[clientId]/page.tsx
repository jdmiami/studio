
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

  // STAGE 1: Wait for user to be authenticated before creating a document reference.
  const clientRef = useMemoFirebase(() => {
    // Only create the ref if we have firestore and a clientId.
    // The useMemoFirebase hook will add the dependency on `user` and `isUserLoading`,
    // so this will re-evaluate and return a ref only when the user is logged in.
    if (!firestore || !clientId) return null;
    return doc(firestore, 'clients', clientId);
  }, [firestore, clientId]);
  
  // STAGE 2: Start fetching the client document ONLY after clientRef is created.
  const { data: client, isLoading: isClientLoading, error: clientError } = useDoc<Client>(clientRef);

  // STAGE 3: Start fetching transactions ONLY after clientRef is created.
  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !clientId) return null;
    // Corrected to use 'clientId' as per the data model.
    return query(collection(firestore, 'transactions'), where('clientId', '==', clientId));
  }, [firestore, clientId]);

  const { data: clientTransactions, isLoading: isTransactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const handleSaveClient = (clientData: Omit<Client, 'id' | 'balance_due'>) => {
    if (!clientRef) return;
    updateDocumentNonBlocking(clientRef, clientData);
  };
  
  // --- The Definitive Loading Logic ---
  // The final loading state is true if ANY of these are true:
  // 1. We are still checking the user's auth status.
  // 2. We are still loading the main client document.
  const isLoading = isUserLoading || isClientLoading;

  // We must wait for ALL loading to be complete before deciding to show a 404 page.
  // If isLoading is false, it means we have a definitive answer from the database.
  // If the answer is that `client` is null (doesn't exist), THEN we can show the 404.
  if (!isLoading && !client) {
    notFound();
  }

  // Show a loading screen as long as ANY of the critical data is still loading.
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
