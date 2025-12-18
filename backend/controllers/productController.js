import db from "../config/db.js";
import cache from "../config/cache.js";
import * as productRepository from "../repositories/productRepository.js";

// GET /search
// Mencari produk untuk autocomplete
export const searchProducts = async (req, res) => {
  try {
    const { q, locationId } = req.query;
    const searchTerm = `%${q ? q.toLowerCase() : ""}%`;

    // Memanggil fungsi pencarian dari repository dengan db connection
    const results = await productRepository.searchProducts(db, searchTerm, locationId);
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
    const rows = await productRepository.getAllActiveProducts(db);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error admin list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data produk." });
  }
};

// GET /
// Main WMS Product List (dengan filter, pagination, sort, dll)
export const getProducts = async (req, res) => {
  // Setup Cache Control
  res.setHeader("Cache-Control", "no-store");
  const cacheKey = req.originalUrl;

  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    // Menyiapkan object filter dari query params
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 30,
      search: req.query.search || "",
      searchBy: req.query.searchBy === "sku" ? "sku" : "name",
      location: req.query.location || "all",
      minusStockOnly: req.query.minusOnly === "true",
      packageOnly: req.query.packageOnly === "true", // <--- Parameter baru untuk filter paket
      building: req.query.building || "all",
      floor: req.query.floor || "all",
      sortBy: req.query.sortBy || "name",
      sortOrder: req.query.sortOrder === "desc" ? "DESC" : "ASC",
    };
    filters.offset = (filters.page - 1) * filters.limit;

    // Memanggil logika filter kompleks di repository
    const result = await productRepository.getProductsWithFilters(db, filters);

    // Simpan ke cache dan kirim response
    cache.set(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error("Error saat mengambil data produk:", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal mengambil data produk.", error: error.message });
  }
};

// GET /:id
// Mengambil detail produk lengkap (termasuk komponen paket & stok)
export const getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    // Pass 'db' karena fungsi repository ini membutuhkan parameter connection
    const product = await productRepository.getProductDetailWithStock(db, id);

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
// Mengambil rincian stok per lokasi
export const getProductStockDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await productRepository.getProductStockDetails(db, id);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`Error stok detail ID ${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail stok." });
  }
};

// POST /
// Membuat produk baru
export const createProduct = async (req, res) => {
  const { sku, name, price, is_package, components } = req.body;

  // Validasi Input
  if (!sku || !name) {
    return res.status(400).json({ success: false, message: "SKU & Nama wajib diisi." });
  }
  if (is_package && (!components || components.length === 0)) {
    return res
      .status(400)
      .json({ success: false, message: "Produk paket wajib memiliki minimal 1 komponen." });
  }

  try {
    // Cek apakah SKU sudah ada
    const existingId = await productRepository.getIdBySku(db, sku);
    if (existingId) {
      return res.status(409).json({ success: false, message: "SKU ini sudah terdaftar." });
    }

    // Jalankan transaksi pembuatan produk via Repository
    // Kita pass 'db' pool, repository akan membuat connection sendiri dari pool itu
    const productId = await productRepository.createProductTransaction(
      db,
      { sku, name, price, is_package },
      components
    );

    // Bersihkan cache agar data baru muncul
    cache.flushAll();
    res.status(201).json({ success: true, message: "Produk berhasil dibuat.", productId });
  } catch (error) {
    console.error("Create Product Error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "SKU sudah terdaftar." });
    }
    res.status(500).json({ success: false, message: "Gagal membuat produk." });
  }
};

// PUT /:id
// Memperbarui produk
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, price, is_package, components } = req.body;

  // Validasi Input
  if (!name) return res.status(400).json({ success: false, message: "Nama wajib diisi." });
  if (is_package && (!components || components.length === 0)) {
    return res
      .status(400)
      .json({ success: false, message: "Produk paket wajib memiliki komponen." });
  }

  try {
    // Jalankan transaksi update via Repository
    await productRepository.updateProductTransaction(
      db,
      id,
      { name, price, is_package },
      components
    );

    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(500).json({ success: false, message: "Gagal update produk." });
  }
};

// DELETE /:id
// Soft delete produk (set is_active = 0)
export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    await productRepository.softDeleteProduct(db, id);

    cache.flushAll();
    res.json({ success: true, message: "Produk dinonaktifkan." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
