import catchAsync from "../utils/catchAsync.js";
// backend/controllers/productController.js
import db from "../config/db.js";
import cache from "../config/cache.js";
import * as productService from "../services/productService.js";
import * as productRepo from "../repositories/productRepository.js";
import * as jobRepo from "../repositories/jobRepository.js";
import { parseJsonSafe } from "../utils/jsonUtils.js";
import AppError from "../utils/AppError.js";
import { EXPORT_JOB_TYPE } from "../config/jobConstants.js";
// ============================================================================
// READ OPERATIONS (Direct Repo Access)
// ============================================================================

// GET /search
// Mencari produk untuk autocomplete
export const searchProducts = catchAsync(async (req, res, next) => {
  const { q, locationId, inStockOnly } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  
  // Pass raw string to repo for keyword-based search
  const searchTerm = q ? q.toLowerCase().trim() : "";
  const results = await productRepo.searchProducts(db, searchTerm, locationId, page, limit, inStockOnly === 'true');
  res.json(results);
});

// GET /admin-list
// Mengambil daftar ringkas untuk dropdown/list admin
export const getAdminProductList = catchAsync(async (req, res, next) => {
  const rows = await productRepo.getAllActiveProducts(db);
  res.json({ success: true, data: rows });
});

// GET /
// Main Product List (Mendukung Filter Status, Tipe, Search, Sort)
export const getProducts = catchAsync(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const filters = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    search: req.query.search || "",
    searchBy: req.query.searchBy === "sku" ? "sku" : "name",
    location: req.query.location || "all",
    status: req.query.status || "active",
    is_package: req.query.is_package !== undefined ? req.query.is_package === "true" : undefined,
    packageOnly: req.query.packageOnly === "true",
    stockStatus: req.query.minusOnly === "true" ? "minus" : req.query.stockStatus || "all",

    // Tri-State Filters
    categoryInclude: parseJsonSafe(req.query.categoryInclude, []),
    categoryExclude: parseJsonSafe(req.query.categoryExclude, []),
    buildingInclude: parseJsonSafe(req.query.buildingInclude, []),
    buildingExclude: parseJsonSafe(req.query.buildingExclude, []),
    floorInclude: parseJsonSafe(req.query.floorInclude, []),
    floorExclude: parseJsonSafe(req.query.floorExclude, []),

    // Fallbacks
    building: req.query.building || "all",
    floor: req.query.floor || "all",
    categoryId: req.query.category_id || "",

    sortBy: req.query.sortBy || "sku",
    sortOrder: req.query.sortOrder === "asc" ? "ASC" : "DESC",
    skipComponents: req.query.skipComponents === "true",
  };
  filters.offset = (filters.page - 1) * filters.limit;
  const result = await productRepo.getProductsWithFilters(db, filters);
  res.json(result);
});

// GET /:id
export const getProductById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const product = await productRepo.getProductDetailWithStock(db, id);
  if (!product) {
    throw new AppError("Produk tidak ditemukan", 404, "NOT_FOUND");
  }

  res.json({ success: true, data: product });
});

// GET /:id/stock-details
export const getProductStockDetails = catchAsync(async (req, res) => {
  const { id } = req.params;
  const rows = await productRepo.getProductStockDetails(db, id);
  res.json({ success: true, data: rows });
});

// GET /:id/history
export const getProductHistory = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const history = await productRepo.getProductHistory(db, id);
  res.json({ success: true, data: history });
});

// GET /:id/stock-timeline
export const getProductStockTimeline = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { page, limit, building } = req.query;

  let buildingsArray = [];
  if (building) {
    buildingsArray = Array.isArray(building) ? building : building.split(",");
  }

  const filters = {
    buildings: buildingsArray,
  };

  const timeline = await productService.getHistoricalStockTimelineService(
    id,
    page,
    limit,
    filters,
  );
  res.json({ success: true, data: timeline });
});

// ============================================================================
// WRITE OPERATIONS (Via Service Layer)
// ============================================================================

// POST /
// Membuat produk baru
export const createProduct = catchAsync(async (req, res) => {
  const { sku, name, category_id, price, weight, is_package, mediaIds } = req.body;
  const components = parseJsonSafe(req.body.components, typeof req.body.components === "object" ? req.body.components : []);
  const parsedMediaIds = parseJsonSafe(mediaIds, Array.isArray(mediaIds) ? mediaIds : []);
  const userId = req.user.id;

  try {
    const productId = await productService.createProductService(
      { sku, name, category_id, price, weight, is_package, components, mediaIds: parsedMediaIds },
      userId,
    );

    cache.flushAll(); // Reset cache WMS
    res.status(201).json({ success: true, message: "Produk berhasil dibuat.", productId });
  } catch (error) {
    if (error.code === "DUPLICATE_SKU" || error.code === "ER_DUP_ENTRY") {
      throw new AppError("SKU sudah terdaftar.", 409, "DUPLICATE_SKU");
    }
    throw error;
  }
});

// PUT /:id
// Memperbarui produk
export const updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { sku, name, category_id, price, weight, is_package, is_active, mediaIds } = req.body;
  const components = parseJsonSafe(req.body.components, typeof req.body.components === "object" ? req.body.components : []);
  const parsedMediaIds = parseJsonSafe(mediaIds, Array.isArray(mediaIds) ? mediaIds : []);
  const userId = req.user.id;

  // Handle Restore Action (Specific Case)
  if (is_active === true && !name) {
    await productService.restoreProductService(id, userId);
    cache.flushAll();
    return res.json({ success: true, message: "Produk berhasil dipulihkan." });
  }

  try {
    await productService.updateProductService(
      id,
      { sku, name, category_id, price, weight, is_package, components, mediaIds: parsedMediaIds },
      userId
    );

    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    if (error.code === "PRODUCT_NOT_FOUND") {
      throw new AppError("Produk tidak ditemukan.", 404, "NOT_FOUND");
    }
    throw error;
  }
});

// DELETE /:id
// Soft delete produk (set is_active = 0)
export const deleteProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  await productService.softDeleteProductService(id, userId);
  cache.flushAll();
  res.json({ success: true, message: "Produk berhasil diarsipkan." });
});

// POST /:id/link-media
export const linkMediaToProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { mediaIds } = req.body;

  await productService.linkMediaToProductService(id, mediaIds, userId);
  cache.flushAll();
  res.json({
    success: true,
    message: "Media berhasil disematkan.",
  });
});

// DELETE /:id/images/:imageId
export const deleteProductImage = catchAsync(async (req, res) => {
  const { imageId } = req.params; // Get imageId from URL
  const userId = req.user.id;

  await productService.deleteProductImageService(imageId, userId);
  cache.flushAll();
  res.json({ success: true, message: "Gambar berhasil dihapus." });
});

// PUT /:id/images/:imageId/primary
export const setPrimaryImage = catchAsync(async (req, res) => {
  const { id, imageId } = req.params;
  const userId = req.user.id;

  await productService.setPrimaryImageService(id, imageId, userId);
  cache.flushAll();
  res.json({ success: true, message: "Gambar utama berhasil diatur." });
});

// ============================================================================
// EXPORT OPERATIONS
// ============================================================================

/**
 * GET /api/products/export
 * Mengenerate Job Export CSV berdasarkan filter yang aktif (untuk Template Edit Massal)
 */
export const exportProducts = catchAsync(async (req, res, next) => {
  const filters = {
    search: req.query.search || "",
    searchBy: req.query.searchBy === "sku" ? "sku" : "name",
    location: req.query.location || "all",
    status: req.query.status || "active",
    is_package: req.query.is_package !== undefined ? req.query.is_package === "true" : undefined,
    packageOnly: req.query.packageOnly === "true",
    minusStockOnly: req.query.minusOnly === "true",
    building: req.query.building || "all",
    floor: req.query.floor || "all",
    sortBy: req.query.sortBy || "sku",
    sortOrder: req.query.sortOrder === "desc" ? "DESC" : "ASC",
    limit: 1000000,
    offset: 0,
    exportType: EXPORT_JOB_TYPE.PRODUCT_MASTER,
    format: req.query.format || "xlsx",
    includeImages: req.query.includeImages === "true" || req.query.includeImages === true,
    columns: req.query.columns ? JSON.parse(req.query.columns) : null,
  };

  const userId = req.user.id;
  const jobId = await jobRepo.createExportJob(db, {
    userId,
    filters,
    jobType: EXPORT_JOB_TYPE.PRODUCT_MASTER,
  });

  res.json({
    success: true,
    message: "Permintaan ekspor diterima. Silakan cek menu 'Laporan Saya' untuk mengunduh.",
    jobId,
  });
});
