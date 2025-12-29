import { jest } from "@jest/globals";

// Definisikan Mock SEBELUM import modul yang dites
// Kita gunakan unstable_mockModule karena project ini menggunakan Native ESM
jest.unstable_mockModule("../repositories/pickingRepository.js", () => ({
  __esModule: true,
  getAllHeadersByInvoiceIds: jest.fn(), // <--- Added this line
  getActiveHeadersByInvoiceIds: jest.fn(),
  createHeader: jest.fn(),
  createItemsBulk: jest.fn(),
  updateHeaderStatus: jest.fn(),
  updateItemsStatusByListId: jest.fn(),
  updateMarketplaceStatus: jest.fn(),
  archiveHeader: jest.fn(),
  cancelItemsByListId: jest.fn(),
  cancelHeader: jest.fn(),
  markItemAsReturned: jest.fn(),
}));

jest.unstable_mockModule("../repositories/productRepository.js", () => ({
  __esModule: true,
  getProductsBySkus: jest.fn(),
  getBulkPackageComponents: jest.fn(),
}));

jest.unstable_mockModule("../repositories/locationRepository.js", () => ({
  __esModule: true,
  getTotalStockByProductIds: jest.fn(),
  getLocationsByProductIds: jest.fn(),
}));

// 2. Import Modul (Gunakan dynamic import untuk helper agar mock ter-apply)
const pickingRepo = await import("../repositories/pickingRepository.js");
const validationHelper = await import("../services/helpers/pickingValidationHelper.js");
const { WMS_STATUS } = await import("../config/wmsConstants.js");

// Mock Object Koneksi Database
const mockConn = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  query: jest.fn(), // Penting untuk query manual di helper
  release: jest.fn(),
};

describe("pickingValidationHelper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================
  // TEST GROUP 1: handleExistingInvoices (Logic Sinkronisasi)
  // ==========================================================
  describe("handleExistingInvoices", () => {
    test("Scenario: Order Baru (Belum ada di DB) -> Masuk antrian insert", async () => {
      // Setup: DB kosong untuk invoice ini
      pickingRepo.getAllHeadersByInvoiceIds.mockResolvedValue([]);

      const items = [{ invoiceId: "INV-BARU-001", status: "NEW", items: [] }];

      const result = await validationHelper.handleExistingInvoices(mockConn, items);

      expect(result).toHaveLength(1);
      expect(result[0].invoiceId).toBe("INV-BARU-001");
      expect(pickingRepo.createHeader).not.toHaveBeenCalled(); // Karena helper hanya me-return itemsToProcess
    });

    test("Scenario: Order Hantu (Ada di DB tapi CANCEL) -> Archive & Insert Baru", async () => {
      // Setup: DB return order dengan status CANCEL
      pickingRepo.getAllHeadersByInvoiceIds.mockResolvedValue([
        { id: 99, original_invoice_id: "INV-GHOST", status: "CANCEL", is_active: 1 },
      ]);

      const items = [{ invoiceId: "INV-GHOST", status: "COMPLETED", items: [] }];

      const result = await validationHelper.handleExistingInvoices(mockConn, items);

      // Expectation:
      // Order lama di-archive
      expect(pickingRepo.archiveHeader).toHaveBeenCalledWith(mockConn, 99);
      expect(pickingRepo.cancelItemsByListId).toHaveBeenCalledWith(mockConn, 99);
      // 2. Order baru dikembalikan untuk diproses insert
      expect(result).toHaveLength(1);
      expect(result[0].invoiceId).toBe("INV-GHOST");
    });

    test("Scenario: Sync RETURNED Status (Full Return)", async () => {
      // Setup: DB return order dengan status COMPLETED (Active)
      pickingRepo.getAllHeadersByInvoiceIds.mockResolvedValue([
        { id: 100, original_invoice_id: "INV-RETUR", status: "COMPLETED", is_active: 1 },
      ]);

      const items = [{ invoiceId: "INV-RETUR", status: "RETURNED", items: [] }];

      const result = await validationHelper.handleExistingInvoices(mockConn, items);

      // Expectation:
      // Tidak ada item baru untuk di-insert
      expect(result).toHaveLength(0);
      // 2. Status Header & Items diupdate jadi RETURNED
      expect(pickingRepo.updateHeaderStatus).toHaveBeenCalledWith(
        mockConn,
        100,
        WMS_STATUS.RETURNED,
        1
      );
      expect(pickingRepo.updateMarketplaceStatus).toHaveBeenCalledWith(mockConn, 100, "RETURNED");
    });

    test("Scenario: Sync CANCEL Status (Void)", async () => {
      // Setup: DB return order PENDING
      pickingRepo.getAllHeadersByInvoiceIds.mockResolvedValue([
        { id: 101, original_invoice_id: "INV-BATAL", status: "PENDING", is_active: 1 },
      ]);

      const items = [{ invoiceId: "INV-BATAL", status: "CANCELLED", items: [] }];

      await validationHelper.handleExistingInvoices(mockConn, items);

      // Expectation: Header & Item dicancel
      expect(pickingRepo.cancelHeader).toHaveBeenCalledWith(mockConn, 101);
      expect(pickingRepo.cancelItemsByListId).toHaveBeenCalledWith(mockConn, 101);
    });

    test("Scenario: Prevent Ghost Stock (Retur saat masih PENDING) -> Force Cancel", async () => {
      // Setup: Order masih PENDING di gudang (belum dipick)
      pickingRepo.getAllHeadersByInvoiceIds.mockResolvedValue([
        { id: 102, original_invoice_id: "INV-EARLY-RET", status: "PENDING", is_active: 1 },
      ]);

      // Marketplace kirim status RETURNED
      const items = [{ invoiceId: "INV-EARLY-RET", status: "RETURNED", items: [] }];

      await validationHelper.handleExistingInvoices(mockConn, items);

      // Expectation: JANGAN set ke RETURNED, tapi CANCEL saja (karena barang belum keluar fisik)
      expect(pickingRepo.cancelHeader).toHaveBeenCalledWith(mockConn, 102);
      expect(pickingRepo.updateHeaderStatus).not.toHaveBeenCalledWith(
        mockConn,
        102,
        WMS_STATUS.RETURNED,
        expect.anything()
      );
    });
  });

  // ==========================================================
  // TEST GROUP 2: calculateValidations (Logic Stok)
  // ==========================================================
  describe("calculateValidations", () => {
    // Mock Data Referensi
    const mockDbData = {
      validProductMap: new Map([
        ["SKU-SINGLE", { id: 1, name: "Produk A", is_package: 0 }],
        ["SKU-PAKET", { id: 2, name: "Paket Hemat", is_package: 1 }],
        ["SKU-PAKET-KOSONG", { id: 3, name: "Paket Zonk", is_package: 1 }],
      ]),
      componentsByPackageId: new Map([
        [2, [{ component_product_id: 10, quantity_per_package: 2, component_stock_display: 100 }]],
      ]),
      locationsByProductId: new Map([
        [1, [{ location_id: 50, quantity: 10 }]], // SKU-SINGLE ada 10 pcs di Loc 50
      ]),
      locationsByComponentId: new Map([
        [10, [{ location_id: 60, quantity: 20 }]], // Komponen ada 20 pcs di Loc 60
      ]),
    };

    test("Validasi Single Product (Stok Cukup)", () => {
      const items = [{ sku: "SKU-SINGLE", qty: 5 }];
      const { validItems, invalidSkus } = validationHelper.calculateValidations(items, mockDbData);

      expect(invalidSkus).toHaveLength(0);
      expect(validItems).toHaveLength(1);
      expect(validItems[0].initialStatus).toBe("PENDING"); // Stok 10 > butuh 5
      expect(validItems[0].suggestedLocationId).toBe(50);
    });

    test("Validasi Single Product (Stok Kurang -> Backorder)", () => {
      const items = [{ sku: "SKU-SINGLE", qty: 15 }]; // Butuh 15, Stok cuma 10
      const { validItems } = validationHelper.calculateValidations(items, mockDbData);

      expect(validItems[0].initialStatus).toBe("BACKORDER");
      expect(validItems[0].suggestedLocationId).toBeNull();
    });

    test("Validasi Paket (Breakdown Komponen)", () => {
      const items = [{ sku: "SKU-PAKET", qty: 2 }]; // Butuh 2 paket
      const { validItems } = validationHelper.calculateValidations(items, mockDbData);

      expect(validItems).toHaveLength(1);
      const components = validItems[0].components;

      expect(components).toHaveLength(1);
      // Cek perhitungan qty: 2 paket * 2 pcs/paket = 4 pcs dibutuhkan
      expect(components[0].component_product_id).toBe(10);
      expect(components[0].initialStatus).toBe("PENDING"); // Stok komponen 20 > butuh 4
    });

    test("Validasi SKU Tidak Dikenal", () => {
      const items = [{ sku: "SKU-GAIB", qty: 1 }];
      const { invalidSkus } = validationHelper.calculateValidations(items, mockDbData);

      expect(invalidSkus).toHaveLength(1);
      expect(invalidSkus[0]).toContain("404");
    });
  });
});
