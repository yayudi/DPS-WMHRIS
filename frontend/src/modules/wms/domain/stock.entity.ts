export interface StockLocation {
  id: number
  location_code: string
  purpose: 'DISPLAY' | 'WAREHOUSE' | 'BRANCH' | string
  quantity: number
  building?: string
  floor?: string
}

export interface ProductStock {
  id: number
  sku: string
  name: string
  price: number
  is_package: boolean
  stock_locations: StockLocation[]
  totalStock: number
}

export interface StockFilter {
  page?: number
  limit?: number
  search?: string
  searchBy?: string
  buildings?: string[]
  floors?: string[]
}
