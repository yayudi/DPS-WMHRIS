import { jest } from "@jest/globals";

// Mock Connection
const mockConnection = {
  release: jest.fn(),
  query: jest.fn(),
};

// Mock mysql2/promise
jest.unstable_mockModule("mysql2/promise", () => ({
  createPool: jest.fn(() => ({
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
  })),
  default: {
    createPool: jest.fn(() => ({
      getConnection: jest.fn(() => Promise.resolve(mockConnection)),
    })),
  },
}));

// Mock firebaseSignalService
jest.unstable_mockModule("../services/firebaseSignalService.js", () => ({
  emitSharedTaskSignal: jest.fn().mockResolvedValue(true),
}));

// Mock Repositories
jest.unstable_mockModule("../repositories/pickingRepository.js", () => ({
  getStockRequirementsList: jest.fn(),
  getStockRequirementSources: jest.fn(),
  getStockRequirementLocationPurposes: jest.fn(),
  getStockLocationsByProductIds: jest.fn(),
  getStockRequirementOrdersBySku: jest.fn(),
  getHeaderById: jest.fn(),
  getItemsByIds: jest.fn(),
  updateSuggestedLocation: jest.fn(),
  validateItem: jest.fn(),
  countPendingItems: jest.fn(),
  validateHeader: jest.fn(),
  markItemAsReturned: jest.fn(),
  archiveHeader: jest.fn(),
  updateHeaderStatus: jest.fn(),
  updateMarketplaceStatus: jest.fn(),
  updateItemsStatusByListId: jest.fn(),
  voidHeader: jest.fn(),
  voidItemsByListId: jest.fn(),
}));

jest.unstable_mockModule("../repositories/locationRepository.js", () => ({
  getStockAtLocation: jest.fn(),
  findBestStock: jest.fn(),
  deductStock: jest.fn(),
  incrementStock: jest.fn(),
  getLocationsByProductIds: jest.fn(),
  getTotalStockByProductIds: jest.fn(),
}));

jest.unstable_mockModule("../repositories/stockMovementRepository.js", () => ({
  createLog: jest.fn(),
}));

const pickingService = await import("../services/pickingDataService.js");
const pickingRepo = await import("../repositories/pickingRepository.js");

describe("PickingDataService - Stock Requirements Server-Side List & Detail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("harus mengembalikan summary kosong jika tidak ada data item pending", async () => {
    pickingRepo.getStockRequirementsList.mockResolvedValue({
      summary: {
        totalSkus: 0,
        totalRequiredQty: 0,
        totalStockQty: 0,
        totalDeficitSkus: 0,
        totalSufficientSkus: 0,
      },
      total: 0,
      items: [],
    });
    pickingRepo.getStockRequirementSources.mockResolvedValue([]);
    pickingRepo.getStockRequirementLocationPurposes.mockResolvedValue([]);

    const result = await pickingService.getStockRequirementsService();

    expect(result.summary.totalSkus).toBe(0);
    expect(result.summary.totalRequiredQty).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
    expect(mockConnection.release).toHaveBeenCalled();
  });

  test("harus mengagregasi data kebutuhan dan mengembalikan list SKU terpaginasi", async () => {
    pickingRepo.getStockRequirementsList.mockResolvedValue({
      summary: {
        totalSkus: 2,
        totalRequiredQty: 25,
        totalStockQty: 25,
        totalDeficitSkus: 1,
        totalSufficientSkus: 1,
      },
      total: 2,
      items: [
        {
          sku: "SKU-DEFICIT-01",
          product_id: 101,
          product_name: "Produk Defisit",
          total_required: 15,
          total_stock: 5,
          deficit: -10,
          status: "DEFICIT",
          order_count: 3,
          item_count: 3,
          suggested_locations: "A-01",
        },
        {
          sku: "SKU-SUFFICIENT-02",
          product_id: 102,
          product_name: "Produk Cukup",
          total_required: 10,
          total_stock: 20,
          deficit: 10,
          status: "SUFFICIENT",
          order_count: 2,
          item_count: 2,
          suggested_locations: "B-02",
        },
      ],
    });
    pickingRepo.getStockRequirementSources.mockResolvedValue(["Shopee", "Tokopedia"]);
    pickingRepo.getStockRequirementLocationPurposes.mockResolvedValue(["DISPLAY", "GUDANG"]);

    pickingRepo.getStockLocationsByProductIds.mockResolvedValue([
      {
        product_id: 101,
        location_id: 1,
        location_code: "A-01",
        location_name: "Rak A1",
        quantity: 5,
      },
      {
        product_id: 102,
        location_id: 2,
        location_code: "B-02",
        location_name: "Rak B2",
        quantity: 20,
      },
    ]);

    const result = await pickingService.getStockRequirementsService({ page: 1, limit: 20 });

    expect(result.summary.totalSkus).toBe(2);
    expect(result.summary.totalRequiredQty).toBe(25);
    expect(result.summary.totalStockQty).toBe(25);
    expect(result.summary.totalDeficitSkus).toBe(1);
    expect(result.summary.totalSufficientSkus).toBe(1);
    expect(result.availableSources).toEqual(["Shopee", "Tokopedia"]);
    expect(result.availableLocationPurposes).toEqual(["DISPLAY", "GUDANG"]);

    const deficitItem = result.items.find((i) => i.sku === "SKU-DEFICIT-01");
    expect(deficitItem).toBeDefined();
    expect(deficitItem.status).toBe("DEFICIT");
    expect(deficitItem.deficit).toBe(-10);
    expect(deficitItem.locations).toHaveLength(1);

    const sufficientItem = result.items.find((i) => i.sku === "SKU-SUFFICIENT-02");
    expect(sufficientItem).toBeDefined();
    expect(sufficientItem.status).toBe("SUFFICIENT");
    expect(sufficientItem.deficit).toBe(10);
    expect(mockConnection.release).toHaveBeenCalled();
  });

  test("harus mengambil rincian pesanan spesifik satu SKU secara terpaginasi", async () => {
    pickingRepo.getStockRequirementOrdersBySku.mockResolvedValue({
      total: 2,
      rows: [
        {
          item_id: 1,
          sku: "SKU-DEFICIT-01",
          quantity: 10,
          item_status: "BACKORDER",
          picking_list_id: 50,
          invoice_id: "INV-001",
          source: "Tokopedia",
          shop_name: "Toko 1",
          customer_name: "Budi",
          order_date: "2026-10-14",
          suggested_location_code: "A-01",
        },
        {
          item_id: 2,
          sku: "SKU-DEFICIT-01",
          quantity: 5,
          item_status: "BACKORDER",
          picking_list_id: 51,
          invoice_id: "INV-002",
          source: "Shopee",
          shop_name: "Toko 2",
          customer_name: "Siti",
          order_date: "2026-10-14",
          suggested_location_code: "A-01",
        },
      ],
    });

    const result = await pickingService.getStockRequirementOrdersService("SKU-DEFICIT-01", {
      page: 1,
      limit: 10,
    });

    expect(result.sku).toBe("SKU-DEFICIT-01");
    expect(result.pagination.total).toBe(2);
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0].invoiceId).toBe("INV-001");
    expect(mockConnection.release).toHaveBeenCalled();
  });
});
