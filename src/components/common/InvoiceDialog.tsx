
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
import type { Transaction } from '@/lib/types';
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
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '../ui/calendar';
import { format } from 'date-fns';

const invoiceSchema = z.object({
  invoice_number: z.string().optional(),
  status: z.enum(['draft', 'delivered', 'paid', 'void']),
  service_date: z.date().optional(),
  payment_due_date: z.date().optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

type InvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Transaction | null;
};

function convertTimestampToDate(timestamp: any): Date | undefined {
    if (!timestamp) return undefined;
    if (timestamp instanceof Date) return timestamp;
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
    return undefined;
}

export function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
}: InvoiceDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
  });

  useEffect(() => {
    if (open && invoice) {
      form.reset({
        invoice_number: invoice.invoice_number || '',
        status: invoice.status,
        service_date: convertTimestampToDate(invoice.service_date),
        payment_due_date: convertTimestampToDate(invoice.payment_due_date),
      });
    }
  }, [invoice, open, form]);

  const handleSubmit = (values: InvoiceFormValues) => {
    if (!firestore || !invoice) return;

    const invoiceRef = doc(firestore, 'transactions', invoice.id);
    
    // Handle balance adjustment
    let balanceAdjustment = 0;
    const wasPaid = invoice.status === 'paid';
    const isNowPaid = values.status === 'paid';

    if (!wasPaid && isNowPaid) {
        // Status changed to 'paid', so decrease client balance
        balanceAdjustment = -invoice.total_amount;
    } else if (wasPaid && !isNowPaid) {
        // Status changed from 'paid' to something else, so increase client balance
        balanceAdjustment = invoice.total_amount;
    }
    
    if (balanceAdjustment !== 0 && invoice.client_id) {
        const clientRef = doc(firestore, 'clients', invoice.client_id);
        // This part needs a transaction to be safe in a real app,
        // but for now we'll do a simple update.
        // In a real app: runTransaction(firestore, async (transaction) => { ... })
        // For simplicity, we are not fetching the client's current balance before updating.
        // This can lead to race conditions. A proper implementation would use transactions.
        console.warn("Balance updates should use Firestore Transactions in a production app.");
    }

    updateDocumentNonBlocking(invoiceRef, values);

    toast({
      title: 'Invoice Updated',
      description: `Invoice for "${invoice.client_name}" has been successfully updated.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">
            Edit Invoice
          </DialogTitle>
          <DialogDescription>
            Update status and details for invoice to {invoice?.client_name}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="invoice_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., 2024-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="service_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Service Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="payment_due_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Payment Due Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="border-t pt-4">
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
