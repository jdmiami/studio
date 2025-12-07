/**
 * Represents a timestamp with seconds and nanoseconds.
 */
export type Timestamp = {
  /** The number of seconds of UTC time since Unix epoch. */
  seconds: number;
  /** The non-negative fractions of a second at nanosecond resolution. */
  nanoseconds: number;
};

/**
 * Represents a user in the system.
 */
export interface User {
  /** The unique identifier for the user. */
  uid: string;
  /** The user's email address. */
  email: string;
  /** The role of the user, either 'admin' or 'driver'. */
  role: 'admin' | 'driver';
  /** The user's settings. */
  settings: {
    /** The name of the company. */
    company_name: string;
    /** The URL of the company's logo. */
    logo_url: string;
  };
}

/**
 * Represents a product in the inventory.
 */
export interface Product {
  /** The unique identifier for the product. */
  id: string;
  /** The name of the product. */
  name: string;
  /** The default selling price of the product. */
  default_price: number;
  /** The default cost of the product. */
  default_cost: number;
  /** The current stock level of the product. */
  current_stock: number;
  /** The unit of measurement for the product. */
  unit: 'unit' | 'case' | 'gallon';
  /** The URL of the product image. */
  image: string;
}

/**
 * Represents a batch of products received.
 */
export interface Batch {
  /** The unique identifier for the batch. */
  id: string;
  /** The identifier of the product in this batch. */
  product_id: string;
  /** The identifier of the provider who supplied this batch. */
  provider_id: string;
  /** The remaining quantity in this batch. */
  quantity_remaining: number;
  /** The cost per unit for this batch. */
  cost_per_unit: number;
  /** The date when the batch was received. */
  received_at: Date;
}

/**
 * Represents a client or customer.
 */
export interface Client {
  /** The unique identifier for the client. */
  id: string;
  /** The name of the client. */
  name: string;
  /** The address data for the client. */
  address_data: {
    /** The formatted address string. */
    formatted_address: string;
    /** The latitude of the address. */
    lat: number;
    /** The longitude of the address. */
    lng: number;
  };
  /** The contact phone number for the client. */
  contact_phone: string;
  /** The current balance due from the client. */
  balance_due: number;
  /** Custom pricing overrides for specific products. */
  pricing_overrides: Record<string, number>;
}

/**
 * Represents a provider or supplier.
 */
export interface Provider {
    /** The unique identifier for the provider. */
    id: string;
    /** The name of the provider. */
    name: string;
    /** The address data for the provider. */
    address_data: {
        /** The formatted address string. */
        formatted_address: string;
        /** The latitude of the address. */
        lat: number;
        /** The longitude of the address. */
        lng: number;
    };
    /** The contact phone number for the provider. */
    contact_phone: string;
    /** Custom cost overrides for specific products. */
    cost_overrides: Record<string, number>;
}

/**
 * Represents an item within a transaction.
 */
export type TransactionItem = {
  /** The identifier of the product. */
  product_id: string;
  /** The name of the product. */
  product_name: string;
  /** The quantity of the product involved in the transaction. */
  quantity: number;
  /** The price applied to this item. */
  applied_price: number;
  /** The pricing level used (optional). */
  pricing_level_used?: 1 | 2 | 3;
  /** The IDs of the batches from which items were deducted (optional). */
  batch_ids_deducted?: string[];
};

/**
 * Represents a transaction (sale, restock, or waste).
 */
export interface Transaction {
  /** The unique identifier for the transaction. */
  id: string;
  /** The invoice number (optional). */
  invoice_number?: string;
  /** The type of the transaction. */
  type: 'sale' | 'restock' | 'waste';
  /** The identifier of the client involved (optional). */
  client_id?: string | null;
  /** The name of the client involved (optional). */
  client_name?: string;
  /** The identifier of the provider involved (optional). */
  provider_id?: string | null;
  /** The name of the provider involved (optional). */
  provider_name?: string;
  /** The date of the transaction. */
  date: Date | Timestamp;
  /** The service date (optional). */
  service_date?: Date | Timestamp;
  /** The payment due date (optional). */
  payment_due_date?: Date | Timestamp;
  /** The status of the transaction. */
  status: 'draft' | 'delivered' | 'paid' | 'void';
  /** The total amount of the transaction. */
  total_amount: number;
  /** The list of items in the transaction. */
  items: TransactionItem[];
  /** Additional notes for the transaction (optional). */
  notes?: string;
}
