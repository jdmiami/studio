
'use client';

import { useState } from 'react';
import {
  collection,
  query,
  where,
} from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Edit } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { Transaction } from '@/lib/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { InvoiceDialog } from '@/components/common/InvoiceDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"


function formatDate(date: Date | { seconds: number; nanoseconds: number }) {
    if (!date) return 'N/A';
    if (date instanceof Date) {
        return format(date, 'MMM d, yyyy');
    }
    // It's a Firestore Timestamp
    return format(new Date(date.seconds * 1000), 'MMM d, yyyy');
}

const statusVariant: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
    paid: 'secondary',
    delivered: 'default',
    draft: 'outline',
    void: 'destructive'
}

export default function InvoicesPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const invoicesCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'transactions'), where('type', '==', 'sale'));
  }, [firestore, user]);

  const { data: invoices, isLoading } = useCollection<Transaction>(invoicesCollection);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(null);

  const handleEditClick = (invoice: Transaction) => {
    setSelectedInvoice(invoice);
    setIsDialogOpen(true);
  };
  
  const showLoading = isLoading || isUserLoading;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Invoices</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/sales">
            <Button disabled={showLoading}>
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>All Sales</CardTitle>
            <CardDescription>A list of all your sales invoices.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {showLoading && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center">Loading invoices...</TableCell>
                        </TableRow>
                    )}
                    {!showLoading && invoices && invoices.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center">
                                <p className="p-4">No invoices found.</p>
                                <Link href="/sales"><Button variant="link">Create your first invoice</Button></Link>
                            </TableCell>
                        </TableRow>
                    )}
                    {invoices && invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.invoice_number || invoice.id.substring(0,6)}</TableCell>
                            <TableCell>{invoice.client_name}</TableCell>
                            <TableCell>{formatDate(invoice.date)}</TableCell>
                            <TableCell>
                                <Badge variant={statusVariant[invoice.status] || 'default'} className="capitalize">{invoice.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">${invoice.total_amount.toFixed(2)}</TableCell>
                            <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => handleEditClick(invoice)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
      
      <InvoiceDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        invoice={selectedInvoice}
      />
    </div>
  );
}
