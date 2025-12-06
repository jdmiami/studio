import type { Product, Client, Transaction, Provider } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || 'https://picsum.photos/seed/placeholder/600/400';

export const products: Product[] = [];

export const clients: Client[] = [];

export const providers: Provider[] = [];

export const transactions: Transaction[] = [];
