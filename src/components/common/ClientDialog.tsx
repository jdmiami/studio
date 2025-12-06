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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/lib/types';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
import { verifyAddress, type VerifyAddressOutput } from '@/ai/flows/maps-based-address-verification';
import { Loader2 } from 'lucide-react';

const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  contact_phone: z.string().min(1, 'Phone number is required'),
  address_data: z.object({
    formatted_address: z.string().min(1, 'Address is required'),
    lat: z.number(),
    lng: z.number(),
  }),
});

type ClientFormValues = z.infer<typeof clientSchema>;

type ClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSave: (client: ClientFormValues) => void;
};

export function ClientDialog({
  open,
  onOpenChange,
  client,
  onSave,
}: ClientDialogProps) {
  const { toast } = useToast();
  const [isVerifying, startVerificationTransition] = useTransition();

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
    },
  });

  useEffect(() => {
    if (open && client) {
      form.reset({
        name: client.name,
        contact_phone: client.contact_phone,
        address_data: client.address_data,
      });
    } else if (open && !client) {
      form.reset({
        name: '',
        contact_phone: '',
        address_data: {
          formatted_address: '',
          lat: 0,
          lng: 0,
        },
      });
    }
  }, [client, open, form]);

  const handleVerifyAddress = () => {
    const addressQuery = form.getValues('address_data.formatted_address');
    if (!addressQuery) {
      form.setError('address_data.formatted_address', { type: 'manual', message: 'Please enter an address to verify.' });
      return;
    }
    startVerificationTransition(async () => {
      try {
        const result = await verifyAddress({ query: addressQuery });
        form.setValue('address_data.formatted_address', result.formatted_address, { shouldValidate: true });
        form.setValue('address_data.lat', result.lat);
        form.setValue('address_data.lng', result.lng);
        toast({
          title: 'Address Verified',
          description: result.formatted_address,
        });
      } catch (error) {
        console.error('Address verification failed:', error);
        form.setError('address_data.formatted_address', { type: 'manual', message: 'Could not verify address. Please check it and try again.' });
        toast({
          variant: 'destructive',
          title: 'Verification Failed',
          description: 'Could not verify the address.',
        });
      }
    });
  };


  const handleSubmit = (values: ClientFormValues) => {
    onSave(values);
    toast({
      title: client ? 'Client Updated' : 'Client Created',
      description: `Client "${values.name}" has been successfully saved.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
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
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
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
                    <div className="flex gap-2">
                       <Input
                        {...field}
                        placeholder="e.g., 123 Main St, Miami, FL"
                      />
                       <Button type="button" onClick={handleVerifyAddress} disabled={isVerifying} variant="outline">
                        {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                      </Button>
                    </div>
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
            <DialogFooter>
              <Button type="submit">Save Client</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
