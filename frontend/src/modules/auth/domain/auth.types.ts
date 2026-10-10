import type { AuthUser } from './user.entity'

export interface LoginPayload {
  username?: string;
  password?: string;
}

export interface LoginRawResponse {
  success: boolean;
  message: string;
  user?: AuthUser;
  token?: string;
}
