'use client';

import { useParams } from 'next/navigation';
import { clients, transactions as allTransactions } from '@/lib/placeholder-data';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Mail, MapPin, Phone, Plus } from 'lucide-react';
import Link from 'next/link';
import { TransactionCard } from '@/components/common/TransactionCard';
import { notFound } from 'next/navigation';
import { useMemo } from 'react';

export default function ClientDetailsPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const client = useMemo(() => clients.find((c) => c.id === clientId), [clientId]);
  const clientTransactions = useMemo(
    () => allTransactions.filter((t) => t.type === 'sale' && t.client_id === clientId),
    [clientId]
  );

  if (!client) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center gap-4">
        <Link href="/clients">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-headline text-3xl font-semibold">{client.name}</h1>
        <div className="ml-auto flex items-center gap-2">
           <Link href="/sales">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Sale
            </Button>
          </Link>
          <Button variant="outline" size="icon">
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
                     {clientTransactions.length > 0 ? (
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
                        )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
