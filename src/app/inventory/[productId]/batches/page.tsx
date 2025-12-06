'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import type { Batch, Product } from '@/lib/types';
import { collection, doc } from 'firebase/firestore';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

function formatDate(date: any) {
    if (!date) return 'N/A';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return format(d, 'PPP p');
}


export default function ProductBatchesPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.productId as string;
  const firestore = useFirestore();

  const productRef = useMemoFirebase(() => {
    if (!firestore || !productId) return null;
    return doc(firestore, 'products', productId);
  }, [firestore, productId]);
  const { data: product, isLoading: isProductLoading } = useDoc<Product>(productRef);

  const batchesRef = useMemoFirebase(() => {
    if (!firestore || !productId) return null;
    return collection(firestore, `products/${productId}/batches`);
  }, [firestore, productId]);
  const { data: batches, isLoading: isBatchesLoading } = useCollection<Batch>(batchesRef);

  const isLoading = isProductLoading || isBatchesLoading;

  if (isLoading) {
      return <div className="p-8">Loading batch details...</div>
  }

  if (!product && !isLoading) {
      notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
            <p className="text-sm text-muted-foreground">Inventory Batches</p>
            <h1 className="font-headline text-3xl font-semibold">
                {product?.name}
            </h1>
        </div>
      </div>

       <Card>
        <CardHeader>
            <CardTitle>All Batches</CardTitle>
            <CardDescription>A record of all inventory batches for this product.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Received At</TableHead>
                    <TableHead>Provider ID</TableHead>
                    <TableHead className="text-right">Cost Per Unit</TableHead>
                    <TableHead className="text-right">Quantity Remaining</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isBatchesLoading && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center">Loading batches...</TableCell>
                        </TableRow>
                    )}
                    {!isBatchesLoading && batches && batches.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center">
                                <p className="p-4">No batches found for this product.</p>
                            </TableCell>
                        </TableRow>
                    )}
                    {batches && batches.map((batch) => (
                        <TableRow key={batch.id}>
                            <TableCell className="font-medium">{formatDate(batch.received_at)}</TableCell>
                            <TableCell>{batch.provider_id.substring(0, 7)}...</TableCell>
                             <TableCell className="text-right">${batch.cost_per_unit.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{batch.quantity_remaining}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
