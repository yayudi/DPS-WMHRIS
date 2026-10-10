export interface Category {
  id: number;
  name: string;
  description?: string;
  parent_id?: number | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}
