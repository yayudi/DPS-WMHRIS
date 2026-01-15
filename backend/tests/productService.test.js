// backend/tests/productService.test.js
import { jest } from "@jest/globals";

// ============================================================================
// 1. MOCK SETUP (Must be defined BEFORE imports)
// ============================================================================

// Mock Object untuk Database Connection
const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

// Mock Module: config/db.js
jest.unstable_mockModule("../config/db.js", () => ({
  default: {
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
  },
}));

// Mock Module: repositories/productRepository.js
jest.unstable_mockModule("../repositories/productRepository.js", () => ({
  getIdBySku: jest.fn(),
  createProduct: jest.fn(),
  getProductById: jest.fn(),
  updateProduct: jest.fn(),
  updateProductStatus: jest.fn(),
  insertComponents: jest.fn(),
  deleteComponents: jest.fn(),
  insertAuditLog: jest.fn(),
}));

// ============================================================================
// 2. IMPORT MODULES UNDER TEST
// ============================================================================

// Import dinamis setelah mock didefinisikan
const productService = await import("../services/productService.js");
const productRepo = await import("../repositories/productRepository.js");
const db = await import("../config/db.js");

// ============================================================================
// 3. TEST SUITE
// ============================================================================

describe("ProductService Business Logic", () => {
  const userId = 99; // Dummy User ID

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset behavior default mock connection
    mockConnection.beginTransaction.mockResolvedValue();
    mockConnection.commit.mockResolvedValue();
    mockConnection.rollback.mockResolvedValue();
    mockConnection.release.mockResolvedValue();
  });

  // ------------------------------------------------------------------------
  // A. CREATE PRODUCT
  // ------------------------------------------------------------------------
  describe("createProductService", () => {
    const validData = {
      sku: "SKU-TEST-001",
      name: "Produk Test",
      price: 50000,
      weight: 1000,
      is_package: false,
    };

    test("Success: Membuat produk standar (Satuan)", async () => {
      // Setup Mock
      productRepo.getIdBySku.mockResolvedValue(null); // SKU unik (belum ada)
      productRepo.createProduct.mockResolvedValue(101); // Return ID baru

      // Execute
      const newId = await productService.createProductService(validData, userId);

      // Assertions
      expect(newId).toBe(101);

      // 1. Transaction Integrity
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();

      // 2. Repo Calls
      expect(productRepo.createProduct).toHaveBeenCalledWith(mockConnection, validData);

      // 3. Audit Log (Harus log Creation)
      expect(productRepo.insertAuditLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId: 101,
          userId: 99,
          action: "CREATE",
          newVal: "SKU-TEST-001",
        })
      );
    });

    test("Success: Membuat produk paket dengan komponen", async () => {
      const packageData = {
        ...validData,
        is_package: true,
        components: [{ id: 5, quantity: 2 }],
      };

      productRepo.getIdBySku.mockResolvedValue(null);
      productRepo.createProduct.mockResolvedValue(200);

      await productService.createProductService(packageData, userId);

      // Assert Component Insertion
      expect(productRepo.insertComponents).toHaveBeenCalledWith(
        mockConnection,
        200,
        packageData.components
      );
    });

    test("Fail: SKU Duplikat (Business Logic Error)", async () => {
      // Setup Mock: SKU sudah ada (return ID 55)
      productRepo.getIdBySku.mockResolvedValue(55);

      // Execute & Assert Error
      await expect(productService.createProductService(validData, userId)).rejects.toThrow(
        "SKU sudah terdaftar."
      );

      // Assert Rollback
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(productRepo.createProduct).not.toHaveBeenCalled(); // Tidak boleh insert
    });

    test("Fail: Database Error saat Insert", async () => {
      productRepo.getIdBySku.mockResolvedValue(null);
      // Simulasi Error DB
      productRepo.createProduct.mockRejectedValue(new Error("DB Connection Failed"));

      await expect(productService.createProductService(validData, userId)).rejects.toThrow(
        "DB Connection Failed"
      );

      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------------
  // B. UPDATE PRODUCT
  // ------------------------------------------------------------------------
  describe("updateProductService", () => {
    const productId = 100;
    const oldData = {
      id: productId,
      sku: "SKU-OLD",
      name: "Nama Lama",
      price: 10000,
      weight: 500,
      is_package: 0, // false (disimpan sbg tinyint di DB)
    };

    test("Success: Update Nama & Harga (Trigger Audit Log)", async () => {
      const newData = {
        ...oldData,
        name: "Nama Baru", // Berubah
        price: 15000, // Berubah
        weight: 500, // Tetap
      };

      // Mock Data Lama
      productRepo.getProductById.mockResolvedValue(oldData);

      // Execute
      await productService.updateProductService(productId, newData, userId);

      // Assert Update Call
      expect(productRepo.updateProduct).toHaveBeenCalledWith(mockConnection, productId, newData);

      // Assert Audit Log: Harus dipanggil 2 kali (Name dan Price)
      expect(productRepo.insertAuditLog).toHaveBeenCalledTimes(2);

      // Cek Log Nama
      expect(productRepo.insertAuditLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId,
          action: "UPDATE",
          field: "name",
          oldVal: "Nama Lama",
          newVal: "Nama Baru",
        })
      );
    });

    test("Success: Tidak ada log jika data tidak berubah", async () => {
      // Data sama persis
      const sameData = { ...oldData, is_package: false };
      productRepo.getProductById.mockResolvedValue(oldData);

      await productService.updateProductService(productId, sameData, userId);

      expect(productRepo.updateProduct).toHaveBeenCalled();
      // Audit log tidak boleh dipanggil (kecuali untuk komponen clean-up log)
      // Note: Di service kita ada logic deleteComponents, jadi mungkin tidak murni 0 calls log komponen,
      // tapi logic loop field check tidak boleh trigger log.

      // Filter calls arguments untuk cek field 'name'
      const calls = productRepo.insertAuditLog.mock.calls;
      const nameLog = calls.find((call) => call[1].field === "name");
      expect(nameLog).toBeUndefined();
    });

    test("Success: Mengubah Tipe menjadi Paket (Handle Components)", async () => {
      const newData = {
        ...oldData,
        is_package: true, // Berubah dari false ke true
        components: [{ id: 99, quantity: 1 }],
      };

      productRepo.getProductById.mockResolvedValue(oldData);

      await productService.updateProductService(productId, newData, userId);

      // Assert Component Logic
      expect(productRepo.deleteComponents).toHaveBeenCalledWith(mockConnection, productId);
      expect(productRepo.insertComponents).toHaveBeenCalledWith(
        mockConnection,
        productId,
        newData.components
      );

      // Assert Log Perubahan Tipe
      expect(productRepo.insertAuditLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({ field: "is_package", newVal: true })
      );

      // Assert Log Struktur Komponen
      expect(productRepo.insertAuditLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({ field: "components" })
      );
    });

    test("Fail: Produk Tidak Ditemukan", async () => {
      productRepo.getProductById.mockResolvedValue(null); // Not found

      await expect(productService.updateProductService(productId, {}, userId)).rejects.toThrow(
        "Produk tidak ditemukan."
      );

      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------------
  // C. DELETE & RESTORE (SOFT DELETE)
  // ------------------------------------------------------------------------
  describe("Status Operations", () => {
    test("softDeleteProductService: Set Active False & Log", async () => {
      const targetId = 200;
      await productService.softDeleteProductService(targetId, userId);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();

      // Cek Status Update
      expect(productRepo.updateProductStatus).toHaveBeenCalledWith(mockConnection, targetId, false);

      // Cek Log
      expect(productRepo.insertAuditLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          action: "DELETE",
          field: "status",
          newVal: "Archived",
        })
      );

      expect(mockConnection.commit).toHaveBeenCalled();
    });

    test("restoreProductService: Set Active True & Log", async () => {
      const targetId = 200;
      await productService.restoreProductService(targetId, userId);

      expect(productRepo.updateProductStatus).toHaveBeenCalledWith(mockConnection, targetId, true);

      expect(productRepo.insertAuditLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          action: "RESTORE",
          field: "status",
          newVal: "Active",
        })
      );
    });
  });
});
