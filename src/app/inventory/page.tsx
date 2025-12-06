import Image from 'next/image';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { products } from '@/lib/placeholder-data';
import { Button } from '@/components/ui/button';

export default function InventoryPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Inventory</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader>
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>
                Default Price: ${product.default_price.toFixed(2)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="relative aspect-video w-full overflow-hidden rounded-md">
                 <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    data-ai-hint="product image"
                  />
               </div>
              <div className="flex items-baseline justify-center text-center">
                <p className="text-6xl font-bold tracking-tighter">
                  {product.current_stock}
                </p>
                <span className="ml-1 text-xl text-muted-foreground">
                  {product.unit}s
                </span>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                View Batches
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
