
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Client, Product } from '@/lib/types';
import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';

const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  contact_phone: z.string().min(1, 'Phone number is required'),
  address_data: z.object({
    formatted_address: z.string().min(1, 'Address is required'),
    lat: z.number(),
    lng: z.number(),
  }),
  pricing_overrides: z.array(z.object({
    productId: z.string(),
    price: z.coerce.number().min(0, "Price can't be negative"),
  })),
});

type ClientFormValues = z.infer<typeof clientSchema>;

type ClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSave: (client: Omit<Client, 'id' | 'balance_due'>) => void;
};

export function ClientDialog({
  open,
  onOpenChange,
  client,
  onSave,
}: ClientDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const productsCollection = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'products');
  }, [firestore]);
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsCollection);

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      contact_phone: '',
      address_data: {
        formatted_address: '',
        lat: 0,
        lng: 0,
      },
      pricing_overrides: [],
    },
  });
  
  const { fields } = useFieldArray({
    control: form.control,
    name: "pricing_overrides",
  });

  useEffect(() => {
    // This effect ensures the form is reset with the correct client data
    // every time the dialog is opened or the client prop changes.
    if (open && products) {
        const overrides = products.map(p => {
            const existingOverride = client?.pricing_overrides?.[p.id];
            return {
                productId: p.id,
                name: p.name,
                default_price: p.default_price,
                price: existingOverride ?? p.default_price,
            };
        });
        
        if (client) {
            form.reset({
                name: client.name,
                contact_phone: client.contact_phone,
                address_data: client.address_data,
                pricing_overrides: overrides,
            });
        } else {
             form.reset({
                name: '',
                contact_phone: '',
                address_data: { formatted_address: '', lat: 0, lng: 0 },
                pricing_overrides: overrides.map(o => ({ productId: o.productId, price: o.default_price})),
            });
        }
    }
  }, [client, open, products, form]);


  const handleSubmit = (values: ClientFormValues) => {
    // Manually set lat/lng to 0 if they aren't provided, as verification is removed
    const submissionValues = {
        ...values,
        address_data: {
            ...values.address_data,
            lat: values.address_data.lat || 0,
            lng: values.address_data.lng || 0,
        },
        pricing_overrides: values.pricing_overrides.reduce((acc, item) => {
            const product = products?.find(p => p.id === item.productId);
            // Only save the override if it's different from the default price
            if (product && item.price !== product.default_price) {
                 acc[item.productId] = item.price;
            }
            return acc;
        }, {} as Record<string, number>),
    };

    onSave(submissionValues);
    toast({
      title: client ? 'Client Updated' : 'Client Created',
      description: `Client "${values.name}" has been successfully saved.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {client ? 'Edit Client' : 'Add New Client'}
          </DialogTitle>
          <DialogDescription>
            {client
              ? 'Edit the details of the existing client.'
              : 'Enter the details for the new client.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
            <ScrollArea className="h-[60vh] p-1">
              <div className="space-y-4 px-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Pura Vida" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address_data.formatted_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input
                            {...field}
                            placeholder="e.g., 123 Main St, Miami, FL"
                          />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., 555-123-4567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator className="my-4" />

                <div>
                    <h3 className="mb-4 text-lg font-medium">Pricing Overrides</h3>
                    <div className="space-y-4">
                        {productsLoading && <p>Loading products...</p>}
                        {fields.map((field, index) => {
                            const product = products?.find(p => p.id === field.productId);
                            return (
                                <FormField
                                    key={field.id}
                                    control={form.control}
                                    name={`pricing_overrides.${index}.price`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm">{product?.name}</FormLabel>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    Default: ${product?.default_price.toFixed(2)}
                                                </span>
                                                <FormControl>
                                                    <div className="relative flex-1">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                                        <Input {...field} type="number" step="0.01" className="pl-7" />
                                                    </div>
                                                </FormControl>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            );
                        })}
                    </div>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="border-t pt-4">
              <Button type="submit">Save Client</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
