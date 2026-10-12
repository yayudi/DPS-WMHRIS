export interface SalesChannel {
  id: number;
  name: string;
  type?: string;
  platform?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}
