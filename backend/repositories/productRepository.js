// backend/repositories/productRepository.js
// ============================================================================
// READ OPERATIONS (Complex Queries & Aggregations)
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

  // Filter Lokasi (Subquery EXISTS)
  let purpose = "";
  if (location === "gudang") purpose = "WAREHOUSE";
  else if (location === "pajangan") purpose = "DISPLAY";
  else if (location === "ltc") purpose = "BRANCH";

  if (location !== "all") {
    let existsConditions = ["l.purpose = ?"];
    queryParams.push(purpose);

    if (location === "gudang") {
      if (building !== "all") {
        existsConditions.push("l.building = ?");
        queryParams.push(building);
      }
      if (floor !== "all") {
        existsConditions.push("l.floor = ?");
        queryParams.push(floor);
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
      keywords.forEach((keyword) => queryParams.push(`%${keyword}%`));
    }
  }

  // Filter Minus Stock (Logic Subquery Kompleks)
  if (minusStockOnly) {
    // Note: Logic minus stock direplikasi sesuai versi asli
    const minusStockConditions = [];
    if (location !== "all") {
      minusStockConditions.push("l.purpose = ?");
      // Parameter purpose sudah ada di queryParams jika location != all,
      // tapi query minus stock butuh parameter terpisah karena ada di subquery select.
      // Untuk simplifikasi repository pattern ini, kita masukkan params lagi.
      queryParams.push(purpose);
    }

    // Jika ada filter lokasi gudang detail
    if (location === "gudang") {
      if (building !== "all") {
        minusStockConditions.push("l.building = ?");
        queryParams.push(building);
      }
      if (floor !== "all") {
        minusStockConditions.push("l.floor = ?");
        queryParams.push(floor);
      }
    }

    const minusWhere =
      minusStockConditions.length > 0 ? `AND ${minusStockConditions.join(" AND ")}` : "";

    // Subquery untuk cek total stok < 0
    const minusStockSql = `(
        COALESCE((
          SELECT SUM(sl.quantity)
          FROM stock_locations sl
          JOIN locations l ON sl.location_id = l.id
          WHERE sl.product_id = p.id ${minusWhere}
        ), 0) < 0
      )`;
    whereClauses.push(minusStockSql);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // --- 2. Hitung Total Data (Count) ---
  const countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM products p ${whereSql}`;
  const [totalRows] = await connection.query(countQuery, queryParams);
  const totalProducts = totalRows[0]?.total || 0;

  // --- 3. Ambil Data Produk (Main Select) ---
  const productsQuery = `
      SELECT p.id, p.sku, p.name, p.price, p.weight, p.is_package, p.is_active, p.deleted_at
      FROM products p
      ${whereSql}
      GROUP BY p.id
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

  // Clone queryParams karena params sebelumnya "consumed" oleh countQuery jika connection bukan prepared statement reuse
  // Tapi di mysql2/promise `query`, kita kirim params array baru.
  // PENTING: Urutan params harus sesuai dengan urutan `?` di productsQuery.
  // Logic `minusStockOnly` di atas menambahkan params ke `queryParams` yg juga dipakai count.
  // Kita harus hati-hati. Cara paling aman adalah menyusun params ulang.

  // Re-collect params for main query safety
  let finalParams = [];
  // ... (Re-logic parameters di atas agak berisiko error jika dicopy manual).
  // Untuk file ini, kita pakai `queryParams` yang sudah terkumpul karena urutannya linear dari atas ke bawah.

  finalParams = [...queryParams, limit, offset];

  const [products] = await connection.query(productsQuery, finalParams);

  if (products.length === 0) {
    return { data: [], total: totalProducts };
  }

  // --- 4. Attach Informasi Stok ---
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

export const getProductDetailWithStock = async (connection, id) => {
  // 1. Ambil Product Core
  const [rows] = await connection.query("SELECT * FROM products WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const product = rows[0];

  product.components = [];
  product.stock_locations = [];

  let productIdsToCheck = [product.id];

  // 2. Jika Paket, Ambil Komponen
  if (product.is_package) {
    const [components] = await connection.query(
      `SELECT pc.component_product_id as id, p.sku, p.name, pc.quantity_per_package, pc.quantity_per_package as quantity
       FROM package_components pc
       JOIN products p ON pc.component_product_id = p.id
       WHERE pc.package_product_id = ?`,
      [id]
    );
    product.components = components;
    components.forEach((comp) => productIdsToCheck.push(comp.id));
  }

  // 3. Ambil Stok untuk Product Utama & Komponen
  if (productIdsToCheck.length > 0) {
    const stockLocationsQuery = `
        SELECT sl.product_id, l.code as location_code, l.purpose, sl.quantity
        FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.quantity > 0 AND sl.product_id IN (?)`;

    const [stockRows] = await connection.query(stockLocationsQuery, [productIdsToCheck]);

    // Assign stok ke produk utama
    product.stock_locations = stockRows.filter((stock) => stock.product_id === product.id);

    // Assign stok ke komponen (nested)
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

export const getProductById = async (connection, id) => {
  const [rows] = await connection.query("SELECT * FROM products WHERE id = ?", [id]);
  return rows.length > 0 ? rows[0] : null;
};

export const getIdBySku = async (connection, sku) => {
  const [rows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
  return rows.length > 0 ? rows[0].id : null;
};

export const getProductsBySkus = async (connection, skuList) => {
  if (!skuList || skuList.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, sku, is_package, name, price, weight FROM products WHERE sku IN (?)`,
    [skuList]
  );
  return rows;
};

export const getAllActiveProducts = async (connection) => {
  const [rows] = await connection.query(
    "SELECT id, sku, name, price, is_package, is_active FROM products WHERE is_active = 1 ORDER BY name ASC"
  );
  return rows;
};

export const searchProducts = async (connection, searchTerm, locationId) => {
  let query, queryParams;
  if (locationId && locationId !== "null" && locationId !== "undefined" && locationId !== "") {
    query = `SELECT p.id, p.sku, p.name, sl.quantity AS current_stock
             FROM products p JOIN stock_locations sl ON p.id = sl.product_id
             WHERE sl.location_id = ? AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)
             AND sl.quantity != 0 LIMIT 10`;
    queryParams = [locationId, searchTerm, searchTerm];
  } else {
    query = `SELECT id, sku, name FROM products
             WHERE (LOWER(name) LIKE ? OR LOWER(sku) LIKE ?) AND is_active = 1 LIMIT 10`;
    queryParams = [searchTerm, searchTerm];
  }
  const [results] = await connection.query(query, queryParams);
  return results;
};

export const getProductStockDetails = async (connection, id) => {
  const query = `
    SELECT l.id as location_id, l.code as location_code, l.building, l.floor, l.purpose, COALESCE(sl.quantity, 0) as quantity
    FROM locations l
    LEFT JOIN stock_locations sl ON l.id = sl.location_id AND sl.product_id = ?
    ORDER BY l.code;`;
  const [rows] = await connection.query(query, [id]);
  return rows;
};

// Digunakan oleh Import Worker untuk mapping bulk
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

// Digunakan oleh Import Worker untuk membangun Map produk lengkap
export const getProductMapWithComponents = async (connection, skuArray) => {
  const productMap = new Map();
  if (!skuArray || skuArray.length === 0) return productMap;

  // 1. Ambil Produk
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

  // 2. Ambil Komponen untuk Paket
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

export const getAllPackagesWithComponents = async (connection) => {
  const query = `
    SELECT
      p.id,
      p.sku as package_sku,
      p.name as package_name,
      p.price as package_price,
      c.sku as component_sku,
      pc.quantity_per_package as component_qty
    FROM products p
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

export const createProduct = async (connection, { sku, name, price, weight, is_package }) => {
  const [result] = await connection.query(
    "INSERT INTO products (sku, name, price, weight, is_package, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    [sku, name, parseFloat(price || 0), parseFloat(weight || 0), is_package ? 1 : 0]
  );
  return result.insertId;
};

export const updateProduct = async (connection, id, { name, price, weight, is_package }) => {
  await connection.query(
    "UPDATE products SET name = ?, price = ?, weight = ?, is_package = ? WHERE id = ?",
    [name, parseFloat(price || 0), parseFloat(weight || 0), is_package ? 1 : 0, id]
  );
};

// Menangani Soft Delete & Restore
export const updateProductStatus = async (connection, id, isActive) => {
  const deletedAt = isActive ? null : new Date(); // null for restore, Date for delete
  await connection.query("UPDATE products SET is_active = ?, deleted_at = ? WHERE id = ?", [
    isActive ? 1 : 0,
    deletedAt,
    id,
  ]);
};

export const insertComponents = async (connection, packageId, components) => {
  if (!components || components.length === 0) return;

  const values = components.map((c) => [packageId, c.id, c.quantity]);
  await connection.query(
    "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES ?",
    [values]
  );
};

export const deleteComponents = async (connection, packageId) => {
  await connection.query("DELETE FROM package_components WHERE package_product_id = ?", [
    packageId,
  ]);
};

export const insertAuditLog = async (
  connection,
  { productId, userId, action, field, oldVal, newVal }
) => {
  await connection.query(
    `INSERT INTO product_audit_logs (product_id, user_id, action, field, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [productId, userId, action, field, String(oldVal || ""), String(newVal || "")]
  );
};

// [NEW] Fungsi Transactional Update dengan Audit Log
export const updateProductTransaction = async (
  connection,
  id,
  updates,
  components = [],
  userId
) => {
  // 1. Ambil Data Lama untuk Audit Log
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
      // 1. Add to SQL Update
      if (type === 'boolean') {
          fields.push(`${fieldName} = ?`);
          values.push(newValue ? 1 : 0);
      } else {
          fields.push(`${fieldName} = ?`);
          values.push(newValue);
      }

      // 2. Add to Audit Log
      auditPromises.push(
        insertAuditLog(connection, {
          productId: id,
          userId,
          action: "UPDATE",
          field: fieldName,
          oldVal: oldValue,
          newVal: newValue,
        })
      );
    }
  };

  // Cek setiap field
  if (updates.name !== undefined) processField("name", updates.name, "string");
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
