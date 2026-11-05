export interface Location {
  id: number;
  code: string;
  name: string;
  building?: string;
  floor?: string;
  type?: string;
  purpose?: string;
  is_active?: boolean;
  is_fulfillment_source?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface CreateLocationPayload {
  code: string;
  name: string;
  building?: string;
  floor?: string;
  type?: string;
  purpose?: string;
  is_active?: boolean;
  is_fulfillment_source?: boolean;
}

export type UpdateLocationPayload = Partial<CreateLocationPayload>;
