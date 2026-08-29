// backend/repositories/productRepository.js
// ============================================================================
// READ OPERATIONS (Complex Queries & Aggregations)
// ============================================================================

/**
 * Mengambil daftar produk berdasarkan berbagai filter kompleks (pagination, pencarian, status, stok, dll)
 * @param {import('mysql2/promise').Connection} connection - Koneksi database
 * @param {Object} filters - Objek filter
 * @param {number} filters.limit - Limit pagination
 * @param {number} filters.offset - Offset pagination
 * @param {string} [filters.search] - Kata kunci pencarian
 * @param {string} [filters.searchBy] - 'sku' atau 'name'
 * @param {string} [filters.location] - 'all', 'gudang', 'pajangan', 'ltc'
 * @param {string} [filters.stockStatus] - 'all', 'minus', atau 'positive'
 * @param {boolean} [filters.packageOnly] - Hanya ambil produk paket
 * @param {boolean} [filters.is_package] - Filter tipe paket secara spesifik
 * @param {string} [filters.status] - 'all', 'active', 'archived'
 * @param {string} [filters.sortBy] - Kolom pengurutan (name, sku, price, updated_at, dll)
 * @param {string} [filters.sortOrder] - 'ASC' atau 'DESC'
 * @returns {Promise<{data: Array<Object>, total: number}>}
 */
export const getProductsWithFilters = async (connection, filters) => {
  const {
    limit,
    offset,
    search,
    searchBy,
    location,
    stockStatus,
    packageOnly,
    is_package,
    status,
    building,
    floor,
    sortBy,
    sortOrder,
    skipComponents,
  } = filters;

  const allowedSortColumns = ["name", "sku", "price", "updated_at", "deleted_at", "weight"];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? `p.${sortBy}` : "p.name";

  // LOGIKA STATUS: Menggunakan is_active DAN deleted_at
  const whereClauses = [];
  const queryParams = [];

  // Filter Status
  if (status === "archived") {
    // Produk arsip = yang is_active 0 ATAU deleted_at terisi
    whereClauses.push("(p.is_active = 0 OR p.deleted_at IS NOT NULL)");
  } else if (status === "all") {
    whereClauses.push("1=1");
  } else {
    // Default: Active only
    whereClauses.push("(p.is_active = 1 AND p.deleted_at IS NULL)");
  }

  // Filter Tipe Package
  if (is_package !== undefined) {
    whereClauses.push(`p.is_package = ?`);
    queryParams.push(is_package ? 1 : 0);
  } else if (packageOnly) {
    whereClauses.push("p.is_package = 1");
  }

  // Filter Kategori
  if (filters.categoryInclude && filters.categoryInclude.length > 0) {
    whereClauses.push("p.category_id IN (?)");
    queryParams.push(filters.categoryInclude);
  } else if (filters.categoryId && filters.categoryId !== "all") {
    whereClauses.push("p.category_id = ?");
    queryParams.push(filters.categoryId);
  }

  if (filters.categoryExclude && filters.categoryExclude.length > 0) {
    whereClauses.push("p.category_id NOT IN (?)");
    queryParams.push(filters.categoryExclude);
  }

  // Filter Lokasi (Subquery EXISTS)
  let purpose = "";
  if (location === "gudang") purpose = "WAREHOUSE";
  else if (location === "pajangan") purpose = "DISPLAY";
  else if (location === "ltc") purpose = "BRANCH";

  if (location !== "all") {
    const existsConditions = ["l.purpose = ?"];
    queryParams.push(purpose);

    if (location === "gudang") {
      if (filters.buildingInclude && filters.buildingInclude.length > 0) {
        existsConditions.push("l.building IN (?)");
        queryParams.push(filters.buildingInclude);
      } else if (building !== "all") {
        existsConditions.push("l.building = ?");
        queryParams.push(building);
      }

      if (filters.buildingExclude && filters.buildingExclude.length > 0) {
        existsConditions.push("l.building NOT IN (?)");
        queryParams.push(filters.buildingExclude);
      }

      if (filters.floorInclude && filters.floorInclude.length > 0) {
        existsConditions.push("l.floor IN (?)");
        queryParams.push(filters.floorInclude);
      } else if (floor !== "all") {
        existsConditions.push("l.floor = ?");
        queryParams.push(floor);
      }

      if (filters.floorExclude && filters.floorExclude.length > 0) {
        existsConditions.push("l.floor NOT IN (?)");
        queryParams.push(filters.floorExclude);
      }
    }

    const existsSql = `EXISTS (
        SELECT 1 FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.product_id = p.id AND ${existsConditions.join(" AND ")}
      )`;
    whereClauses.push(existsSql);
  }

  // Filter Pencarian
  if (search) {
    let keywordClauses;
    const keywords = search.split(" ").filter((k) => k.length > 0);
    if (searchBy === "sku") {
      keywordClauses = keywords.map(() => "(p.sku LIKE ?)");
    } else {
      keywordClauses = keywords.map(() => "(p.name LIKE ?)");
    }
    if (keywordClauses.length > 0) {
      whereClauses.push(`(${keywordClauses.join(" AND ")})`);
      keywords.forEach((keyword) => queryParams.push(`%${keyword}%`));
    }
  }

  // Filter Stock Status (All / Minus / Positive)
  if (stockStatus !== "all") {
    // Note: Logic minus stock direplikasi sesuai versi asli
    const statusConditions = [];
    if (location !== "all") {
      statusConditions.push("l.purpose = ?");
      // Parameter purpose sudah ada di queryParams jika location != all,
      queryParams.push(purpose);
    }

    // Jika ada filter lokasi gudang detail
    if (location === "gudang") {
      if (filters.buildingInclude && filters.buildingInclude.length > 0) {
        statusConditions.push("l.building IN (?)");
        queryParams.push(filters.buildingInclude);
      } else if (building !== "all") {
        statusConditions.push("l.building = ?");
        queryParams.push(building);
      }

      if (filters.buildingExclude && filters.buildingExclude.length > 0) {
        statusConditions.push("l.building NOT IN (?)");
        queryParams.push(filters.buildingExclude);
      }

      if (filters.floorInclude && filters.floorInclude.length > 0) {
        statusConditions.push("l.floor IN (?)");
        queryParams.push(filters.floorInclude);
      } else if (floor !== "all") {
        statusConditions.push("l.floor = ?");
        queryParams.push(floor);
      }

      if (filters.floorExclude && filters.floorExclude.length > 0) {
        statusConditions.push("l.floor NOT IN (?)");
        queryParams.push(filters.floorExclude);
      }
    }

    const statusWhere = statusConditions.length > 0 ? `AND ${statusConditions.join(" AND ")}` : "";

    // Subquery untuk cek total stok
    const operator = stockStatus === "minus" ? "<" : ">=";
    const statusStockSql = `(
        COALESCE((
          SELECT SUM(sl.quantity)
          FROM stock_locations sl
          JOIN locations l ON sl.location_id = l.id
          WHERE sl.product_id = p.id ${statusWhere}
        ), 0) ${operator} 0
      )`;
    whereClauses.push(statusStockSql);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM products p ${whereSql}`;
  const [totalRows] = await connection.query(countQuery, queryParams);
  const totalProducts = totalRows[0]?.total || 0;
  const productsQuery = `
      SELECT p.id, p.sku, p.name, p.category_id, c.name as category_name, p.price, p.weight, p.is_package, p.is_active, p.deleted_at,
      (SELECT COUNT(*) FROM package_components pc WHERE pc.package_product_id = p.id) as component_count,
      (SELECT ma.main_path FROM product_images pi JOIN media_assets ma ON pi.media_id = ma.id WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as image_path,
      (SELECT ma.thumbnail_path FROM product_images pi JOIN media_assets ma ON pi.media_id = ma.id WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as thumbnail_path
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereSql}
      GROUP BY p.id
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
  const finalParams = [...queryParams, limit, offset];

  const [products] = await connection.query(productsQuery, finalParams);

  if (products.length === 0) {
    return { data: [], total: totalProducts };
  }
  const productIds = products.map((p) => p.id);
  const stockLocationsQuery = `
      SELECT sl.product_id, l.code as location_code, l.purpose, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.quantity != 0 AND sl.product_id IN (?)
    `;
  const [stockLocations] = await connection.query(stockLocationsQuery, [productIds]);

  const productsWithStock = products.map((product) => {
    const relevantLocations = stockLocations.filter((sl) => sl.product_id === product.id);
    const total_stock = relevantLocations.reduce((sum, loc) => sum + loc.quantity, 0);
    const all_locations_code = relevantLocations.map((loc) => loc.location_code).join(", ");
    return {
      ...product,
      stock_locations: relevantLocations,
      total_stock: total_stock,
      all_locations_code: all_locations_code,
      components: [],
    };
  });
  const packageIds = products.filter((p) => p.is_package === 1).map((p) => p.id);

  if (packageIds.length > 0 && !skipComponents) {
    const componentsQuery = `
      SELECT
        pc.package_product_id,
        pc.component_product_id as id,
        pc.quantity_per_package as quantity,
        p.name,
        p.sku,
        p.weight
      FROM package_components pc
      JOIN products p ON pc.component_product_id = p.id
      WHERE pc.package_product_id IN (?)
    `;
    const [componentRows] = await connection.query(componentsQuery, [packageIds]);
    const componentIds = [...new Set(componentRows.map((c) => c.id))];
    const componentStockMap = {}; // Map<ComponentID, TotalStock>

    if (componentIds.length > 0) {
      let stockQuery = `
          SELECT sl.product_id, SUM(sl.quantity) as total_stock
          FROM stock_locations sl
          JOIN locations l ON sl.location_id = l.id
          WHERE sl.product_id IN (?)
      `;
      const stockParams = [componentIds];
      if (location !== "all") {
        stockQuery += " AND l.purpose = ?";
        stockParams.push(purpose);

        if (location === "gudang") {
          if (filters.buildingInclude && filters.buildingInclude.length > 0) {
            stockQuery += " AND l.building IN (?)";
            stockParams.push(filters.buildingInclude);
          } else if (building !== "all") {
            stockQuery += " AND l.building = ?";
            stockParams.push(building);
          }

          if (filters.buildingExclude && filters.buildingExclude.length > 0) {
            stockQuery += " AND l.building NOT IN (?)";
            stockParams.push(filters.buildingExclude);
          }

          if (filters.floorInclude && filters.floorInclude.length > 0) {
            stockQuery += " AND l.floor IN (?)";
            stockParams.push(filters.floorInclude);
          } else if (floor !== "all") {
            stockQuery += " AND l.floor = ?";
            stockParams.push(floor);
          }

          if (filters.floorExclude && filters.floorExclude.length > 0) {
            stockQuery += " AND l.floor NOT IN (?)";
            stockParams.push(filters.floorExclude);
          }
        }
      }

      stockQuery += " GROUP BY sl.product_id";

      const [stockRows] = await connection.query(stockQuery, stockParams);
      stockRows.forEach((row) => {
        componentStockMap[row.product_id] = row.total_stock;
      });
    }

    // Grouping components by package_product_id
    const componentsMap = {};
    componentRows.forEach((row) => {
      if (!componentsMap[row.package_product_id]) {
        componentsMap[row.package_product_id] = [];
      }
      componentsMap[row.package_product_id].push({
        id: row.id,
        name: row.name,
        sku: row.sku,
        quantity: row.quantity,
        weight: row.weight, // calc total weight frontend
        stock_available: componentStockMap[row.id] || 0, // calc virtual stock frontend
      });
    });

    // Assign to products
    productsWithStock.forEach((product) => {
      if (product.is_package && componentsMap[product.id]) {
        product.components = componentsMap[product.id];
      }
    });
  }

  return { data: productsWithStock, total: totalProducts };
};

/**
 * Mengambil aliran (stream) data produk berdasarkan filter untuk keperluan ekspor masif (OOM Protection).
 * @param {import('mysql2/promise').Connection} connection - Koneksi database
 * @param {Object} filters - Objek filter
 * @returns {import('stream').Readable}
 */
export const getProductsWithFiltersStream = (connection, filters) => {
  const { search, searchBy, packageOnly, is_package, status, location, sortBy, sortOrder } =
    filters;
  const allowedSortColumns = ["name", "sku", "price", "updated_at", "deleted_at", "weight"];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? `p.${sortBy}` : "p.name";
  const whereClauses = [];
  const queryParams = [];

  if (status === "archived") {
    whereClauses.push("(p.is_active = 0 OR p.deleted_at IS NOT NULL)");
  } else if (status === "all") {
    whereClauses.push("1=1");
  } else {
    whereClauses.push("(p.is_active = 1 AND p.deleted_at IS NULL)");
  }

  if (is_package !== undefined) {
    whereClauses.push(`p.is_package = ?`);
    queryParams.push(is_package ? 1 : 0);
  } else if (packageOnly) {
    whereClauses.push("p.is_package = 1");
  }

  if (filters.categoryInclude && filters.categoryInclude.length > 0) {
    whereClauses.push("p.category_id IN (?)");
    queryParams.push(filters.categoryInclude);
  } else if (filters.categoryId && filters.categoryId !== "all") {
    whereClauses.push("p.category_id = ?");
    queryParams.push(filters.categoryId);
  }

  let purpose = "";
  if (location === "gudang") purpose = "WAREHOUSE";
  else if (location === "pajangan") purpose = "DISPLAY";
  else if (location === "ltc") purpose = "BRANCH";

  if (location !== "all" && location !== undefined) {
    const existsConditions = ["l.purpose = ?"];
    queryParams.push(purpose);
    const existsSql = `EXISTS (
        SELECT 1 FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.product_id = p.id AND ${existsConditions.join(" AND ")}
      )`;
    whereClauses.push(existsSql);
  }

  if (search) {
    let keywordClauses;
    const keywords = search.split(" ").filter((k) => k.length > 0);
    if (searchBy === "sku") {
      keywordClauses = keywords.map(() => "(p.sku LIKE ?)");
    } else {
      keywordClauses = keywords.map(() => "(p.name LIKE ?)");
    }
    if (keywordClauses.length > 0) {
      whereClauses.push(`(${keywordClauses.join(" AND ")})`);
      keywords.forEach((keyword) => queryParams.push(`%${keyword}%`));
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const includeImageSql =
    filters.includeImages === "true" || filters.includeImages === true
      ? ", (SELECT GROUP_CONCAT(ma.main_path ORDER BY pi.is_primary DESC, pi.sort_order ASC SEPARATOR ',') FROM product_images pi JOIN media_assets ma ON pi.media_id = ma.id WHERE pi.product_id = p.id) as main_paths"
      : "";

  const productsQuery = `
      SELECT p.id, p.sku, p.name, p.category_id, c.name as category_name, p.price, p.weight, p.length, p.width, p.height, p.is_package, p.is_active, p.deleted_at${includeImageSql}
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereSql}
      ORDER BY ${safeSortBy} ${sortOrder || "ASC"}
    `;

  return connection.connection.query(productsQuery, queryParams).stream();
};

/**
 * Mengambil detail produk lengkap termasuk gambar, lokasi stok, dan komponen (jika berupa paket).
 * @param {import('mysql2/promise').Connection} connection - Koneksi database
 * @param {number|string} id - ID Produk
 * @returns {Promise<Object|null>}
 */
export const getProductDetailWithStock = async (connection, id) => {
  const [rows] = await connection.query(
    "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
    [id],
  );
  if (rows.length === 0) return null;
  const product = rows[0];
  const [images] = await connection.query(
    "SELECT pi.id, ma.id as media_id, ma.main_path as image_path, ma.thumbnail_path, ma.title, pi.is_primary FROM product_images pi JOIN media_assets ma ON pi.media_id = ma.id WHERE pi.product_id = ? ORDER BY pi.is_primary DESC, pi.sort_order ASC",
    [id],
  );
  product.images = images;
  // Fallback for UI if needed (though UI should check images array)
  product.image_path = images.length > 0 ? images[0].image_path : null;

  product.components = [];
  product.stock_locations = [];

  const productIdsToCheck = [product.id];

  // 2. Jika Paket, Ambil Komponen
  if (product.is_package) {
    const [components] = await connection.query(
      `SELECT pc.component_product_id as id, p.sku, p.name, pc.quantity_per_package, pc.quantity_per_package as quantity
        FROM package_components pc
        JOIN products p ON pc.component_product_id = p.id
        WHERE pc.package_product_id = ?`,
      [id],
    );
    product.components = components;
    components.forEach((comp) => productIdsToCheck.push(comp.id));
  }

  if (productIdsToCheck.length > 0) {
    const stockLocationsQuery = `
        SELECT sl.product_id, l.code as location_code, l.purpose, sl.quantity
        FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.quantity > 0 AND sl.product_id IN (?)`;

    const [stockRows] = await connection.query(stockLocationsQuery, [productIdsToCheck]);
    product.stock_locations = stockRows.filter((stock) => stock.product_id === product.id);
    if (product.components.length > 0) {
      product.components = product.components.map((comp) => {
        return {
          ...comp,
          stock_locations: stockRows.filter((stock) => stock.product_id === comp.id),
        };
      });
    }
  }

  return product;
};

// ============================================================================
// SIMPLE READS & LOOKUPS
// ============================================================================

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export const getProductById = async (connection, id) => {
  const [rows] = await connection.query(
    "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
    [id],
  );
  return rows.length > 0 ? rows[0] : null;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {any} sku
 * @returns {Promise<any>}
 */
export const getIdBySku = async (connection, sku) => {
  const [rows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
  return rows.length > 0 ? rows[0].id : null;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {boolean} skuList
 * @returns {Promise<any>}
 */
export const getProductsBySkus = async (connection, skuList) => {
  if (!skuList || skuList.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, sku, is_package, name, price, weight FROM products WHERE sku IN (?)`,
    [skuList],
  );
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
export const getAllActiveProducts = async (connection) => {
  const [rows] = await connection.query(
    "SELECT p.id, p.sku, p.name, p.category_id, c.name as category_name, p.price, p.is_package, p.is_active FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1 ORDER BY p.name ASC",
  );
  return rows;
};

/**
 * Pencarian produk untuk autocomplete.
 * Jika locationId diberikan, semua produk aktif tetap ditampilkan,
 * tetapi stok di lokasi tersebut ikut disertakan (current_stock).
 * Produk yang memiliki stok di lokasi diprioritaskan di urutan atas.
 * @param {import('mysql2/promise').Connection} connection - Koneksi database
 * @param {string} searchTerm - Kata kunci pencarian
 * @param {number|string|null} locationId - ID lokasi (opsional)
 * @param {number} page - Halaman
 * @param {number} limit - Jumlah per halaman
 * @returns {Promise<{data: Array<object>, nextCursor: number|null}>}
 */
export const searchProducts = async (
  connection,
  searchTerm,
  locationId,
  page = 1,
  limit = 20,
  inStockOnly = false,
) => {
  const queryParams = [];
  const offset = (page - 1) * limit;

  const keywords = (searchTerm || "").split(" ").filter((k) => k.length > 0);
  const keywordClauses = keywords.map(() => "(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)");
  const keywordSql = keywordClauses.length > 0 ? `AND (${keywordClauses.join(" AND ")})` : "";

  const inStockSql = inStockOnly
    ? `AND EXISTS (SELECT 1 FROM stock_locations sl WHERE sl.product_id = p.id AND sl.quantity > 0)`
    : "";

  const keywordParams = [];
  keywords.forEach((keyword) => {
    keywordParams.push(`%${keyword}%`, `%${keyword}%`);
  });

  let query;

  if (locationId && locationId !== "null" && locationId !== "undefined" && locationId !== "") {
    // LEFT JOIN: Tampilkan SEMUA produk aktif, sertakan stok di lokasi jika ada.
    // Produk dengan stok > 0 di lokasi akan muncul di atas (ORDER BY has_stock DESC).
    query = `SELECT p.id, p.sku, p.name, p.price, p.weight,
                    COALESCE(sl.quantity, 0) AS current_stock
             FROM products p
             LEFT JOIN stock_locations sl ON p.id = sl.product_id AND sl.location_id = ?
             WHERE p.is_active = 1 AND p.deleted_at IS NULL ${keywordSql} ${inStockSql}
             ORDER BY (COALESCE(sl.quantity, 0) > 0) DESC, p.name ASC
             LIMIT ? OFFSET ?`;
    queryParams.push(locationId, ...keywordParams, limit, offset);
  } else {
    query = `SELECT p.id, p.sku, p.name, p.price, p.weight
             FROM products p
             WHERE p.is_active = 1 AND p.deleted_at IS NULL ${keywordSql} ${inStockSql}
             ORDER BY p.name ASC
             LIMIT ? OFFSET ?`;
    queryParams.push(...keywordParams, limit, offset);
  }

  const [results] = await connection.query(query, queryParams);

  return {
    data: results,
    nextCursor: results.length === limit ? page + 1 : null,
  };
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export const getProductStockDetails = async (connection, id) => {
  const query = `
    SELECT l.id as location_id, l.code as location_code, l.building, l.floor, l.purpose, COALESCE(sl.quantity, 0) as quantity
    FROM locations l
    LEFT JOIN stock_locations sl ON l.id = sl.location_id AND sl.product_id = ?
    ORDER BY l.code;`;
  const [rows] = await connection.query(query, [id]);
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {any} filters
 * @returns {Promise<any>}
 */
export const getProductTotalStock = async (connection, id, filters = {}) => {
  const { buildings } = filters;
  let query = `SELECT SUM(sl.quantity) as total_stock FROM stock_locations sl`;
  const params = [];

  if (buildings && buildings.length > 0) {
    query += ` JOIN locations l ON sl.location_id = l.id`;
  }

  query += ` WHERE sl.product_id = ?`;
  params.push(id);

  if (buildings && buildings.length > 0) {
    query += ` AND l.building IN (?)`;
    params.push(buildings);
  }

  const [rows] = await connection.query(query, params);
  return rows[0]?.total_stock ? parseInt(rows[0].total_stock, 10) : 0;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {any} filters
 * @returns {Promise<any>}
 */
export const getProductStockMovementsAll = async (connection, id, filters = {}) => {
  const { buildings } = filters;
  let query = `
    SELECT
      sm.id,
      sm.quantity,
      sm.from_location_id,
      sm.to_location_id,
      sm.movement_type,
      sm.notes,
      sm.created_at,
      u.username as user_name,
      l_from.building as from_building,
      l_to.building as to_building
    FROM stock_movements sm
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN locations l_from ON sm.from_location_id = l_from.id
    LEFT JOIN locations l_to ON sm.to_location_id = l_to.id
    WHERE sm.product_id = ?
  `;
  const params = [id];

  if (buildings && buildings.length > 0) {
    query += ` AND (l_from.building IN (?) OR l_to.building IN (?))`;
    params.push(buildings, buildings);
  }

  query += ` ORDER BY sm.created_at DESC`;
  const [rows] = await connection.query(query, params);
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {number} limit
 * @param {number} offset
 * @param {any} filters
 * @returns {Promise<any>}
 */
export const getProductStockMovementsPaginated = async (
  connection,
  id,
  limit,
  offset,
  filters = {},
) => {
  const { buildings } = filters;
  let query = `
    SELECT
      sm.id,
      sm.quantity,
      sm.from_location_id,
      sm.to_location_id,
      sm.movement_type,
      sm.notes,
      sm.created_at,
      u.username as user_name,
      l_from.building as from_building,
      l_to.building as to_building
    FROM stock_movements sm
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN locations l_from ON sm.from_location_id = l_from.id
    LEFT JOIN locations l_to ON sm.to_location_id = l_to.id
    WHERE sm.product_id = ?
  `;
  const params = [id];

  if (buildings && buildings.length > 0) {
    query += ` AND (l_from.building IN (?) OR l_to.building IN (?))`;
    params.push(buildings, buildings);
  }

  query += ` ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  const [rows] = await connection.query(query, params);
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {any} filters
 * @returns {Promise<number>}
 */
export const getProductStockMovementsCount = async (connection, id, filters = {}) => {
  const { buildings } = filters;
  let query = `
    SELECT COUNT(*) as count
    FROM stock_movements sm
    LEFT JOIN locations l_from ON sm.from_location_id = l_from.id
    LEFT JOIN locations l_to ON sm.to_location_id = l_to.id
    WHERE sm.product_id = ?
  `;
  const params = [id];

  if (buildings && buildings.length > 0) {
    query += ` AND (l_from.building IN (?) OR l_to.building IN (?))`;
    params.push(buildings, buildings);
  }

  const [rows] = await connection.query(query, params);
  return parseInt(rows[0].count, 10);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {number} offset
 * @param {any} filters
 * @returns {Promise<number>}
 */
export const getSumOfNewerStockMovements = async (connection, id, offset, filters = {}) => {
  if (offset === 0) return 0;

  const { buildings } = filters;
  const hasBuildingFilter = buildings && buildings.length > 0;

  let netChangeSql = `
    CASE
      WHEN sm.from_location_id IS NULL AND sm.to_location_id IS NOT NULL THEN sm.quantity
      WHEN sm.from_location_id IS NOT NULL AND sm.to_location_id IS NULL THEN -sm.quantity
      ELSE 0
    END
  `;

  if (hasBuildingFilter) {
    // If to is in filter and from is not -> positive
    // If from is in filter and to is not -> negative
    netChangeSql = `
      CASE
        WHEN l_to.building IN (?) AND (l_from.building NOT IN (?) OR l_from.building IS NULL) THEN sm.quantity
        WHEN l_from.building IN (?) AND (l_to.building NOT IN (?) OR l_to.building IS NULL) THEN -sm.quantity
        ELSE 0
      END
    `;
  }

  let subQuery = `
    SELECT sm.quantity, sm.from_location_id, sm.to_location_id, l_from.building as from_building, l_to.building as to_building
    FROM stock_movements sm
    LEFT JOIN locations l_from ON sm.from_location_id = l_from.id
    LEFT JOIN locations l_to ON sm.to_location_id = l_to.id
    WHERE sm.product_id = ?
  `;
  const params = [id];

  if (hasBuildingFilter) {
    subQuery += ` AND (l_from.building IN (?) OR l_to.building IN (?))`;
    params.push(buildings, buildings);
  }

  subQuery += ` ORDER BY sm.created_at DESC LIMIT ?`;
  params.push(offset);

  const finalQuery = `SELECT SUM(${netChangeSql}) as total_net_change FROM (${subQuery}) as recent_movements`;

  // Prepare final params
  const finalParams = [];
  if (hasBuildingFilter) {
    // Parameters for netChangeSql inside SUM()
    finalParams.push(buildings, buildings, buildings, buildings);
  }
  // Parameters for subQuery
  finalParams.push(...params);

  const [rows] = await connection.query(finalQuery, finalParams);
  return rows[0]?.total_net_change ? parseInt(rows[0].total_net_change, 10) : 0;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} packageProductIds
 * @returns {Promise<any>}
 */
export const getBulkPackageComponents = async (connection, packageProductIds) => {
  if (packageProductIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT
      pc.package_product_id,
      pc.component_product_id,
      pc.quantity_per_package,
      p.sku as component_sku,
      p.name as component_name
      FROM package_components pc
      JOIN products p ON pc.component_product_id = p.id
      WHERE pc.package_product_id IN (?)`,
    [packageProductIds],
  );
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {any} skuArray
 * @returns {Promise<any>}
 */
export const getProductMapWithComponents = async (connection, skuArray) => {
  const productMap = new Map();
  if (!skuArray || skuArray.length === 0) return productMap;
  const products = await getProductsBySkus(connection, skuArray);
  const packageIds = [];
  products.forEach((p) => {
    productMap.set(p.sku.toUpperCase(), {
      id: p.id,
      name: p.name,
      sku: p.sku,
      is_package: p.is_package === 1,
      components: [],
    });
    if (p.is_package === 1) packageIds.push(p.id);
  });
  if (packageIds.length > 0) {
    const components = await getBulkPackageComponents(connection, packageIds);
    components.forEach((c) => {
      for (const [, data] of productMap.entries()) {
        if (data.id === c.package_product_id) {
          data.components.push({
            id: c.component_product_id,
            sku: c.component_sku,
            name: c.component_name,
            qty_ratio: c.quantity_per_package,
            quantity_per_package: c.quantity_per_package,
          });
          break;
        }
      }
    });
  }
  return productMap;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} productId
 * @returns {Promise<any>}
 */
export const getProductHistory = async (connection, productId) => {
  const [rows] = await connection.query(
    `SELECT
      pal.id,
      pal.action,
      pal.field,
      pal.old_value,
      pal.new_value,
      pal.created_at,
      u.username as user_name,
      u.nickname
    FROM product_audit_logs pal
    LEFT JOIN users u ON pal.user_id = u.id
    WHERE pal.product_id = ?
    ORDER BY pal.created_at DESC`,
    [productId],
  );
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
export const getAllPackagesWithComponents = async (connection) => {
  const query = `
    SELECT
      p.id,
      p.sku as package_sku,
      p.name as package_name,
      p.price as package_price,
      cat.name as category_name,
      c.sku as component_sku,
      pc.quantity_per_package as component_qty
    FROM products p
    LEFT JOIN categories cat ON p.category_id = cat.id
    LEFT JOIN package_components pc ON p.id = pc.package_product_id
    LEFT JOIN products c ON pc.component_product_id = c.id
    WHERE p.is_package = 1 AND p.is_active = 1 AND p.deleted_at IS NULL
    ORDER BY p.sku ASC, c.sku ASC
  `;
  const [rows] = await connection.query(query);
  return rows;
};

// ============================================================================
// WRITE OPERATIONS (ATOMIC SQL ONLY)
// ============================================================================

/**
 * Menyimpan data produk baru ke dalam tabel products.
 * @param {import('mysql2/promise').Connection} connection - Koneksi database
 * @param {Object} productData - Data produk
 * @param {string} productData.sku - SKU Produk
 * @param {string} productData.name - Nama Produk
 * @param {number} [productData.category_id] - ID Kategori
 * @param {number} [productData.price] - Harga Produk
 * @param {number} [productData.weight] - Berat Produk
 * @param {boolean} [productData.is_package] - Apakah ini produk paket
 * @returns {Promise<number>} ID Produk yang baru dibuat
 */
export const createProduct = async (
  connection,
  { sku, name, category_id, price, weight, is_package },
) => {
  const [result] = await connection.query(
    "INSERT INTO products (sku, name, category_id, price, weight, is_package, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
    [
      sku,
      name,
      category_id || null,
      parseFloat(price || 0),
      parseFloat(weight || 0),
      is_package ? 1 : 0,
    ],
  );
  return result.insertId;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const updateProduct = async (
  connection,
  id,
  { name, category_id, price, weight, is_package },
) => {
  let sql = "UPDATE products SET name = ?, category_id = ?, price = ?, weight = ?, is_package = ?";
  const params = [
    name,
    category_id || null,
    parseFloat(price || 0),
    parseFloat(weight || 0),
    is_package ? 1 : 0,
  ];

  sql += " WHERE id = ?";
  params.push(id);

  await connection.query(sql, params);
};

// Menangani Soft Delete & Restore
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {boolean} isActive
 * @returns {Promise<any>}
 */
export const updateProductStatus = async (connection, id, isActive) => {
  const deletedAt = isActive ? null : new Date(); // null for restore, Date for delete
  await connection.query("UPDATE products SET is_active = ?, deleted_at = ? WHERE id = ?", [
    isActive ? 1 : 0,
    deletedAt,
    id,
  ]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} packageId
 * @param {any} components
 * @returns {Promise<any>}
 */
export const insertComponents = async (connection, packageId, components) => {
  if (!components || components.length === 0) return;

  const values = components.map((c) => [packageId, c.id, c.quantity]);
  await connection.query(
    "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES ?",
    [values],
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} packageId
 * @returns {Promise<any>}
 */
export const deleteComponents = async (connection, packageId) => {
  await connection.query("DELETE FROM package_components WHERE package_product_id = ?", [
    packageId,
  ]);
};

export const insertAuditLog = async (
  connection,
  { productId, userId, action, field, oldVal, newVal },
) => {
  const changes = {
    [field]: { old: String(oldVal || ""), new: String(newVal || "") },
  };

  await connection.query(
    `INSERT INTO system_audit_logs (user_id, action, target_type, target_id, changes, created_at)
      VALUES (?, ?, 'PRODUCT', ?, ?, NOW())`,
    [userId, action, productId, JSON.stringify(changes)],
  );
};

export const updateProductTransaction = async (connection, id, updates, _, userId) => {
  const [oldRows] = await connection.query("SELECT * FROM products WHERE id = ?", [id]);
  const oldData = oldRows[0];

  if (!oldData) return;

  const fields = [];
  const values = [];
  const auditPromises = [];

  // Helper untuk Check Perubahan & Collect Data Update
  const processField = (fieldName, newValue, type = "string") => {
    let isChanged = false;
    const oldValue = oldData[fieldName];

    if (type === "number") {
      // Bandingkan Number secara presisi (handle string/decimal dari DB)
      const numNew = parseFloat(newValue || 0);
      const numOld = parseFloat(oldValue || 0);
      // Gunakan epsilon untuk float comparison jika perlu, atau simple inequality
      if (numNew !== numOld) isChanged = true;
    } else if (type === "boolean") {
      const boolNew = !!newValue;
      const boolOld = !!oldValue;
      if (boolNew !== boolOld) isChanged = true;
    } else {
      // String Comparison
      if (String(newValue).trim() !== String(oldValue).trim()) isChanged = true;
    }

    if (isChanged) {
      if (type === "boolean") {
        fields.push(`${fieldName} = ?`);
        values.push(newValue ? 1 : 0);
      } else {
        fields.push(`${fieldName} = ?`);
        values.push(newValue);
      }
      auditPromises.push(
        insertAuditLog(connection, {
          productId: id,
          userId,
          action: "UPDATE",
          field: fieldName,
          oldVal: oldValue,
          newVal: newValue,
        }),
      );
    }
  };

  // Cek setiap field
  if (updates.name !== undefined) processField("name", updates.name, "string");
  if (updates.category_id !== undefined) processField("category_id", updates.category_id, "number");
  if (updates.price !== undefined) processField("price", updates.price, "number");
  if (updates.weight !== undefined) processField("weight", updates.weight, "number");
  if (updates.price !== undefined) processField("price", updates.price, "number");
  if (updates.weight !== undefined) processField("weight", updates.weight, "number");
  if (updates.is_package !== undefined) processField("is_package", updates.is_package, "boolean");

  // Jika ada perubahan, jalankan UPDATE
  if (fields.length > 0) {
    values.push(id);
    await connection.query(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  // Jalankan Audit Logs
  if (auditPromises.length > 0) {
    await Promise.all(auditPromises);
  }
};

// ============================================================================
// IMAGE MANAGEMENT
// ============================================================================
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} imageId
 * @returns {Promise<any>}
 */
export const deleteImage = async (connection, imageId) => {
  await connection.query("DELETE FROM product_images WHERE id = ?", [imageId]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} productId
 * @param {number|string} mediaIds
 * @returns {Promise<any>}
 */
export const linkMedia = async (connection, productId, mediaIds) => {
  if (!mediaIds || mediaIds.length === 0) return;

  // Cek apakah sudah punya primary image
  const [existingPrimary] = await connection.query(
    "SELECT id FROM product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1",
    [productId],
  );
  let hasPrimary = existingPrimary.length > 0;

  const values = mediaIds.map((mediaId) => {
    let isPrimary = 0;
    if (!hasPrimary) {
      isPrimary = 1;
      hasPrimary = true;
    }
    return [productId, mediaId, isPrimary];
  });

  await connection.query("INSERT INTO product_images (product_id, media_id, is_primary) VALUES ?", [
    values,
  ]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} productId
 * @returns {Promise<any>}
 */
export const resetPrimaryImage = async (connection, productId) => {
  await connection.query("UPDATE product_images SET is_primary = 0 WHERE product_id = ?", [
    productId,
  ]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} imageId
 * @returns {Promise<any>}
 */
export const setPrimaryImage = async (connection, imageId) => {
  await connection.query("UPDATE product_images SET is_primary = 1 WHERE id = ?", [imageId]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} imageId
 * @returns {Promise<any>}
 */
export const getImageById = async (connection, imageId) => {
  const [rows] = await connection.query(
    "SELECT pi.*, ma.main_path as image_path FROM product_images pi JOIN media_assets ma ON pi.media_id = ma.id WHERE pi.id = ?",
    [imageId],
  );
  return rows.length > 0 ? rows[0] : null;
};
