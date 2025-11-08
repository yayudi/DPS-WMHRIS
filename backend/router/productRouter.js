import express from "express";
import db from "../config/db.js";
import cache from "../config/cache.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

/**
 * GET /api/products
 * WMS Endpoint (Refactor Final v3)
 * - Tab 'All'   : Menampilkan semua produk dari tabel `products`.
 * - Tab 'Lainnya': Menampilkan produk HANYA JIKA `EXISTS` di `stock_locations`
 * dengan `purpose` yang sesuai.
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
    const minusStockOnly = req.query.minusOnly === "true"; // Sesuai log Anda, frontend mungkin mengirim 'minusOnly'
    const building = req.query.building || "all";
    const floor = req.query.floor || "all";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder === "desc" ? "DESC" : "ASC";
    const offset = (page - 1) * limit;

    const allowedSortColumns = ["name", "sku", "price"];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? `p.${sortBy}` : "p.name";

    let whereClauses = ["p.is_active = TRUE"];

    // Arrays terpisah untuk setiap jenis parameter
    let locationParams = [];
    let searchParams = [];
    let minusStockParams = []; // Hanya untuk subquery

    // --- 1. Logika Filter Lokasi (Tanpa default_purpose) ---
    let purpose = "";
    if (location === "gudang") purpose = "WAREHOUSE";
    else if (location === "pajangan") purpose = "DISPLAY";
    else if (location === "ltc") purpose = "BRANCH";

    // HANYA terapkan filter lokasi JIKA tab BUKAN 'all'
    if (location !== "all") {
      let existsConditions = ["l.purpose = ?"];
      locationParams.push(purpose);

      // Filter Building/Floor HANYA jika di tab 'gudang'
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
    // Jika location === 'all', tidak ada filter lokasi yang ditambahkan.

    // --- 2. Logika Search Multi-Keyword ---
    let keywordClauses = [];
    if (search) {
      const keywords = search.split(" ").filter((k) => k.length > 0);

      if (searchBy === "sku") {
        keywordClauses = keywords.map(() => "(p.sku LIKE ?)");
      } else {
        // searchBy === 'name'
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

    // --- 3. Parameter untuk Count Query ---
    const countParams = [...locationParams, ...searchParams];
    const countWhereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM products p ${countWhereSql}`;

    // --- 4. Logika Filter Stok Minus (HANYA untuk Product Query) ---
    if (minusStockOnly) {
      const minusStockConditions = [];

      // Tambahkan filter lokasi ke subquery
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

      // Tambahkan filter search ke subquery
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

    // --- 5. Eksekusi Query ---
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Eksekusi Count Query
    const [totalRows] = await db.query(countQuery, countParams);
    const totalProducts = totalRows[0].total;

    // Eksekusi Product Query
    const productsQuery = `
      SELECT p.id, p.sku, p.name, p.price
      FROM products p
      ${whereSql}
      GROUP BY p.id
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    // Gabungkan SEMUA parameter untuk product query
    const finalProductParams = [
      ...locationParams,
      ...searchParams,
      ...minusStockParams, // (akan kosong jika minusStockOnly=false)
      limit,
      offset,
    ];

    const [products] = await db.query(productsQuery, finalProductParams);

    if (products.length === 0) {
      const responseData = { data: [], total: totalProducts };
      cache.set(cacheKey, responseData);
      return res.json(responseData);
    }

    // --- 6. Ambil Stock Locations (Tetap sama) ---
    const productIds = products.map((p) => p.id);
    const stockLocationsQuery = `
      SELECT sl.product_id, l.code as location_code, l.purpose, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id IN (?)
    `;
    const [stockLocations] = await db.query(stockLocationsQuery, [productIds]);

    // --- ✅ PERUBAHAN DI SINI (Pilihan 2) ---
    // Kita lakukan kalkulasi total di backend, bukan di frontend
    const productsWithStock = products.map((product) => {
      // Ambil semua lokasi yang relevan untuk produk ini
      const relevantLocations = stockLocations.filter((sl) => sl.product_id === product.id);

      // Hitung total stok (untuk tab 'All')
      const total_stock = relevantLocations.reduce((sum, loc) => sum + loc.quantity, 0);

      // (Opsional) Buat daftar lokasi (untuk tab 'All')
      const all_locations_code = relevantLocations.map((loc) => loc.location_code).join(", ");

      return {
        ...product,
        // Frontend (useWms.js) masih butuh ini untuk tab Gudang/Pajangan
        stock_locations: relevantLocations,
        // Properti baru untuk Tab 'All'
        total_stock: total_stock,
        all_locations_code: all_locations_code,
      };
    });
    // --- AKHIR PERUBAHAN ---

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
 * Endpoint untuk pencarian autocomplete.
 */
router.get("/search", async (req, res) => {
  try {
    const { q, locationId } = req.query;
    const searchTerm = `%${q ? q.toLowerCase() : ""}%`;

    let query;
    let queryParams;

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

// Endpoint untuk membuat produk baru
router.post("/", canAccess("manage-products"), async (req, res) => {
  const { sku, name, price } = req.body;
  if (!sku || !name || price == null) {
    return res.status(400).json({ success: false, message: "SKU, nama, dan harga wajib diisi." });
  }
  try {
    const [result] = await db.query("INSERT INTO products (sku, name, price) VALUES (?, ?, ?)", [
      sku,
      name,
      parseFloat(price),
    ]);
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
  const { name, price } = req.body;
  if (!name || price == null) {
    return res.status(400).json({ success: false, message: "Nama dan harga wajib diisi." });
  }
  try {
    await db.query("UPDATE products SET name = ?, price = ? WHERE id = ?", [
      name,
      parseFloat(price),
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
        l.purpose,
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
