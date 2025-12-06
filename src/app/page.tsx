'use client';

import { TransactionCard } from '@/components/common/TransactionCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import type { Client, Product, Transaction } from '@/lib/types';
import { collection } from 'firebase/firestore';
import { OnboardingGuide } from '@/components/common/OnboardingGuide';

export default function DashboardPage() {
  const firestore = useFirestore();

  const clientsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'clients');
  }, [firestore]);
  const { data: clients, isLoading: isClientsLoading } = useCollection<Client>(clientsCollection);

  const productsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'products');
  }, [firestore]);
  const { data: products, isLoading: isProductsLoading } = useCollection<Product>(productsCollection);

  const transactionsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'transactions');
  }, [firestore]);
  const { data: transactions, isLoading: isTransactionsLoading } = useCollection<Transaction>(transactionsCollection);

  const isLoading = isClientsLoading || isProductsLoading || isTransactionsLoading;

  const showOnboarding = !isLoading && (!clients || clients.length === 0) && (!products || products.length === 0);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      {showOnboarding ? (
        <OnboardingGuide />
      ) : (
        <>
          <div className="flex items-center">
            <h1 className="font-headline text-3xl font-semibold">Feed</h1>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/sales">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Sale
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                    <div className="p-6 pt-0 text-center text-muted-foreground">
                        <p>Loading transactions...</p>
                    </div>
                ) : transactions && transactions.length > 0 ? (
                  <div className="space-y-4">
                    {transactions.map((transaction) => (
                      <TransactionCard key={transaction.id} transaction={transaction} />
                    ))}
                  </div>
                ) : (
                  <div className="p-6 pt-0 text-center text-muted-foreground">
                    <p>No transactions yet.</p>
                    <Link href="/sales"><Button variant="link">Create your first sale</Button></Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <span className="text-muted-foreground">$</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$0.00</div>
                <p className="text-xs text-muted-foreground">
                  +0.0% from last month
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Sales
                </CardTitle>
                <span className="text-muted-foreground">#</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">+0</div>
                <p className="text-xs text-muted-foreground">
                  +0.0% from last month
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Invoices</CardTitle>
                <span className="text-muted-foreground">$</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$0.00</div>
                <p className="text-xs text-muted-foreground">
                  0 invoices awaiting payment
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active Clients
                </CardTitle>
                <span className="text-muted-foreground">
                  <UsersIcon className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clients?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Your client base
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
