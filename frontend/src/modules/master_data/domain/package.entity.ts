export interface Package {
  id: number;
  name: string;
  sku: string;
  price?: number;
  items?: PackageItem[];
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface PackageItem {
  id: number;
  product_id: number;
  quantity: number;
  product?: any;
}
