import type { Product, Client, Transaction } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const products: Product[] = [
  {
    id: 'green_coconut',
    name: 'Green Coconut',
    default_price: 5.0,
    default_cost: 2.5,
    current_stock: 350,
    unit: 'unit',
    image: findImage('product-green-coconut'),
  },
  {
    id: 'source_water',
    name: 'Source Water',
    default_price: 10.0,
    default_cost: 4.0,
    current_stock: 120,
    unit: 'case',
    image: findImage('product-source-water'),
  },
  {
    id: 'coconut_oil',
    name: 'Coconut Oil',
    default_price: 15.0,
    default_cost: 7.0,
    current_stock: 80,
    unit: 'gallon',
    image: findImage('product-coconut-oil'),
  },
];

export const clients: Client[] = [
  {
    id: 'client-1',
    name: 'Amara at Paraiso',
    address_data: { formatted_address: '3101 NE 7th Ave, Miami, FL' },
    contact_phone: '305-702-5528',
    balance_due: 1250.0,
    pricing_overrides: {
      green_coconut: 4.5,
      source_water: 8.0,
    },
  },
  {
    id: 'client-2',
    name: 'Joia Beach',
    address_data: { formatted_address: '1111 Parrot Jungle Trail, Miami, FL' },
    contact_phone: '305-400-7280',
    balance_due: 0,
    pricing_overrides: {},
  },
  {
    id: 'client-3',
    name: 'Pura Vida',
    address_data: { formatted_address: '123 Fake St, Miami Beach, FL' },
    contact_phone: '555-123-4567',
    balance_due: 320.5,
    pricing_overrides: {
      green_coconut: 4.75,
    },
  },
];

export const transactions: Transaction[] = [
  {
    id: 'txn-1',
    type: 'sale',
    client_id: 'client-1',
    client_name: 'Amara at Paraiso',
    date: new Date('2024-07-20T14:30:00Z'),
    status: 'delivered',
    total_amount: 225.0,
    items: [
      {
        product_id: 'green_coconut',
        product_name: 'Green Coconut',
        quantity: 50,
        applied_price: 4.5,
        pricing_level_used: 2,
        batch_ids_deducted: ['batch-A'],
      },
    ],
  },
  {
    id: 'txn-2',
    type: 'restock',
    provider_id: 'provider-1',
    provider_name: 'Juan\'s Farm',
    date: new Date('2024-07-19T10:00:00Z'),
    status: 'paid',
    total_amount: 250.0,
    items: [
      {
        product_id: 'green_coconut',
        product_name: 'Green Coconut',
        quantity: 100,
        applied_price: 2.5,
        pricing_level_used: 1,
        batch_ids_deducted: [],
      },
    ],
  },
  {
    id: 'txn-3',
    type: 'sale',
    client_id: 'client-2',
    client_name: 'Joia Beach',
    date: new Date('2024-07-18T18:00:00Z'),
    status: 'paid',
    total_amount: 500.0,
    items: [
      {
        product_id: 'green_coconut',
        product_name: 'Green Coconut',
        quantity: 100,
        applied_price: 5.0,
        pricing_level_used: 1,
        batch_ids_deducted: ['batch-A', 'batch-B'],
      },
    ],
  },
   {
    id: 'txn-4',
    type: 'waste',
    date: new Date('2024-07-17T09:00:00Z'),
    status: 'draft',
    total_amount: 25.0,
    items: [
      {
        product_id: 'green_coconut',
        product_name: 'Green Coconut',
        quantity: 10,
        applied_price: 2.5,
        pricing_level_used: 1,
        batch_ids_deducted: ['batch-B'],
      },
    ],
  },
];
