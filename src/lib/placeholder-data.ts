import type { Product, Client, Transaction } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const products: Product[] = [];

export const clients: Client[] = [];

export const transactions: Transaction[] = [];
