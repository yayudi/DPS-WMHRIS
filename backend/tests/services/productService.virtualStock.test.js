import { jest } from "@jest/globals";

// MOCK SETUP (Required to prevent real DB connections during import)

// Mock config/db.js
jest.unstable_mockModule("../../config/db.js", () => ({
  default: {
    getConnection: jest.fn(),
  },
}));

// Mock repositories/productRepository.js
jest.unstable_mockModule("../../repositories/productRepository.js", () => ({
  insertAuditLog: jest.fn(),
}));

// Mock services/firebaseSignalService.js
jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: {
    refreshProducts: jest.fn(),
  },
  sendFirebaseSignal: jest.fn(),
}));

// IMPORT MODULES UNDER TEST
const { calculatePackageMeta } = await import("../../services/productService.js");

// TEST SUITE

describe("calculatePackageMeta Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test Case 1: Produk Biasa (Bukan Paket)
  test("Should return 0 virtual stock for non-package product", () => {
    const product = {
      is_package: false,
      weight: 500,
      length: 10,
      width: 10,
      height: 10, // CBM: 1000 / 1000000 = 0.001
      components: [],
    };

    const result = calculatePackageMeta(product);

    expect(result.virtual_stock).toBe(0); // Non-package stock is not calculated here usually, or defaults to 0 if not handled
    expect(result.total_weight).toBe(500); // Should keep original weight
    expect(result.total_cbm).toBe(0.001);
  });

  // Test Case 2: Paket dengan Komponen Lengkap (Normal Case)
  test("Should calculate correctly for normal package", () => {
    const product = {
      is_package: true,
      weight: 0, // Ignored
      length: 0,
      width: 0,
      height: 0,
      components: [
        {
          id: 1,
          weight: 100,
          length: 10, width: 10, height: 10, // CBM = 0.001
          quantity_per_package: 2,
          stock_available: 20, // Bisa buat 10
        },
        {
          id: 2,
          weight: 50,
          length: 5, width: 5, height: 4, // CBM = 100 / 1000000 = 0.0001
          quantity_per_package: 1,
          stock_available: 15, // Bisa buat 15
        },
      ],
    };

    const result = calculatePackageMeta(product);

    // Stock: Min(20/2, 15/1) = Min(10, 15) = 10
    expect(result.virtual_stock).toBe(10);
    // Weight: (100*2) + (50*1) = 250
    expect(result.total_weight).toBe(250);
    // CBM: (0.001 * 2) + (0.0001 * 1) = 0.0021
    expect(result.total_cbm).toBe(0.0021);
  });

  // Test Case 3: Salah satu komponen stok 0 (Bottle Neck)
  test("Should return 0 stock if one component is empty", () => {
    const product = {
      is_package: true,
      components: [
        {
          id: 1,
          quantity_per_package: 1,
          stock_available: 10,
        },
        {
          id: 2,
          quantity_per_package: 1,
          stock_available: 0, // Empty
        },
      ],
    };

    const result = calculatePackageMeta(product);
    expect(result.virtual_stock).toBe(0);
  });

  // Test Case 4: Tidak ada komponen
  test("Should return 0 stock if components array is empty", () => {
    const product = {
      is_package: true,
      components: [],
    };

    const result = calculatePackageMeta(product);
    expect(result.virtual_stock).toBe(0);
  });

  // Test Case 5: Partial Stock Calculation (Math Floor)
  test("Should floor the calculation result", () => {
    const product = {
      is_package: true,
      components: [
        {
          id: 1,
          weight: 100,
          quantity_per_package: 3,
          stock_available: 10, // 10 / 3 = 3.33 -> 3
        },
      ],
    };

    const result = calculatePackageMeta(product);
    expect(result.virtual_stock).toBe(3);
  });

  // Test Case 6: Fallback Weight and CBM if Calculation is 0
  test("Should use product weight and cbm if calculated is 0", () => {
    const product = {
      is_package: true,
      weight: 999,
      length: 100, width: 100, height: 100, // CBM = 1
      components: [
        {
          id: 1,
          weight: 0, // No weight info
          length: 0, width: 0, height: 0, // No dimensions
          quantity_per_package: 1,
          stock_available: 10,
        },
      ],
    };

    const result = calculatePackageMeta(product);
    expect(result.total_weight).toBe(999);
    expect(result.total_cbm).toBe(1);
  });
});
