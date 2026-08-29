import catchAsync from "../utils/catchAsync.js";
// backend/controllers/productController.js
import db from "../config/db.js";
import cache from "../config/cache.js";
import * as productService from "../services/productService.js";
import * as productRepo from "../repositories/productRepository.js";
import * as jobRepo from "../repositories/jobRepository.js";
import Logger from "../utils/logger.js";

import AppError from "../utils/AppError.js";
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
export const getProducts = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const safeParse = (str) => {
      if (!str) return [];
      try {
        return JSON.parse(str);
      } catch {
        return Array.isArray(str) ? str : [str];
      }
    };

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
      categoryInclude: safeParse(req.query.categoryInclude),
      categoryExclude: safeParse(req.query.categoryExclude),
      buildingInclude: safeParse(req.query.buildingInclude),
      buildingExclude: safeParse(req.query.buildingExclude),
      floorInclude: safeParse(req.query.floorInclude),
      floorExclude: safeParse(req.query.floorExclude),

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
  } catch (error) {
    next(error);
  }
};

// GET /:id
export const getProductById = async (req, res, next) => {
  const { id } = req.params;
  try {
    const product = await productRepo.getProductDetailWithStock(db, id);
    if (!product) {
      return next(new AppError("Produk tidak ditemukan", 404));
    }

    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

// GET /:id/stock-details
export const getProductStockDetails = async (req, res, next) => {
  const { id } = req.params;
  try {
    const rows = await productRepo.getProductStockDetails(db, id);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

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
export const createProduct = async (req, res, next) => {
  const { sku, name, category_id, price, weight, is_package, mediaIds } = req.body;
  let components = req.body.components;

  // Handle Components JSON parsing from FormData
  if (typeof components === "string") {
    try {
      components = JSON.parse(components);
    } catch {
      components = [];
    }
  }

  // Parse mediaIds if it comes as stringified array
  let parsedMediaIds = mediaIds || [];
  if (typeof parsedMediaIds === "string") {
    try { parsedMediaIds = JSON.parse(parsedMediaIds); } catch { parsedMediaIds = []; }
  }

  const userId = req.user.id;

  try {
    const productId = await productService.createProductService(
      { sku, name, category_id, price, weight, is_package, components, mediaIds: parsedMediaIds },
      userId,
    );

    cache.flushAll(); // Reset cache WMS
    res.status(201).json({ success: true, message: "Produk berhasil dibuat.", productId });
  } catch (error) {
    Logger.error("Create Product Error", error, "PRODUCT_CONTROLLER");
    if (error.code === "DUPLICATE_SKU" || error.code === "ER_DUP_ENTRY") {
      return next(new AppError("SKU sudah terdaftar.", 409));
    }
    return next(new AppError("Gagal membuat produk.", 500));
  }
};

// PUT /:id
// Memperbarui produk
export const updateProduct = async (req, res, next) => {
  const { id } = req.params;
  const { sku, name, category_id, price, weight, is_package, is_active, mediaIds } = req.body;

  let components = req.body.components;
  if (typeof components === "string") {
    try {
      components = JSON.parse(components);
    } catch {
      components = [];
    }
  }

  let parsedMediaIds = mediaIds || [];
  if (typeof parsedMediaIds === "string") {
    try { parsedMediaIds = JSON.parse(parsedMediaIds); } catch { parsedMediaIds = []; }
  }

  const userId = req.user.id;

  // Handle Restore Action (Specific Case)
  if (is_active === true && !name) {
    try {
      await productService.restoreProductService(id, userId);
      cache.flushAll();
      return res.json({ success: true, message: "Produk berhasil dipulihkan." });
    } catch (error) {
      next(error);
    }
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
    Logger.error("Update Product Error", error, "PRODUCT_CONTROLLER");
    if (error.code === "PRODUCT_NOT_FOUND") {
      return next(new AppError("Produk tidak ditemukan.", 404));
    }
    return next(new AppError("Gagal update produk.", 500));
  }
};

// DELETE /:id
// Soft delete produk (set is_active = 0)
export const deleteProduct = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await productService.softDeleteProductService(id, userId);
    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diarsipkan." });
  } catch (error) {
    next(error);
  }
};

// POST /:id/link-media
export const linkMediaToProduct = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { mediaIds } = req.body;


  try {
    await productService.linkMediaToProductService(id, mediaIds, userId);
    cache.flushAll();
    return res.json({
      success: true,
      message: "Media berhasil disematkan.",
    });
  } catch (error) {
    next(error);
  }
};

// Removed uploadMoreImages; linkMediaToProduct should be used instead.

// DELETE /:id/images/:imageId
export const deleteProductImage = async (req, res, next) => {
  const { imageId } = req.params; // Get imageId from URL
  const userId = req.user.id;

  try {
    await productService.deleteProductImageService(imageId, userId);
    cache.flushAll();
    res.json({ success: true, message: "Gambar berhasil dihapus." });
  } catch (error) {
    next(error);
  }
};

// PUT /:id/images/:imageId/primary
export const setPrimaryImage = async (req, res, next) => {
  const { id, imageId } = req.params;
  const userId = req.user.id;

  try {
    await productService.setPrimaryImageService(id, imageId, userId);
    cache.flushAll();
    res.json({ success: true, message: "Gambar utama berhasil diatur." });
  } catch (error) {
    next(error);
  }
};

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
    exportType: "PRODUCT_MASTER",
    format: req.query.format || "xlsx",
    includeImages: req.query.includeImages === "true" || req.query.includeImages === true,
    columns: req.query.columns ? JSON.parse(req.query.columns) : null,
  };

  const userId = req.user.id;
  const jobId = await jobRepo.createExportJob(db, { userId, filters, jobType: "PRODUCT_MASTER" });

  res.json({
    success: true,
    message: "Permintaan ekspor diterima. Silakan cek menu 'Laporan Saya' untuk mengunduh.",
    jobId,
  });
});
