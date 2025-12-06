import type { Product, Client, Transaction, Provider } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || 'https://picsum.photos/seed/placeholder/600/400';

export const products: Product[] = [
    {
        id: 'prod-gc',
        name: 'Green Coconut',
        default_price: 2.50,
        default_cost: 1.00,
        current_stock: 150,
        unit: 'unit',
        image: findImage('product-green-coconut'),
    },
    {
        id: 'prod-co',
        name: 'Coconut Oil',
        default_price: 10.00,
        default_cost: 4.50,
        current_stock: 50,
        unit: 'unit',
        image: findImage('product-coconut-oil'),
    },
     {
        id: 'prod-sw',
        name: 'Source Water',
        default_price: 1.50,
        default_cost: 0.50,
        current_stock: 200,
        unit: 'unit',
        image: findImage('product-source-water'),
    }
];

export const clients: Client[] = [];

export const providers: Provider[] = [
    {
        id: 'prov-juan',
        name: 'Juan\'s Farm',
        address: '123 Farm Rd, Homestead, FL',
        contact_phone: '305-111-2222',
    },
    {
        id: 'prov-oviedo',
        name: 'Oviedo Coconuts',
        address: '456 Coconut Ln, Oviedo, FL',
        contact_phone: '407-333-4444',
    }
]

export const transactions: Transaction[] = [];
