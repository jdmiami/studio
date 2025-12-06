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
import type { Provider } from '@/lib/types';
import { useEffect, useTransition } from 'react';
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
import { verifyAddress } from '@/ai/flows/maps-based-address-verification';
import { Loader2 } from 'lucide-react';

const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  contact_phone: z.string().min(1, 'Phone number is required'),
  address_data: z.object({
    formatted_address: z.string().min(1, 'Address is required'),
    lat: z.number(),
    lng: z.number(),
  }),
});

type ProviderFormValues = z.infer<typeof providerSchema>;

type ProviderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: Provider | null;
  onSave: (provider: ProviderFormValues) => void;
};

export function ProviderDialog({
  open,
  onOpenChange,
  provider,
  onSave,
}: ProviderDialogProps) {
  const { toast } = useToast();
  const [isVerifying, startVerificationTransition] = useTransition();
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: '',
      contact_phone: '',
      address_data: {
        formatted_address: '',
        lat: 0,
        lng: 0,
      }
    },
  });

  useEffect(() => {
    if (open && provider) {
      form.reset(provider);
    } else if (open && !provider) {
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
  }, [provider, open, form]);

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

  const handleSubmit = (values: ProviderFormValues) => {
    onSave(values);
    toast({
      title: provider ? 'Provider Updated' : 'Provider Created',
      description: `Provider "${values.name}" has been successfully saved.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {provider ? 'Edit Provider' : 'Add New Provider'}
          </DialogTitle>
          <DialogDescription>
            {provider
              ? 'Edit the details of the existing provider.'
              : 'Enter the details for the new provider.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Juan's Farm" />
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
                        placeholder="e.g., 123 Farm Rd, Homestead, FL"
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
                    <Input {...field} placeholder="e.g., 305-555-1234" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Save Provider</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
