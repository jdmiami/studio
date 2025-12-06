'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useFirestore, useMemoFirebase, useUser, addDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import type { Product, Provider } from "@/lib/types";

export default function RestocksPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const productsCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'products');
  }, [firestore, user]);
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsCollection);

  const providersCollection = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'providers');
  }, [firestore, user]);
  const { data: providers, isLoading: providersLoading } = useCollection<Provider>(providersCollection);

  const [providerId, setProviderId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showLoading = productsLoading || providersLoading || isUserLoading;

  const handleAddToInventory = async () => {
    if (!firestore) return;
    if (!providerId || !productId || !quantity || !cost) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please fill out all the details for the restock.",
      });
      return;
    }
    
    setIsSubmitting(true);

    const selectedProvider = providers?.find(p => p.id === providerId);
    const selectedProduct = products?.find(p => p.id === productId);
    const numQuantity = parseInt(quantity, 10);
    const numCost = parseFloat(cost);

    if (!selectedProvider || !selectedProduct) {
        toast({ variant: "destructive", title: "Invalid Selection", description: "Selected provider or product not found." });
        setIsSubmitting(false);
        return;
    }

    try {
        const batch = writeBatch(firestore);

        // 1. Create the restock transaction
        const transactionRef = doc(collection(firestore, "transactions"));
        batch.set(transactionRef, {
            type: 'restock',
            provider_id: selectedProvider.id,
            provider_name: selectedProvider.name,
            date: new Date(),
            status: 'delivered',
            total_amount: numQuantity * numCost,
            items: [{
                product_id: selectedProduct.id,
                product_name: selectedProduct.name,
                quantity: numQuantity,
                applied_price: numCost,
            }]
        });

        // 2. Create a new batch document
        const batchRef = doc(collection(firestore, `products/${selectedProduct.id}/batches`));
        batch.set(batchRef, {
            product_id: selectedProduct.id,
            provider_id: selectedProvider.id,
            quantity_remaining: numQuantity,
            cost_per_unit: numCost,
            received_at: serverTimestamp(),
        });
        
        // 3. Update the product's current stock
        const productRef = doc(firestore, 'products', selectedProduct.id);
        const newStock = (selectedProduct.current_stock || 0) + numQuantity;
        batch.update(productRef, { current_stock: newStock });

        await batch.commit();

        toast({
            title: "Restock Added",
            description: `${quantity} units of ${selectedProduct.name} added to inventory from ${selectedProvider.name}.`,
        });

        // Reset form
        setProviderId('');
        setProductId('');
        setQuantity('');
        setCost('');
    } catch (error) {
        console.error("Error adding restock:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not complete the restock operation." });
    } finally {
        setIsSubmitting(false);
    }
  };


  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
       <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">New Restock</h1>
      </div>

      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
            <CardTitle>Restock Details</CardTitle>
            <CardDescription>Add a new batch of products to your inventory.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
            <div className="grid gap-3">
                <Label htmlFor="provider">Provider</Label>
                <Select value={providerId} onValueChange={setProviderId} disabled={showLoading}>
                  <SelectTrigger id="provider" className="h-14 text-lg">
                    <SelectValue placeholder={showLoading ? "Loading providers..." : "Select a provider"} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers && providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>
             <div className="grid gap-3">
                <Label htmlFor="product">Product</Label>
                <Select value={productId} onValueChange={setProductId} disabled={showLoading}>
                  <SelectTrigger id="product" className="h-14 text-lg">
                    <SelectValue placeholder={showLoading ? "Loading products..." : "Select a product"} />
                  </SelectTrigger>
                  <SelectContent>
                     {products && products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-3">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" type="number" placeholder="0" className="h-14 text-lg" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={isSubmitting} />
                </div>
                 <div className="grid gap-3">
                    <Label htmlFor="cost">Cost per Unit</Label>                     <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input id="cost" type="number" placeholder="0.00" className="h-14 pl-7 text-lg" value={cost} onChange={(e) => setCost(e.target.value)} disabled={isSubmitting} />
                    </div>
                </div>
            </div>
        </CardContent>
        <CardFooter>
            <Button className="h-14 w-full text-lg" onClick={handleAddToInventory} disabled={isSubmitting || showLoading}>
                {isSubmitting ? "Adding..." : "Add to Inventory"}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
