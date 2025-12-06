import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { clients } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';
import { MapPin, Phone, Edit } from 'lucide-react';
import Link from 'next/link';

export default function ClientsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Clients</h1>
         <div className="ml-auto flex items-center gap-2">
            <Button>Add Client</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Card key={client.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {client.name}
                <Button variant="ghost" size="icon">
                  <Edit className="h-4 w-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                Balance Due: 
                <span className={client.balance_due > 0 ? "text-accent" : "text-primary"}>
                  ${client.balance_due.toFixed(2)}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{client.address_data.formatted_address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{client.contact_phone}</span>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" className="w-full">
                Navigate
              </Button>
              <Button className="w-full">View Details</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
