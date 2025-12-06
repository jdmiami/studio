'use client';

import Image from 'next/image';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { ProductDialog } from '@/components/common/ProductDialog';
import { Edit, Plus } from 'lucide-react';
import type { Product } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import Link from 'next/link';

export default function InventoryPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const productsCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'products');
  }, [firestore, user]);

  const { data: products, isLoading } = useCollection<Product>(productsCollection);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const handleAddClick = () => {
    setSelectedProduct(null);
    setIsDialogOpen(true);
  };
  
  const handleEditClick = (product: Product) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
  };

  const handleSaveProduct = (
    productData: Omit<Product, 'id' | 'current_stock'>
  ) => {
    if (!productsCollection || !firestore) return;

    if (selectedProduct) {
      // Edit existing product
      const productRef = doc(firestore, 'products', selectedProduct.id);
      updateDocumentNonBlocking(productRef, productData);
    } else {
      // Add new product
      addDocumentNonBlocking(productsCollection, {
        ...productData,
        current_stock: 0,
      });
    }
  };

  const showLoading = isLoading || isUserLoading;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Inventory</h1>
        <div className="ml-auto">
          <Button onClick={handleAddClick} disabled={showLoading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {showLoading && <p>Loading products...</p>}
      
      {!showLoading && products && products.length === 0 ? (
         <Card className="md:col-span-2 lg:col-span-3 xl:col-span-4">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>No products in inventory.</p>
              <Button variant="link" onClick={handleAddClick}>Add your first product</Button>
            </CardContent>
          </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products && products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {product.name}
                  <Button variant="ghost" size="icon" onClick={() => handleEditClick(product)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </CardTitle>
                <CardDescription>
                  Default Price: ${product.default_price.toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative aspect-video w-full overflow-hidden rounded-md">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    data-ai-hint="product image"
                  />
                </div>
                <div className="flex items-baseline justify-center text-center">
                  <p className="text-6xl font-bold tracking-tighter">
                    {product.current_stock}
                  </p>
                  <span className="ml-1 text-xl text-muted-foreground">
                    {product.unit}s
                  </span>
                </div>
              </CardContent>
              <CardFooter>
                <Link href={`/inventory/${product.id}/batches`} className="w-full">
                  <Button variant="outline" className="w-full">
                    View Batches
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
       <ProductDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        product={selectedProduct}
        onSave={handleSaveProduct}
      />
    </div>
  );
}
