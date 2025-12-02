// backend\router\productRouter.js
import express from "express";
import db from "../config/db.js";
import cache from "../config/cache.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// ============================================================================
// ✅ SPECIFIC ROUTES (MUST BE DEFINED FIRST)
// ============================================================================

/**
 * GET /api/products/search
 * Endpoint untuk pencarian autocomplete.
 * Moved to TOP to prevent conflict with /:id
 */
router.get("/search", async (req, res) => {
  try {
    const { q, locationId } = req.query;
    const searchTerm = `%${q ? q.toLowerCase() : ""}%`;
    let query, queryParams;

    if (locationId && locationId !== "null" && locationId !== "undefined" && locationId !== "") {
      query = `
        SELECT p.id, p.sku, p.name, sl.quantity AS current_stock
        FROM products p
        JOIN stock_locations sl ON p.id = sl.product_id
        WHERE sl.location_id = ?
          AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)
          AND sl.quantity > 0
        LIMIT 10
      `;
      queryParams = [locationId, searchTerm, searchTerm];
    } else {
      query = `
        SELECT id, sku, name FROM products
        WHERE (LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)
        LIMIT 10
      `;
      queryParams = [searchTerm, searchTerm];
    }
    const [results] = await db.query(query, queryParams);
    res.json(results);
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/products/admin-list
 * Mengambil daftar semua produk yang aktif untuk ditampilkan di panel admin.
 * Moved to TOP to prevent conflict with /:id
 */
router.get("/admin-list", canAccess("manage-products"), async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, sku, name, price, is_package, is_active FROM products WHERE is_active = 1 ORDER BY name ASC"
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error admin list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data produk." });
  }
});

// ============================================================================
// ✅ GENERAL ROUTES
// ============================================================================

/**
 * GET /api/products
 * WMS Endpoint (Refactor Final v3)
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
    const searchBy = req.query.searchBy === "sku" ? "sku" : "name";
    const location = req.query.location || "all";
    const minusStockOnly = req.query.minusOnly === "true";
    const building = req.query.building || "all";
    const floor = req.query.floor || "all";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder === "desc" ? "DESC" : "ASC";
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["name", "sku", "price"];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? `p.${sortBy}` : "p.name";

    let whereClauses = ["p.is_active = TRUE"];
    let locationParams = [];
    let searchParams = [];
    let minusStockParams = [];

    // --- 1. Logika Filter Lokasi ---
    let purpose = "";
    if (location === "gudang") purpose = "WAREHOUSE";
    else if (location === "pajangan") purpose = "DISPLAY";
    else if (location === "ltc") purpose = "BRANCH";

    if (location !== "all") {
      let existsConditions = ["l.purpose = ?"];
      locationParams.push(purpose);

      if (location === "gudang") {
        if (building !== "all") {
          existsConditions.push("l.building = ?");
          locationParams.push(building);
        }
        if (floor !== "all") {
          existsConditions.push("l.floor = ?");
          locationParams.push(floor);
        }
      }

      const existsSql = `EXISTS (
        SELECT 1 FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.product_id = p.id AND ${existsConditions.join(" AND ")}
      )`;
      whereClauses.push(existsSql);
    }

    // --- 2. Logika Search ---
    let keywordClauses = [];
    if (search) {
      const keywords = search.split(" ").filter((k) => k.length > 0);
      if (searchBy === "sku") {
        keywordClauses = keywords.map(() => "(p.sku LIKE ?)");
      } else {
        keywordClauses = keywords.map(() => "(p.name LIKE ?)");
      }
      if (keywordClauses.length > 0) {
        whereClauses.push(`(${keywordClauses.join(" AND ")})`);
        keywords.forEach((keyword) => {
          const searchTerm = `%${keyword}%`;
          searchParams.push(searchTerm);
        });
      }
    }

    // --- 3. Count Query ---
    const countParams = [...locationParams, ...searchParams];
    const countWhereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM products p ${countWhereSql}`;

    // --- 4. Logika Stok Minus ---
    if (minusStockOnly) {
      const minusStockConditions = [];
      if (location !== "all") {
        minusStockConditions.push("l.purpose = ?");
        minusStockParams.push(purpose);
      }
      if (location === "gudang") {
        if (building !== "all") {
          minusStockConditions.push("l.building = ?");
          minusStockParams.push(building);
        }
        if (floor !== "all") {
          minusStockConditions.push("l.floor = ?");
          minusStockParams.push(floor);
        }
      }
      if (search) {
        const searchSql = `(${keywordClauses.join(" AND ")})`;
        minusStockConditions.push(searchSql.replace(/p\./g, "p_sub."));
        minusStockParams.push(...searchParams);
      }

      const joinProductSql = search ? "JOIN products p_sub ON sl.product_id = p_sub.id" : "";
      const minusWhere =
        minusStockConditions.length > 0 ? `AND ${minusStockConditions.join(" AND ")}` : "";

      const minusStockSql = `(
        COALESCE((
          SELECT SUM(sl.quantity)
          FROM stock_locations sl
          JOIN locations l ON sl.location_id = l.id
          ${joinProductSql}
          WHERE sl.product_id = p.id ${minusWhere}
        ), 0) < 0
      )`;
      whereClauses.push(minusStockSql);
    }

    // --- 5. Eksekusi Utama ---
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const [totalRows] = await db.query(countQuery, countParams);
    const totalProducts = totalRows[0].total;

    const productsQuery = `
      SELECT p.id, p.sku, p.name, p.price, p.is_package
      FROM products p
      ${whereSql}
      GROUP BY p.id
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const finalProductParams = [
      ...locationParams,
      ...searchParams,
      ...minusStockParams,
      limit,
      offset,
    ];

    const [products] = await db.query(productsQuery, finalProductParams);

    if (products.length === 0) {
      const responseData = { data: [], total: totalProducts };
      cache.set(cacheKey, responseData);
      return res.json(responseData);
    }

    // --- 6. Fetch Stock Locations ---
    const productIds = products.map((p) => p.id);
    const stockLocationsQuery = `
      SELECT sl.product_id, l.code as location_code, l.purpose, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id IN (?)
    `;
    const [stockLocations] = await db.query(stockLocationsQuery, [productIds]);

    const productsWithStock = products.map((product) => {
      const relevantLocations = stockLocations.filter((sl) => sl.product_id === product.id);
      const total_stock = relevantLocations.reduce((sum, loc) => sum + loc.quantity, 0);
      const all_locations_code = relevantLocations.map((loc) => loc.location_code).join(", ");
      return {
        ...product,
        stock_locations: relevantLocations,
        total_stock: total_stock,
        all_locations_code: all_locations_code,
      };
    });

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

// ============================================================================
// ✅ PARAMETERIZED ROUTES (MUST BE LAST)
// ============================================================================

/**
 * GET /api/products/:id
 * Mengambil detail produk BESERTA komponen paketnya (jika ada)
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });

    const product = rows[0];

    // Jika paket, ambil komponennya
    if (product.is_package) {
      const [components] = await db.query(
        `
        SELECT pc.component_product_id as id, p.sku, p.name, pc.quantity_per_package as quantity
        FROM package_components pc
        JOIN products p ON pc.component_product_id = p.id
        WHERE pc.package_product_id = ?
      `,
        [id]
      );
      product.components = components;
    } else {
      product.components = [];
    }

    res.json({ success: true, data: product });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// GET Stock Details
router.get("/:id/stock-details", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT
        l.id as location_id,
        l.code as location_code,
        l.building,
        l.floor,
        l.purpose,
        COALESCE(sl.quantity, 0) as quantity
      FROM locations l
      LEFT JOIN stock_locations sl ON l.id = sl.location_id AND sl.product_id = ?
      ORDER BY l.code;
    `;
    const [rows] = await db.query(query, [id]);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`Error stok detail ID ${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail stok." });
  }
});

// ============================================================================
// ✅ WRITE OPERATIONS
// ============================================================================

/**
 * POST /api/products
 * Membuat produk baru (Mendukung Paket via Transaksi)
 */
router.post("/", canAccess("manage-products"), async (req, res) => {
  const { sku, name, price, is_package, components } = req.body;

  if (!sku || !name)
    return res.status(400).json({ success: false, message: "SKU & Nama wajib diisi." });
  if (is_package && (!components || components.length === 0)) {
    return res
      .status(400)
      .json({ success: false, message: "Produk paket wajib memiliki minimal 1 komponen." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Insert Product Header
    const [resProd] = await connection.query(
      "INSERT INTO products (sku, name, price, is_package, is_active) VALUES (?, ?, ?, ?, 1)",
      [sku, name, parseFloat(price || 0), is_package ? 1 : 0]
    );
    const newId = resProd.insertId;

    // Insert Components (Jika Paket)
    if (is_package && components.length > 0) {
      const values = components.map((c) => [newId, c.id, c.quantity]);
      await connection.query(
        "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES ?",
        [values]
      );
    }

    await connection.commit();
    cache.flushAll();
    res.status(201).json({ success: true, message: "Produk berhasil dibuat.", productId: newId });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "SKU sudah terdaftar." });
    }
    console.error("Create Product Error:", error);
    res.status(500).json({ success: false, message: "Gagal membuat produk." });
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/products/:id
 * Edit produk (Mendukung Paket via Transaksi)
 */
router.put("/:id", canAccess("manage-products"), async (req, res) => {
  const { id } = req.params;
  const { name, price, is_package, components } = req.body;

  if (!name) return res.status(400).json({ success: false, message: "Nama wajib diisi." });
  if (is_package && (!components || components.length === 0)) {
    return res
      .status(400)
      .json({ success: false, message: "Produk paket wajib memiliki komponen." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Update Product Header
    await connection.query("UPDATE products SET name = ?, price = ?, is_package = ? WHERE id = ?", [
      name,
      parseFloat(price || 0),
      is_package ? 1 : 0,
      id,
    ]);

    // Reset & Re-insert Components
    await connection.query("DELETE FROM package_components WHERE package_product_id = ?", [id]);

    if (is_package && components.length > 0) {
      const values = components.map((c) => [id, c.id, c.quantity]);
      await connection.query(
        "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES ?",
        [values]
      );
    }

    await connection.commit();
    cache.flushAll();
    res.json({ success: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    await connection.rollback();
    console.error("Update Product Error:", error);
    res.status(500).json({ success: false, message: "Gagal update produk." });
  } finally {
    connection.release();
  }
});

// DELETE Product (Soft Delete)
router.delete("/:id", canAccess("manage-products"), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE products SET is_active = FALSE WHERE id = ?", [id]);
    cache.flushAll();
    res.json({ success: true, message: "Produk dinonaktifkan." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
