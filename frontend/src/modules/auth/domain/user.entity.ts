import type { BaseEntity } from '@/core/domain/base.entity'
import type { UserPreference } from '@/core/domain/localization.types'

export interface AuthUser extends BaseEntity {
  username: string
  nickname: string
  role_id: number
  permissions: string[]
  preferences?: UserPreference
}
