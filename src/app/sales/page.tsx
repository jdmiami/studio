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

export default function SalesPage() {
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
                <Select>
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
                {/* Line Item */}
                <div className="grid grid-cols-12 items-start gap-4">
                    <div className="col-span-5 grid gap-2">
                         <Select>
                          <SelectTrigger className="h-14 text-lg">
                            <SelectValue placeholder="Select Product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                    </div>
                    <div className="col-span-2 grid gap-2">
                        <Input type="number" placeholder="Qty" className="h-14 text-lg text-center" defaultValue="1" />
                    </div>
                    <div className="col-span-3 grid gap-2">
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input type="number" placeholder="Price" className="h-14 pl-7 text-lg ring-accent focus-visible:ring-accent" defaultValue="5.00"/>
                        </div>
                    </div>
                     <div className="col-span-2 grid gap-2">
                        <Button variant="ghost" size="icon" className="h-14 w-full text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-6 w-6" />
                        </Button>
                    </div>
                </div>

                <Button variant="outline" className="h-14 text-lg">
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
                        <span>$5.00</span>
                    </div>
                     <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tax</span>
                        <span>$0.00</span>
                    </div>
                     <Separator />
                     <div className="flex items-center justify-between font-semibold text-lg">
                        <span>Total</span>
                        <span className="text-primary">$5.00</span>
                    </div>

                    <div className="grid gap-3">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea id="notes" placeholder="Add any notes for the client" />
                    </div>
                </CardContent>
                <CardFooter>
                     <Button className="h-14 w-full text-lg">Create Invoice</Button>
                </CardFooter>
            </Card>
        </div>
      </div>
    </div>
  );
}
