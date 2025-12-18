// backend/router/productRouter.js
import express from "express";
import { canAccess } from "../middleware/permissionMiddleware.js";
import * as productController from "../controllers/productController.js";

const router = express.Router();

// ============================================================================
// ✅ SPECIFIC ROUTES (MUST BE DEFINED FIRST)
// ============================================================================

/**
 * GET /api/products/search
 * Endpoint untuk pencarian autocomplete.
 */
router.get("/search", productController.searchProducts);

/**
 * GET /api/products/admin-list
 * Mengambil daftar semua produk aktif untuk dropdown admin.
 */
router.get("/admin-list", canAccess("manage-products"), productController.getAdminProductList);

// ============================================================================
// ✅ GENERAL ROUTES
// ============================================================================

/**
 * GET /api/products
 * Endpoint utama WMS (List produk dengan filter, pagination, sort).
 */
router.get("/", productController.getProducts);

// ============================================================================
// ✅ PARAMETERIZED ROUTES (MUST BE LAST)
// ============================================================================

/**
 * GET /api/products/:id
 * Mengambil detail produk lengkap (termasuk komponen paket & stok).
 */
router.get("/:id", productController.getProductById);

/**
 * GET /api/products/:id/stock-details
 * Mengambil rincian stok per lokasi untuk produk tertentu.
 */
router.get("/:id/stock-details", productController.getProductStockDetails);

// ============================================================================
// ✅ WRITE OPERATIONS
// ============================================================================

/**
 * POST /api/products
 * Membuat produk baru (Mendukung Paket).
 */
router.post("/", canAccess("manage-products"), productController.createProduct);

/**
 * PUT /api/products/:id
 * Mengupdate produk (Mendukung Paket).
 */
router.put("/:id", canAccess("manage-products"), productController.updateProduct);

/**
 * DELETE /api/products/:id
 * Soft delete produk (set is_active = 0).
 */
router.delete("/:id", canAccess("manage-products"), productController.deleteProduct);

export default router;
