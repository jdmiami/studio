
export type Timestamp = {
  seconds: number;
  nanoseconds: number;
};

export interface User {
  uid: string;
  email: string;
  role: 'admin' | 'driver';
  settings: {
    company_name: string;
    logo_url: string;
  };
}

export interface Product {
  id: string;
  name: string;
  default_price: number;
  default_cost: number;
  current_stock: number;
  unit: 'unit' | 'case' | 'gallon';
  image: string;
}

export interface Batch {
  id: string;
  product_id: string;
  provider_id: string;
  quantity_remaining: number;
  cost_per_unit: number;
  received_at: Date;
}

export interface Client {
  id: string;
  name: string;
  address_data: {
    formatted_address: string;
    lat: number;
    lng: number;
  };
  contact_phone: string;
  balance_due: number;
  pricing_overrides: Record<string, number>;
}

export interface Provider {
    id: string;
    name: string;
    address_data: {
        formatted_address: string;
        lat: number;
        lng: number;
    };
    contact_phone: string;
    cost_overrides: Record<string, number>;
}

export type TransactionItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  applied_price: number;
  pricing_level_used?: 1 | 2 | 3;
  batch_ids_deducted?: string[];
};

export interface Transaction {
  id: string;
  invoice_number?: string;
  type: 'sale' | 'restock' | 'waste';
  client_id?: string | null;
  client_name?: string;
  provider_id?: string | null;
  provider_name?: string;
  date: Date | Timestamp;
  service_date?: Date | Timestamp;
  payment_due_date?: Date | Timestamp;
  status: 'draft' | 'delivered' | 'paid' | 'void';
  total_amount: number;
  items: TransactionItem[];
  notes?: string;
}
