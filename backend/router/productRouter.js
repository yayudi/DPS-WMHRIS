// backend\router\productRouter.js
import express from "express";
import db from "../config/db.js";
import cache from "../config/cache.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

/**
 * GET /api/products
 * Endpoint utama untuk menampilkan daftar produk di WMS.
 */
router.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const cacheKey = req.originalUrl;
  if (cache.has(cacheKey)) {
    return res.json(cache.get(cacheKey));
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const search = req.query.search || "";
    const searchBy = req.query.searchBy === "sku" ? "p.sku" : "p.name";
    const location = req.query.location || "gudang";
    const minusStockOnly = req.query.minusStockOnly === "true";
    const building = req.query.building || "all";
    const floor = req.query.floor || "all";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder === "desc" ? "DESC" : "ASC";
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["name", "sku", "price"];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? `p.${sortBy}` : "p.name";

    let whereClauses = [];
    let params = [];

    whereClauses.push("p.is_active = TRUE");

    const existsConditions = [];

    if (location === "gudang") {
      if (building === "all") {
        existsConditions.push(
          `(l.building = 'A19' OR l.building = 'A20' OR l.building = 'B16' OR l.building = 'OASIS')`
        );
      } else {
        existsConditions.push(`l.building = ?`);
        params.push(building);
      }
    } else if (location === "pajangan") {
      existsConditions.push(`l.building = 'Pajangan'`);
    } else if (location === "ltc") {
      existsConditions.push(`l.building = 'LTC'`);
    }

    if (floor && floor !== "all" && location !== "ltc") {
      existsConditions.push(`l.floor = ?`);
      params.push(floor);
    }

    if (existsConditions.length > 0) {
      whereClauses.push(
        `EXISTS (
                SELECT 1
                FROM stock_locations sl
                JOIN locations l ON sl.location_id = l.id
                WHERE sl.product_id = p.id AND ${existsConditions.join(" AND ")}
            )`
      );
    }

    if (search) {
      whereClauses.push(`${searchBy} LIKE ?`);
      params.push(`%${search}%`);
    }

    if (minusStockOnly) {
      let locationCondition = "";
      if (location === "gudang") {
        if (building === "all") locationCondition = `l.building IN ('A19', 'A20', 'B16', 'OASIS')`;
        else locationCondition = `l.building = ?`;
      } else if (location === "pajangan") locationCondition = `l.building = 'Pajangan'`;
      else if (location === "ltc") locationCondition = `l.building = 'LTC'`;

      if (locationCondition) {
        const minusStockParams = location === "gudang" && building !== "all" ? [building] : [];
        whereClauses.push(`(
                SELECT SUM(sl.quantity)
                FROM stock_locations sl
                JOIN locations l ON sl.location_id = l.id
                WHERE sl.product_id = p.id AND ${locationCondition}
            ) < 0`);
        params.push(...minusStockParams);
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM products p ${whereSql}`;
    const productsQuery = `
      SELECT p.id, p.sku, p.name, p.price
      FROM products p
      ${whereSql}
      GROUP BY p.id
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [totalRows] = await db.query(countQuery, params);
    const totalProducts = totalRows[0].total;

    const [products] = await db.query(productsQuery, [...params, limit, offset]);

    if (products.length === 0) {
      const responseData = { data: [], total: totalProducts };
      cache.set(cacheKey, responseData);
      return res.json(responseData);
    }

    const productIds = products.map((p) => p.id);
    const stockLocationsQuery = `
      SELECT sl.product_id, l.code as location_code, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id IN (?)
    `;
    const [stockLocations] = await db.query(stockLocationsQuery, [productIds]);

    const productsWithStock = products.map((product) => ({
      ...product,
      stock_locations: stockLocations.filter((sl) => sl.product_id === product.id),
    }));

    const responseData = { data: productsWithStock, total: totalProducts };
    cache.set(cacheKey, responseData);
    res.json(responseData);
  } catch (error) {
    console.error("Error saat mengambil data produk:", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal mengambil data produk.", error: error.message });
  }
});

/**
 * GET /api/products/search
 */
router.get("/search", async (req, res) => {
  try {
    const { q, locationId } = req.query;
    // Ubah search term menjadi huruf kecil di sini
    const searchTerm = `%${q ? q.toLowerCase() : ""}%`; // Tambahkan pengaman jika q kosong

    // --- LOG DEBUG BARU ---
    console.log("DEBUG: Menerima /search request:");
    console.log("Query Parameter (q):", q, typeof q);
    console.log("Query Parameter (locationId):", locationId, typeof locationId);
    // --- AKHIR LOG DEBUG BARU ---

    let query;
    let queryParams;

    // Periksa locationId secara eksplisit terhadap nilai yang tidak diinginkan
    if (locationId && locationId !== "null" && locationId !== "undefined" && locationId !== "") {
      console.log("DEBUG: locationId terdeteksi, menjalankan query JOIN."); // Tambahkan log ini
      // JIKA locationId ADA, query harus JOIN
      query = `
        SELECT p.id, p.sku, p.name, sl.quantity AS current_stock
        FROM products p
        JOIN stock_locations sl ON p.id = sl.product_id
        WHERE sl.location_id = ?
          AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)
          AND sl.quantity > 0
        LIMIT 10
      `;
      // Pastikan search term juga huruf kecil
      queryParams = [locationId, searchTerm, searchTerm];
    } else {
      console.log(
        "DEBUG: locationId TIDAK terdeteksi atau tidak valid, menjalankan query standar."
      ); // Tambahkan log ini
      // JIKA locationId TIDAK ADA, query standar
      query = `
        SELECT id, sku, name FROM products
        WHERE (LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)
        LIMIT 10
      `;
      // Pastikan search term juga huruf kecil
      queryParams = [searchTerm, searchTerm];
    }

    console.log("DEBUG: Menjalankan query pencarian:");
    console.log("SQL:", query);
    console.log("Params:", queryParams);

    const [results] = await db.query(query, queryParams);
    res.json(results); // (atau { success: true, data: results })
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Endpoint untuk membuat produk baru
router.post("/", canAccess("manage-products"), async (req, res) => {
  const { sku, name, price, nickname } = req.body;
  if (!sku || !name || price == null) {
    return res.status(400).json({ success: false, message: "SKU, nama, dan harga wajib diisi." });
  }
  try {
    const [result] = await db.query(
      "INSERT INTO products (sku, name, price, nickname) VALUES (?, ?, ?, ?)",
      [sku, name, parseFloat(price), nickname || null]
    );
    cache.flushAll();
    res
      .status(201)
      .json({ success: true, message: "Produk berhasil dibuat.", productId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "SKU sudah ada." });
    }
    console.error("Error saat membuat produk:", error);
    res.status(500).json({ success: false, message: "Gagal membuat produk." });
  }
});

// Endpoint untuk mengedit produk
router.put("/:id", canAccess("manage-products"), async (req, res) => {
  const { id } = req.params;
  const { name, price, nickname } = req.body;
  if (!name || price == null) {
    return res.status(400).json({ success: false, message: "Nama dan harga wajib diisi." });
  }
  try {
    await db.query("UPDATE products SET name = ?, price = ?, nickname = ? WHERE id = ?", [
      name,
      parseFloat(price),
      nickname || null,
      id,
    ]);
    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    console.error("Error saat mengedit produk:", error);
    res.status(500).json({ success: false, message: "Gagal mengedit produk." });
  }
});

// Endpoint untuk menghapus produk (soft delete)
router.delete("/:id", canAccess("manage-products"), async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("UPDATE products SET is_active = FALSE WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
    }
    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil dihapus (dinonaktifkan)." });
  } catch (error) {
    console.error("Error saat menghapus produk:", error);
    res.status(500).json({ success: false, message: "Gagal menghapus produk." });
  }
});

/**
 * --- ENDPOINT BARU ---
 * GET /api/products/:id/stock-details
 * Mengambil semua lokasi dan jumlah stok untuk satu produk spesifik.
 */
router.get("/:id/stock-details", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT
        l.id as location_id,
        l.code as location_code,
        l.building,
        l.floor,
        COALESCE(sl.quantity, 0) as quantity
      FROM locations l
      LEFT JOIN stock_locations sl ON l.id = sl.location_id AND sl.product_id = ?
      ORDER BY l.code;
    `;
    const [rows] = await db.query(query, [id]);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`Error saat mengambil detail stok untuk produk ID ${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail stok." });
  }
});

/**
 * --- ENDPOINT BARU UNTUK ADMIN ---
 * GET /api/products/admin-list
 * Mengambil daftar semua produk yang aktif untuk ditampilkan di panel admin.
 */
router.get("/admin-list", canAccess("manage-products"), async (req, res) => {
  try {
    const [products] = await db.query(
      "SELECT id, sku, name, price, is_active FROM products WHERE is_active = TRUE ORDER BY name ASC"
    );
    res.json({ success: true, data: products });
  } catch (error) {
    console.error("Error saat mengambil daftar produk admin:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data produk." });
  }
});

export default router;
