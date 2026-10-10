import type { BaseEntity } from '@/core/domain/base.entity'

export interface AuthUser extends BaseEntity {
  username: string;
  nickname: string;
  role_id: number;
  permissions: string[];
}
