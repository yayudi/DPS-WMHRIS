export interface UserManagementUser {
  id: number;
  username: string;
  nickname: string;
  role_id: number;
  role_name?: string;
  is_active: boolean | number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateUserPayload {
  username: string;
  nickname: string;
  role_id: number;
  password?: string;
}

export interface UpdateUserPayload {
  username?: string;
  nickname?: string;
  role_id?: number;
  newPassword?: string;
}
