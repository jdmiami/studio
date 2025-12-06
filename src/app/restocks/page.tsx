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
import { products } from "@/lib/placeholder-data";
import { useToast } from "@/hooks/use-toast";

export default function RestocksPage() {
  const { toast } = useToast();
  const [provider, setProvider] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');

  const handleAddToInventory = () => {
    if (!provider || !product || !quantity || !cost) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please fill out all the details for the restock.",
      });
      return;
    }

    console.log({
      provider,
      product,
      quantity,
      cost,
    });

    toast({
      title: "Restock Added",
      description: `${quantity} units of ${products.find(p => p.id === product)?.name} added to inventory from ${provider}.`,
    });

    // Reset form
    setProvider('');
    setProduct('');
    setQuantity('');
    setCost('');
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
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger id="provider" className="h-14 text-lg">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="juan-farm">Juan's Farm</SelectItem>
                    <SelectItem value="oviedo-coconuts">Oviedo Coconuts</SelectItem>
                  </SelectContent>
                </Select>
            </div>
             <div className="grid gap-3">
                <Label htmlFor="product">Product</Label>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger id="product" className="h-14 text-lg">
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                     {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-3">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" type="number" placeholder="0" className="h-14 text-lg" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                 <div className="grid gap-3">
                    <Label htmlFor="cost">Cost per Unit</Label>
                     <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input id="cost" type="number" placeholder="0.00" className="h-14 pl-7 text-lg" value={cost} onChange={(e) => setCost(e.target.value)} />
                    </div>
                </div>
            </div>
        </CardContent>
        <CardFooter>
            <Button className="h-14 w-full text-lg" onClick={handleAddToInventory}>Add to Inventory</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
