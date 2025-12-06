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

export default function RestocksPage() {
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
                <Select>
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
                <Select>
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
                    <Input id="quantity" type="number" placeholder="0" className="h-14 text-lg" />
                </div>
                 <div className="grid gap-3">
                    <Label htmlFor="cost">Cost per Unit</Label>
                     <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input id="cost" type="number" placeholder="0.00" className="h-14 pl-7 text-lg" />
                    </div>
                </div>
            </div>
        </CardContent>
        <CardFooter>
            <Button className="h-14 w-full text-lg">Add to Inventory</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
