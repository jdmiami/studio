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
import { useEffect } from 'react';
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

const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  contact_phone: z.string().min(1, 'Phone number is required'),
  address: z.string().min(1, 'Address is required'),
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
  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: '',
      contact_phone: '',
      address: '',
    },
  });

  useEffect(() => {
    if (provider) {
      form.reset(provider);
    } else {
      form.reset({
        name: '',
        contact_phone: '',
        address: '',
      });
    }
  }, [provider, form]);

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
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., 123 Farm Rd, Homestead, FL"
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
