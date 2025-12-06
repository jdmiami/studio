import type { Transaction, Timestamp } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Truck, Trash2, User, Building } from 'lucide-react';
import { format } from 'date-fns';

const typeDetails = {
  sale: { icon: ShoppingCart, color: 'text-green-400' },
  restock: { icon: Truck, color: 'text-blue-400' },
  waste: { icon: Trash2, color: 'text-orange-400' },
};

function formatDate(date: Date | Timestamp) {
    if (date instanceof Date) {
        return format(date, 'MMM d, yyyy');
    }
    // It's a Firestore Timestamp
    return format(new Date(date.seconds * 1000), 'MMM d, yyyy');
}


export function TransactionCard({ transaction }: { transaction: Transaction }) {
  const { type, status, total_amount, date } = transaction;
  const details = typeDetails[type];
  const Icon = details.icon;

  const renderTitle = () => {
    switch (type) {
      case 'sale':
        return (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Sale to {transaction.client_name}</span>
          </div>
        );
      case 'restock':
        return (
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span>Restock from {transaction.provider_name}</span>
          </div>
        );
      case 'waste':
        return <span>Wasted items</span>;
      default:
        return 'Transaction';
    }
  };

  return (
    <div className="relative px-8 py-4">
      <div className="absolute left-0 top-0 flex h-full w-8 items-center justify-center">
        <Icon className={`h-6 w-6 ${details.color}`} />
      </div>
       <div className="absolute left-4 top-10 h-[calc(100%-2.5rem)] w-px bg-border"></div>

      <div className="flex items-center justify-between">
        <div className="font-medium">{renderTitle()}</div>
        <div className="text-sm text-muted-foreground">{formatDate(date)}</div>
      </div>
      <div className="mt-2 flex items-end justify-between">
         <div className="text-sm text-muted-foreground">
          {transaction.items.map(item => `${item.quantity} x ${item.product_name}`).join(', ')}
        </div>
        <div className="flex items-center gap-4">
            <Badge variant={status === 'paid' || status === 'delivered' ? 'secondary' : 'outline'} className="capitalize">{status}</Badge>
            <div className={`text-lg font-semibold ${type === 'restock' || type === 'waste' ? 'text-orange-400' : 'text-primary'}`}>
                {type === 'sale' ? '+' : '-'}${total_amount.toFixed(2)}
            </div>
        </div>
      </div>
    </div>
  );
}
