export interface Product {
  id: number;
  name: string;
  sku: string;
  description?: string;
  price?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface StockDetail {
  location_id: number;
  location_code: string;
  quantity: number;
}

export interface ProductSearchFilter {
  q?: string;
  page?: number;
  limit?: number;
  locationId?: number | string | null;
  inStockOnly?: boolean;
}
