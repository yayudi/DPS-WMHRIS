export interface Location {
  id: number;
  code: string;
  name: string;
  building?: string;
  floor?: string;
  type?: string;
  is_active?: boolean;
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
}

export type UpdateLocationPayload = Partial<CreateLocationPayload>;
