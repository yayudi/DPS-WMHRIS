// backend/repositories/productRepository.js
// ============================================================================
// READ OPERATIONS
// ============================================================================

export const getProductsWithFilters = async (connection, filters) => {
  const {
    limit,
    offset,
    search,
    searchBy,
    location,
    minusStockOnly,
    packageOnly,
    is_package,
    status,
    building,
    floor,
    sortBy,
    sortOrder,
  } = filters;

  const allowedSortColumns = ["name", "sku", "price", "updated_at", "deleted_at", "weight"];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? `p.${sortBy}` : "p.name";

  // ✅ LOGIKA STATUS: Menggunakan is_active DAN deleted_at
  let whereClauses = [];
  let queryParams = [];

  // --- Status Filter ---
  if (status === "archived") {
    // Produk arsip = yang is_active 0 ATAU deleted_at terisi
    whereClauses.push("(p.is_active = 0 OR p.deleted_at IS NOT NULL)");
  } else if (status === "all") {
    whereClauses.push("1=1");
  } else {
    // Default: Active only
    whereClauses.push("(p.is_active = 1 AND p.deleted_at IS NULL)");
  }

  let locationParams = [];
  let searchParams = [];
  let minusStockParams = [];

  if (is_package !== undefined) {
    whereClauses.push(`p.is_package = ${is_package ? 1 : 0}`);
  } else if (packageOnly) {
    whereClauses.push("p.is_package = 1");
  }

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

  const countParams = [...locationParams, ...searchParams];
  const countWhereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM products p ${countWhereSql}`;

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

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const [totalRows] = await connection.query(countQuery, countParams);
  const totalProducts = totalRows[0].total;

  // ✅ SELECT termasuk weight dan deleted_at
  const productsQuery = `
      SELECT p.id, p.sku, p.name, p.price, p.weight, p.is_package, p.is_active, p.deleted_at
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

  const [products] = await connection.query(productsQuery, finalProductParams);

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
    };
  });

  return { data: productsWithStock, total: totalProducts };
};

export const getProductsBySkus = async (connection, skuList) => {
  if (!skuList || skuList.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, sku, is_package, name, price FROM products WHERE sku IN (?)`,
    [skuList]
  );
  return rows;
};

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
    [packageProductIds]
  );
  return rows;
};

export const getProductMapWithComponents = async (connection, skuArray) => {
  const productMap = new Map();
  if (!skuArray || skuArray.length === 0) return productMap;
  const products = await getProductsBySkus(connection, skuArray);
  const packageIds = [];
  products.forEach((p) => {
    productMap.set(p.sku, {
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
      for (const [sku, data] of productMap.entries()) {
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

export const getProductDetailWithStock = async (connection, id) => {
  const [rows] = await connection.query("SELECT * FROM products WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const product = rows[0];
  product.components = [];
  product.stock_locations = [];
  let productIdsToCheck = [product.id];
  if (product.is_package) {
    const [components] = await connection.query(
      `SELECT pc.component_product_id as id, p.sku, p.name, pc.quantity_per_package, pc.quantity_per_package as quantity
      FROM package_components pc JOIN products p ON pc.component_product_id = p.id WHERE pc.package_product_id = ?`,
      [id]
    );
    product.components = components;
    components.forEach((comp) => productIdsToCheck.push(comp.id));
  }
  if (productIdsToCheck.length > 0) {
    const stockLocationsQuery = `SELECT sl.product_id, l.code as location_code, l.purpose, sl.quantity FROM stock_locations sl JOIN locations l ON sl.location_id = l.id WHERE sl.quantity > 0 AND sl.product_id IN (?)`;
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

export const searchProducts = async (connection, searchTerm, locationId) => {
  let query, queryParams;
  if (locationId && locationId !== "null" && locationId !== "undefined" && locationId !== "") {
    query = `SELECT p.id, p.sku, p.name, sl.quantity AS current_stock FROM products p JOIN stock_locations sl ON p.id = sl.product_id WHERE sl.location_id = ? AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?) AND sl.quantity != 0 LIMIT 10`;
    queryParams = [locationId, searchTerm, searchTerm];
  } else {
    query = `SELECT id, sku, name FROM products WHERE (LOWER(name) LIKE ? OR LOWER(sku) LIKE ?) AND is_active = 1 LIMIT 10`;
    queryParams = [searchTerm, searchTerm];
  }
  const [results] = await connection.query(query, queryParams);
  return results;
};

export const getAllActiveProducts = async (connection) => {
  const [rows] = await connection.query(
    "SELECT id, sku, name, price, is_package, is_active FROM products WHERE is_active = 1 ORDER BY name ASC"
  );
  return rows;
};

export const getProductStockDetails = async (connection, id) => {
  const query = `SELECT l.id as location_id, l.code as location_code, l.building, l.floor, l.purpose, COALESCE(sl.quantity, 0) as quantity FROM locations l LEFT JOIN stock_locations sl ON l.id = sl.location_id AND sl.product_id = ? ORDER BY l.code;`;
  const [rows] = await connection.query(query, [id]);
  return rows;
};

export const getIdBySku = async (connection, sku) => {
  const [rows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
  return rows.length > 0 ? rows[0].id : null;
};

// ============================================================================
// HISTORY / AUDIT OPERATIONS
// ============================================================================

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
    [productId]
  );
  return rows;
};

// Helper internal untuk mencatat log
const logChange = async (connection, productId, userId, action, field, oldVal, newVal) => {
  await connection.query(
    `INSERT INTO product_audit_logs (product_id, user_id, action, field, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [productId, userId, action, field, String(oldVal || ""), String(newVal || "")]
  );
};

// ============================================================================
// WRITE OPERATIONS (TRANSACTIONS)
// ============================================================================

export const createProductTransaction = async (connection, productData, components, userId) => {
  const [resProd] = await connection.query(
    "INSERT INTO products (sku, name, price, weight, is_package, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    [
      productData.sku,
      productData.name,
      parseFloat(productData.price || 0),
      parseFloat(productData.weight || 0),
      productData.is_package ? 1 : 0,
    ]
  );
  const newId = resProd.insertId;

  // Log Creation
  await logChange(connection, newId, userId, "CREATE", "all", null, productData.sku);

  if (productData.is_package && components.length > 0) {
    const values = components.map((c) => [newId, c.id, c.quantity]);
    await connection.query(
      "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES ?",
      [values]
    );
  }
  return newId;
};

export const updateProductTransaction = async (connection, id, newData, components, userId) => {
  // 1. Ambil Data Lama untuk perbandingan Audit Log
  const [oldRows] = await connection.query("SELECT * FROM products WHERE id = ?", [id]);
  const oldData = oldRows[0];

  // 2. Bandingkan Field Penting & Log Perubahan
  const fieldsToCheck = [
    { key: "name", label: "Nama Produk" },
    { key: "price", label: "Harga", type: "number" },
    { key: "weight", label: "Berat", type: "number" },
    { key: "is_package", label: "Tipe Paket", type: "bool" },
  ];

  for (const field of fieldsToCheck) {
    let oldVal = oldData[field.key];
    let newVal = newData[field.key];

    // Normalisasi tipe data agar perbandingan valid
    if (field.type === "number") {
      oldVal = parseFloat(oldVal);
      newVal = parseFloat(newVal);
    } else if (field.type === "bool") {
      oldVal = !!oldVal;
      newVal = !!newVal;
    }

    if (oldVal !== newVal) {
      await logChange(connection, id, userId, "UPDATE", field.key, oldVal, newVal);
    }
  }

  // 3. Update Produk Utama
  await connection.query(
    "UPDATE products SET name = ?, price = ?, weight = ?, is_package = ? WHERE id = ?",
    [
      newData.name,
      parseFloat(newData.price || 0),
      parseFloat(newData.weight || 0),
      newData.is_package ? 1 : 0,
      id,
    ]
  );

  // 4. Update Komponen
  if (newData.is_package) {
    await connection.query("DELETE FROM package_components WHERE package_product_id = ?", [id]);

    if (components && components.length > 0) {
      const values = components.map((c) => [id, c.id, c.quantity]);
      await connection.query(
        "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES ?",
        [values]
      );
      // Log perubahan komponen (generic)
      await logChange(
        connection,
        id,
        userId,
        "UPDATE",
        "components",
        "Old Components",
        `${components.length} Items`
      );
    }
  } else {
    // Jika berubah dari paket ke satuan, hapus komponen
    await connection.query("DELETE FROM package_components WHERE package_product_id = ?", [id]);
  }

  return true;
};

export const restoreProduct = async (connection, id, userId) => {
  await connection.query("UPDATE products SET is_active = 1, deleted_at = NULL WHERE id = ?", [id]);
  await logChange(connection, id, userId, "RESTORE", "status", "Archived", "Active");
};

export const softDeleteProduct = async (connection, id, userId) => {
  await connection.query("UPDATE products SET is_active = 0, deleted_at = NOW() WHERE id = ?", [
    id,
  ]);
  await logChange(connection, id, userId, "DELETE", "status", "Active", "Archived");
};
