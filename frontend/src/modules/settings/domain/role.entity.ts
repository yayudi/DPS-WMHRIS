export interface Role {
  id: number;
  name: string;
  description?: string;
  created_at?: string;
}

export interface Permission {
  id: number;
  name: string;
  description?: string;
  group?: string;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
}
