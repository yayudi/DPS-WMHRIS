export interface WmsFilterParams {
  search?: string;
  page?: number;
  limit?: number;
  category_id?: string;
  is_active?: boolean;
}

export interface WmsDashboardStats {
  totalProducts: number;
  lowStockItems: number;
  pendingReturns: number;
  activeMovements: number;
}
