// backend/controllers/productController.js
import db from "../config/db.js";
import cache from "../config/cache.js";
import * as productService from "../services/productService.js";
import * as productRepo from "../repositories/productRepository.js";
import * as jobRepo from "../repositories/jobRepository.js";

// ============================================================================
// READ OPERATIONS (Direct Repo Access)
// ============================================================================

// GET /search
// Mencari produk untuk autocomplete
export const searchProducts = async (req, res) => {
  try {
    const { q, locationId } = req.query;
    const searchTerm = `%${q ? q.toLowerCase() : ""}%`;
    // Pass 'db' pool directly to Repo
    const results = await productRepo.searchProducts(db, searchTerm, locationId);
    res.json(results);
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /admin-list
// Mengambil daftar ringkas untuk dropdown/list admin
export const getAdminProductList = async (req, res) => {
  try {
    const rows = await productRepo.getAllActiveProducts(db);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error admin list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data produk." });
  }
};

// GET /
// Main Product List (Mendukung Filter Status, Tipe, Search, Sort)
export const getProducts = async (req, res) => {
  // Disable Cache untuk Admin Panel agar data selalu realtime
  res.setHeader("Cache-Control", "no-store");

  try {
    // 1. Parsing Query Params dari Frontend
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      search: req.query.search || "",
      searchBy: req.query.searchBy === "sku" ? "sku" : "name",
      location: req.query.location || "all", // Support filter WMS

      // Filter Status (Active / Archived)
      status: req.query.status || "active",

      // Filter Tipe Produk (Satuan / Paket)
      // Konversi string 'true'/'false' ke boolean jika ada
      is_package: req.query.is_package !== undefined ? req.query.is_package === "true" : undefined,

      // Backward compatibility untuk WMS Dashboard lama
      packageOnly: req.query.packageOnly === "true",
      minusStockOnly: req.query.minusOnly === "true",

      building: req.query.building || "all",
      floor: req.query.floor || "all",

      // Default Sort: SKU Descending (Produk terbaru biasanya SKU lebih besar/akhir)
      sortBy: req.query.sortBy || "sku",
      sortOrder: req.query.sortOrder === "asc" ? "ASC" : "DESC",
    };
    filters.offset = (filters.page - 1) * filters.limit;

    // 2. Panggil Repo
    const result = await productRepo.getProductsWithFilters(db, filters);

    res.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data produk.",
      error: error.message,
    });
  }
};

// GET /:id
export const getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await productRepo.getProductDetailWithStock(db, id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    console.error("Error fetching product detail:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// GET /:id/stock-details
export const getProductStockDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await productRepo.getProductStockDetails(db, id);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`Error stok detail ID ${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail stok." });
  }
};

// ✅ GET /:id/history
export const getProductHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await productRepo.getProductHistory(db, id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error fetching product history:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat produk." });
  }
};

// ============================================================================
// WRITE OPERATIONS (Via Service Layer)
// ============================================================================

// POST /
// Membuat produk baru
export const createProduct = async (req, res) => {
  const { sku, name, price, weight, is_package, components } = req.body;
  const userId = req.user.id; // ✅ Ambil ID User untuk Audit Log

  // Validasi Input
  if (!sku || !name) {
    return res.status(400).json({ success: false, message: "SKU & Nama wajib diisi." });
  }
  if (is_package && (!components || components.length === 0)) {
    return res
      .status(400)
      .json({ success: false, message: "Produk paket wajib memiliki komponen." });
  }

  try {
    const productId = await productService.createProductService(
      { sku, name, price, weight, is_package, components },
      userId
    );

    cache.flushAll(); // Reset cache WMS
    res.status(201).json({ success: true, message: "Produk berhasil dibuat.", productId });
  } catch (error) {
    console.error("Create Product Error:", error);
    if (error.code === "DUPLICATE_SKU" || error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "SKU sudah terdaftar." });
    }
    res.status(500).json({ success: false, message: "Gagal membuat produk." });
  }
};

// PUT /:id
// Memperbarui produk
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  // ✅ Ambil 'weight' dari body
  const { name, price, weight, is_package, components, is_active } = req.body;
  const userId = req.user.id; // ✅ Ambil ID User untuk Audit Log

  // Handle Restore Action (Specific Case)
  if (is_active === true && !name) {
    try {
      await productService.restoreProductService(id, userId);
      cache.flushAll();
      return res.json({ success: true, message: "Produk berhasil dipulihkan." });
    } catch (error) {
      console.error("Restore Error:", error);
      return res.status(500).json({ success: false, message: "Gagal memulihkan produk." });
    }
  }

  // Regular Update
  if (!name) return res.status(400).json({ success: false, message: "Nama wajib diisi." });

  try {
    await productService.updateProductService(
      id,
      { name, price, weight, is_package, components },
      userId
    );

    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    console.error("Update Product Error:", error);
    if (error.code === "PRODUCT_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
    }
    res.status(500).json({ success: false, message: "Gagal update produk." });
  }
};

// DELETE /:id
// Soft delete produk (set is_active = 0)
export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await productService.softDeleteProductService(id, userId);
    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diarsipkan." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// EXPORT OPERATIONS
// ============================================================================

/**
 * GET /api/products/export
 * Mengenerate Job Export CSV berdasarkan filter yang aktif (untuk Template Edit Massal)
 */
export const exportProducts = async (req, res) => {
  try {
    // 1. Ambil filter dari Query Params (Sama persis dengan getProducts)
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

      // Matikan Pagination untuk Export (Set limit sangat besar)
      limit: 1000000,
      offset: 0,

      // ✅ TAMBAHKAN TIPE EXPORT
      exportType: "PRODUCT_MASTER",
      format: req.query.format || "xlsx",
    };

    const userId = req.user.id;
    const jobId = await jobRepo.createExportJob(db, { userId, filters, jobType: "PRODUCT_MASTER" });

    res.json({
      success: true,
      message: "Permintaan ekspor diterima. Silakan cek menu 'Laporan Saya' untuk mengunduh.",
      jobId,
    });
  } catch (error) {
    console.error("Export Request Error:", error);
    res.status(500).json({ success: false, message: "Gagal membuat permintaan ekspor." });
  }
};
