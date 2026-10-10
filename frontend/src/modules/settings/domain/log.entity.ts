export interface LogChangeDetail {
  old?: any;
  new?: any;
}

export interface SystemLog {
  id: number;
  user_id?: number;
  username?: string;
  nickname?: string;
  role?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'OTHER' | string;
  target_type: 'PRODUCT' | 'USER' | 'ROLE' | 'LOCATION' | 'SETTING' | string;
  target_id?: string | number;
  target_name?: string;
  changes?: Record<string, LogChangeDetail> | string | null;
  ip_address?: string;
  created_at: string;
}

export interface LogFilter {
  page?: number;
  limit?: number;
  search?: string;
  action?: string; // JSON string array
  targetType?: string; // JSON string array
  startDate?: string | null;
  endDate?: string | null;
}
