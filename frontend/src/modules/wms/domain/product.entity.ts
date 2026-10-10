import type { BaseEntity } from '@/core/domain/base.entity'

export interface Product extends BaseEntity {
  sku: string;
  name: string;
  category_id?: string | null;
  price: number;
  is_active: boolean;
  is_package: boolean;
  weight: number;
  length: number;
  width: number;
  height: number;
  deleted_at?: string | null;
}
