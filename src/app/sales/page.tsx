'use client';

import { useState, useMemo } from 'react';
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Trash2 } from "lucide-react";
import { clients, products } from "@/lib/placeholder-data";
import { useToast } from '@/hooks/use-toast';

type LineItem = {
  id: number;
  productId: string;
  quantity: number;
  price: number;
};

export default function SalesPage() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: 1, productId: '', quantity: 1, price: 0 },
  ]);

  const handleAddItem = () => {
    setLineItems([...lineItems, { id: Date.now(), productId: '', quantity: 1, price: 0 }]);
  };

  const handleRemoveItem = (id: number) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const handleItemChange = (id: number, field: keyof Omit<LineItem, 'id'>, value: string | number) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'productId') {
          const product = products.find(p => p.id === value);
          updatedItem.price = product?.default_price || 0;
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const subtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
  }, [lineItems]);

  const tax = subtotal * 0.0; // Assuming 0% tax for now
  const total = subtotal + tax;

  const handleCreateInvoice = () => {
    if (!clientId || lineItems.some(item => !item.productId || item.quantity <= 0)) {
       toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select a client and ensure all line items are complete.",
      });
      return;
    }
    
    toast({
      title: "Invoice Created",
      description: `Successfully created invoice for ${clients.find(c => c.id === clientId)?.name}. Total: $${total.toFixed(2)}`,
    });

    // Reset form
    setClientId('');
    setLineItems([{ id: 1, productId: '', quantity: 1, price: 0 }]);
    setNotes('');
  };


  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
       <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">New Sale</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>Select a client and add items to the invoice.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-3">
                <Label htmlFor="client">Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger id="client" className="h-14 text-lg">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid gap-4">
                <Label>Items</Label>
                {lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 items-start gap-4">
                      <div className="col-span-5 grid gap-2">
                           <Select value={item.productId} onValueChange={(value) => handleItemChange(item.id, 'productId', value)}>
                            <SelectTrigger className="h-14 text-lg">
                              <SelectValue placeholder="Select Product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                      </div>
                      <div className="col-span-2 grid gap-2">
                          <Input type="number" placeholder="Qty" className="h-14 text-lg text-center" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)} min="1"/>
                      </div>
                      <div className="col-span-3 grid gap-2">
                          <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input type="number" placeholder="Price" className="h-14 pl-7 text-lg ring-accent focus-visible:ring-accent" value={item.price} onChange={e => handleItemChange(item.id, 'price', parseFloat(e.target.value) || 0)} />
                          </div>
                      </div>
                       <div className="col-span-2 grid gap-2">
                          <Button variant="ghost" size="icon" className="h-14 w-full text-muted-foreground hover:text-destructive" onClick={() => handleRemoveItem(item.id)} disabled={lineItems.length <= 1}>
                              <Trash2 className="h-6 w-6" />
                          </Button>
                      </div>
                  </div>
                ))}

                <Button variant="outline" className="h-14 text-lg" onClick={handleAddItem}>
                    <PlusCircle className="mr-2 h-5 w-5" /> Add Item
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                     <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tax</span>
                        <span>${tax.toFixed(2)}</span>
                    </div>
                     <Separator />
                     <div className="flex items-center justify-between font-semibold text-lg">
                        <span>Total</span>
                        <span className="text-primary">${total.toFixed(2)}</span>
                    </div>

                    <div className="grid gap-3">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea id="notes" placeholder="Add any notes for the client" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </CardContent>
                <CardFooter>
                     <Button className="h-14 w-full text-lg" onClick={handleCreateInvoice}>Create Invoice</Button>
                </CardFooter>
            </Card>
        </div>
      </div>
    </div>
  );
}
