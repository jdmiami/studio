import { Coconut } from 'lucide-react';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" prefetch={false}>
      <Coconut className="h-8 w-8 text-primary" />
      <span className="font-headline text-xl font-bold text-primary-foreground">
        CocoSales AI
      </span>
    </Link>
  );
}
