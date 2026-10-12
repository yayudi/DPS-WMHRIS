export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  error_code?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
