// backend/repositories/statisticRepository.js
import { buildTriStateWhere } from "../utils/sqlUtils.js";

export { buildTriStateWhere };

/**
 * @param {Object} connection
 * @param {string} startDate
 * @param {string} endDate
 */
export const getStockMovementStats = async (connection, filters) => {
  const { startDate, endDate, searchQuery, buildings, categoryId } = filters;

  const queryParams = [];

  // Stock Locations Subquery (Filtered by Building)
  let locSubquery = `
    SELECT product_id, SUM(quantity) as current_stock
    FROM stock_locations
  `;

  const bClauses = buildTriStateWhere("l.building", buildings, queryParams);
  if (bClauses.length > 0) {
    locSubquery = `
      SELECT sl.product_id, SUM(sl.quantity) as current_stock
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE ${bClauses.join(" AND ")}
      GROUP BY sl.product_id
    `;
  } else {
    locSubquery += ` GROUP BY product_id`;
  }

  // Stock Movements Subquery (Filtered by Building)
  let movFilter = "";
  const movParams = [startDate, endDate];

  if (buildings) {
    if (Array.isArray(buildings) && buildings.length > 0) {
      movFilter = `
        AND (
          (sm.movement_type = 'INBOUND' AND tl.building IN (?))
          OR
          (sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (?))
        )
      `;
      movParams.push(buildings, buildings);
    } else if (typeof buildings === "object" && !Array.isArray(buildings)) {
      const inc = buildings.include
        ? Array.isArray(buildings.include)
          ? buildings.include
          : Object.values(buildings.include)
        : [];
      if (inc.length > 0) {
        movFilter += `
          AND (
            (sm.movement_type = 'INBOUND' AND tl.building IN (?))
            OR
            (sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (?))
          )
        `;
        movParams.push(inc, inc);
      }
      const exc = buildings.exclude
        ? Array.isArray(buildings.exclude)
          ? buildings.exclude
          : Object.values(buildings.exclude)
        : [];
      if (exc.length > 0) {
        movFilter += `
          AND (
            (sm.movement_type = 'INBOUND' AND (tl.building IS NULL OR tl.building NOT IN (?)))
            OR
            (sm.movement_type IN ('SALE', 'OUT') AND (fl.building IS NULL OR fl.building NOT IN (?)))
          )
        `;
        movParams.push(exc, exc);
      }
    }
  }

  // Main Query
  let query = `
    SELECT
      p.id as product_id,
      p.sku,
      p.name,
      p.is_active,
      IFNULL(s_loc.current_stock, 0) AS current_stock,
      IFNULL(s_mov.total_sold, 0) AS total_sold,
      IFNULL(s_mov.total_inbound, 0) AS total_inbound
    FROM products p
    LEFT JOIN (
      ${locSubquery}
    ) s_loc ON p.id = s_loc.product_id
    LEFT JOIN (
      SELECT
        sm.product_id,
        SUM(CASE WHEN sm.movement_type IN ('SALE', 'OUT') THEN sm.quantity ELSE 0 END) AS total_sold,
        SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.quantity ELSE 0 END) AS total_inbound
      FROM stock_movements sm
      LEFT JOIN locations fl ON sm.from_location_id = fl.id
      LEFT JOIN locations tl ON sm.to_location_id = tl.id
      WHERE DATE(sm.created_at) >= ? AND DATE(sm.created_at) <= ?
      ${movFilter}
      GROUP BY sm.product_id
    ) s_mov ON p.id = s_mov.product_id
    WHERE p.is_package = 0
  `;

  queryParams.push(...movParams);

  // Search Filter
  if (searchQuery) {
    query += ` AND (p.sku LIKE ? OR p.name LIKE ?)`;
    const likeTerm = `%${searchQuery}%`;
    queryParams.push(likeTerm, likeTerm);
  }

  // Category Filter
  const cClauses = buildTriStateWhere("p.category_id", categoryId, queryParams);
  if (cClauses.length > 0) {
    query += ` AND ${cClauses.join(" AND ")}`;
  }

  query += ` ORDER BY total_sold DESC`;

  const [rows] = await connection.query(query, queryParams);
  return rows;
};

/**
 * @param {Object} connection
 * @param {Object} filters
 */
export const getInventoryValueStats = async (connection, filters) => {
  const { searchQuery, building, purpose, isPackage, stockStatus, categoryId } = filters;

  const whereClauses = ["p.is_active = 1"];
  const queryParams = [];

  // Logic Filter
  if (stockStatus) {
    const applyStockStatus = (statusArr, isExclude = false) => {
      const conds = [];
      if (statusArr.includes("positive")) conds.push("COALESCE(sl.quantity, 0) > 0");
      if (statusArr.includes("negative")) conds.push("COALESCE(sl.quantity, 0) < 0");
      if (statusArr.includes("zero")) conds.push("COALESCE(sl.quantity, 0) = 0");
      if (conds.length > 0) {
        return `(${conds.join(isExclude ? " AND NOT " : " OR ")})`;
      }
      return null;
    };

    if (typeof stockStatus === "string" && stockStatus !== "all") {
      const cond = applyStockStatus([stockStatus]);
      if (cond) whereClauses.push(cond);
    } else if (typeof stockStatus === "object") {
      const inc = stockStatus.include
        ? Array.isArray(stockStatus.include)
          ? stockStatus.include
          : Object.values(stockStatus.include)
        : [];
      if (inc.length > 0) {
        const cond = applyStockStatus(inc);
        if (cond) whereClauses.push(cond);
      }
      const exc = stockStatus.exclude
        ? Array.isArray(stockStatus.exclude)
          ? stockStatus.exclude
          : Object.values(stockStatus.exclude)
        : [];
      if (exc.length > 0) {
        // Exclude needs to invert the condition
        const conds = [];
        if (exc.includes("positive")) conds.push("COALESCE(sl.quantity, 0) <= 0");
        if (exc.includes("negative")) conds.push("COALESCE(sl.quantity, 0) >= 0");
        if (exc.includes("zero")) conds.push("COALESCE(sl.quantity, 0) != 0");
        if (conds.length > 0) {
          whereClauses.push(`(${conds.join(" AND ")})`);
        }
      }
    }
  }

  const bClauses = buildTriStateWhere("l.building", building, queryParams);
  if (bClauses.length > 0) {
    whereClauses.push(...bClauses);
  }

  if (searchQuery) {
    whereClauses.push("(p.sku LIKE ? OR p.name LIKE ?)");
    queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
  }

  const pClauses = buildTriStateWhere("l.purpose", purpose, queryParams);
  if (pClauses.length > 0) {
    whereClauses.push(...pClauses);
  }

  if (isPackage !== null && isPackage !== undefined && isPackage !== "") {
    whereClauses.push("p.is_package = ?");
    queryParams.push(isPackage);
  }

  const cClauses = buildTriStateWhere("p.category_id", categoryId, queryParams);
  if (cClauses.length > 0) {
    whereClauses.push(...cClauses);
  }

  const query = `
    SELECT
      p.id as product_id,
      p.sku,
      p.name,
      p.category_id,
      c.name as category,
      p.price,
      SUM(COALESCE(sl.quantity, 0)) AS total_quantity,
      (SUM(COALESCE(sl.quantity, 0)) * p.price) AS total_value
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN stock_locations sl ON p.id = sl.product_id
    LEFT JOIN locations l ON sl.location_id = l.id
    WHERE ${whereClauses.join(" AND ")}
    GROUP BY p.id, p.sku, p.name, p.category_id, c.name, p.price
    ORDER BY total_value DESC
  `;

  const [rows] = await connection.query(query, queryParams);
  return rows;
};

/**
 * @param {Object} connection
 * @param {Object} filters
 */
export const getMovementTimelineStats = async (connection, filters) => {
  const { startDate, endDate, searchQuery, buildings, timeResolution, categoryId } = filters;

  const queryParams = [startDate, endDate];

  let buildingFilter = "";
  if (buildings) {
    if (Array.isArray(buildings) && buildings.length > 0) {
      buildingFilter = `
        AND (
          (sm.movement_type = 'INBOUND' AND tl.building IN (?))
          OR
          (sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (?))
        )
      `;
      queryParams.push(buildings, buildings);
    } else if (typeof buildings === "object" && !Array.isArray(buildings)) {
      const inc = buildings.include
        ? Array.isArray(buildings.include)
          ? buildings.include
          : Object.values(buildings.include)
        : [];
      if (inc.length > 0) {
        buildingFilter += `
          AND (
            (sm.movement_type = 'INBOUND' AND tl.building IN (?))
            OR
            (sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (?))
          )
        `;
        queryParams.push(inc, inc);
      }
      const exc = buildings.exclude
        ? Array.isArray(buildings.exclude)
          ? buildings.exclude
          : Object.values(buildings.exclude)
        : [];
      if (exc.length > 0) {
        buildingFilter += `
          AND (
            (sm.movement_type = 'INBOUND' AND (tl.building IS NULL OR tl.building NOT IN (?)))
            OR
            (sm.movement_type IN ('SALE', 'OUT') AND (fl.building IS NULL OR fl.building NOT IN (?)))
          )
        `;
        queryParams.push(exc, exc);
      }
    }
  }

  let searchJoin = "";
  let searchFilter = "";

  // Kita butuh JOIN products jika ada searchQuery ATAU categoryId
  if (searchQuery || (categoryId && categoryId !== "all")) {
    searchJoin = "JOIN products p ON sm.product_id = p.id";

    if (searchQuery) {
      searchFilter += " AND (p.sku LIKE ? OR p.name LIKE ?)";
      const likeTerm = `%${searchQuery}%`;
      queryParams.push(likeTerm, likeTerm);
    }

    const cClauses = buildTriStateWhere("p.category_id", categoryId, queryParams);
    if (cClauses.length > 0) {
      searchFilter += ` AND ${cClauses.join(" AND ")}`;
    }
  }

  let dateSelect = "DATE_FORMAT(sm.created_at, '%Y-%m-%d')";
  if (timeResolution === "monthly") {
    dateSelect = "DATE_FORMAT(sm.created_at, '%Y-%m')";
  } else if (timeResolution === "annual") {
    dateSelect = "DATE_FORMAT(sm.created_at, '%Y')";
  }

  const query = `
    SELECT
      ${dateSelect} as date,
      SUM(CASE WHEN sm.movement_type IN ('SALE', 'OUT') THEN sm.quantity ELSE 0 END) AS total_out,
      SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.quantity ELSE 0 END) AS total_in
    FROM stock_movements sm
    LEFT JOIN locations fl ON sm.from_location_id = fl.id
    LEFT JOIN locations tl ON sm.to_location_id = tl.id
    ${searchJoin}
    WHERE DATE(sm.created_at) >= ? AND DATE(sm.created_at) <= ?
    ${buildingFilter}
    ${searchFilter}
    GROUP BY ${dateSelect}
    ORDER BY date ASC
  `;

  const [rows] = await connection.query(query, queryParams);
  return rows;
};

/**
 * Build common WHERE clause fragments for shop performance queries.
 * @param {Object} filters
 * @returns {{ filterSql: string, filterParams: Array }}
 */
const buildShopFilters = (filters) => {
  const { source, shopName } = filters;
  const filterParams = [];
  const clauses = [];

  const sourceClauses = buildTriStateWhere("pl.source", source, filterParams);
  if (sourceClauses.length > 0) clauses.push(...sourceClauses);

  const shopClauses = buildTriStateWhere("pl.shop_name", shopName, filterParams);
  if (shopClauses.length > 0) clauses.push(...shopClauses);

  let filterSql = "";
  if (clauses.length > 0) {
    filterSql = ` AND ` + clauses.join(" AND ");
  }

  return { filterSql, filterParams };
};

/**
 * Get sales statistics aggregated by shop name and source.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { startDate, endDate, source, shopName }
 * @returns {Promise<Array>}
 */
export const getShopPerformanceStats = async (connection, filters) => {
  const { startDate, endDate } = filters;
  const { filterSql, filterParams } = buildShopFilters(filters);

  const query = `
    SELECT
      pl.source,
      COALESCE(pl.shop_name, 'Toko Tidak Diketahui') as shop_name,
      COUNT(DISTINCT pl.id) as total_orders,
      SUM(pli.quantity) as total_items_sold,
      SUM(pli.quantity * pli.price) as total_revenue
    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    WHERE pl.order_date >= ?
      AND pl.order_date <= ?
      AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
      AND pl.is_active = 1
      ${filterSql}
    GROUP BY pl.source, pl.shop_name
    ORDER BY total_revenue DESC
  `;

  const [rows] = await connection.query(query, [startDate, endDate, ...filterParams]);
  return rows;
};

/**
 * Get daily sales trend within a date range.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { startDate, endDate, source }
 * @returns {Promise<Array>}
 */
export const getDailySalesTrend = async (connection, filters) => {
  const { startDate, endDate } = filters;
  const { filterSql, filterParams } = buildShopFilters(filters);

  const query = `
    SELECT
      DATE(pl.order_date) as date,
      COUNT(DISTINCT pl.id) as total_orders,
      SUM(pli.quantity) as total_items_sold,
      SUM(pli.quantity * pli.price) as total_revenue
    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    WHERE pl.order_date >= ?
      AND pl.order_date <= ?
      AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
      AND pl.is_active = 1
      ${filterSql}
    GROUP BY DATE(pl.order_date)
    ORDER BY date ASC
  `;

  const [rows] = await connection.query(query, [startDate, endDate, ...filterParams]);
  return rows;
};

/**
 * Get top selling products per shop within a date range.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { startDate, endDate, source, limit }
 * @returns {Promise<Array>}
 */
export const getTopSellingProducts = async (connection, filters) => {
  const { startDate, endDate, limit = 10 } = filters;
  const { filterSql, filterParams } = buildShopFilters(filters);

  const query = `
    SELECT
      pl.source,
      COALESCE(pl.shop_name, 'Toko Tidak Diketahui') as shop_name,
      p.sku,
      p.name as product_name,
      SUM(pli.quantity) as total_sold,
      SUM(pli.quantity * pli.price) as revenue
    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    JOIN products p ON pli.product_id = p.id
    WHERE pl.order_date >= ?
      AND pl.order_date <= ?
      AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
      AND pl.is_active = 1
      ${filterSql}
    GROUP BY pl.source, pl.shop_name, p.id
    ORDER BY total_sold DESC
    LIMIT ?
  `;

  const [rows] = await connection.query(query, [
    startDate,
    endDate,
    ...filterParams,
    Number(limit),
  ]);
  return rows;
};

/**
 * Get fulfillment health statistics (completion rate, cancellation rate).
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { startDate, endDate, source }
 * @returns {Promise<Array>}
 */
export const getFulfillmentHealth = async (connection, filters) => {
  const { startDate, endDate } = filters;
  const { filterSql, filterParams } = buildShopFilters(filters);

  const query = `
    SELECT
      pl.source,
      COALESCE(pl.shop_name, 'Toko Tidak Diketahui') as shop_name,
      COUNT(*) as total_orders,
      SUM(CASE WHEN pl.status IN ('COMPLETED', 'SHIPPED', 'PACKED') THEN 1 ELSE 0 END) as completed_orders,
      SUM(CASE WHEN pl.status = 'CANCEL' THEN 1 ELSE 0 END) as cancelled_orders,
      SUM(CASE WHEN pl.status = 'RETURNED' THEN 1 ELSE 0 END) as returned_orders,
      SUM(CASE WHEN pl.status = 'PENDING' THEN 1 ELSE 0 END) as pending_orders
    FROM picking_lists pl
    WHERE pl.order_date >= ?
      AND pl.order_date <= ?
      AND pl.is_active = 1
      ${filterSql}
    GROUP BY pl.source, pl.shop_name
    ORDER BY total_orders DESC
  `;

  const [rows] = await connection.query(query, [startDate, endDate, ...filterParams]);
  return rows;
};

/**
 * Get period comparison data (current vs previous period).
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { startDate, endDate, prevStartDate, prevEndDate, source, shopName }
 * @returns {Promise<{current: Object, previous: Object}>}
 */
export const getPeriodComparison = async (connection, filters) => {
  const { startDate, endDate, prevStartDate, prevEndDate } = filters;
  const { filterSql, filterParams } = buildShopFilters(filters);

  const query = `
    SELECT
      CASE
        WHEN pl.order_date >= ? AND pl.order_date <= ? THEN 'current'
        WHEN pl.order_date >= ? AND pl.order_date <= ? THEN 'previous'
      END as period,
      COUNT(DISTINCT pl.id) as total_orders,
      SUM(pli.quantity) as total_items_sold,
      SUM(pli.quantity * pli.price) as total_revenue
    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    WHERE (
        (pl.order_date >= ? AND pl.order_date <= ?)
        OR (pl.order_date >= ? AND pl.order_date <= ?)
      )
      AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
      AND pl.is_active = 1
      ${filterSql}
    GROUP BY period
  `;

  // Params: CASE current start/end, CASE prev start/end, WHERE current start/end, WHERE prev start/end, ...shopFilters
  const params = [
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    ...filterParams,
  ];

  const [rows] = await connection.query(query, params);
  return rows;
};

/**
 * Get package components analysis based on package sales
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { startDate, endDate, categoryId, searchQuery }
 * @returns {Promise<Array>}
 */
export const getPackageComponentAnalysis = async (connection, filters) => {
  const { startDate, endDate, categoryId, searchQuery } = filters;
  const queryParams = [startDate, endDate];
  let searchFilter = "";

  if (searchQuery) {
    searchFilter = " AND (cp.sku LIKE ? OR cp.name LIKE ?)";
    queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
  }

  const cClauses = buildTriStateWhere("cp.category_id", categoryId, queryParams);
  if (cClauses.length > 0) {
    searchFilter += ` AND ${cClauses.join(" AND ")}`;
  }

  const query = `
    SELECT
      cp.id as component_product_id,
      cp.sku as component_sku,
      cp.name as component_name,
      cp.category_id as component_category_id,
      COALESCE((SELECT SUM(quantity) FROM stock_locations WHERE product_id = cp.id), 0) as current_stock,
      pp.sku as package_sku,
      pp.name as package_name,
      pp.category_id as package_category_id,
      COALESCE(s_mov.comp_needed, 0) / pc.quantity_per_package as sold,
      pc.quantity_per_package as qty_per_package,
      COALESCE(s_mov.comp_needed, 0) as subtotal_needed
    FROM products cp
    JOIN package_components pc ON cp.id = pc.component_product_id
    JOIN products pp ON pc.package_product_id = pp.id
    LEFT JOIN (
        SELECT pli.original_sku, pli.product_id, SUM(pli.quantity) as comp_needed
        FROM picking_list_items pli
        JOIN picking_lists pl ON pli.picking_list_id = pl.id
        WHERE pl.status NOT IN ('CANCEL', 'OBSOLETE')
          AND pl.is_active = 1
          AND COALESCE(DATE(pl.order_date), DATE(pl.created_at)) >= ?
          AND COALESCE(DATE(pl.order_date), DATE(pl.created_at)) <= ?
        GROUP BY pli.original_sku, pli.product_id
    ) s_mov ON pp.sku = s_mov.original_sku AND cp.id = s_mov.product_id
    WHERE cp.is_package = 0 AND pp.is_active = 1
    ${searchFilter}
    HAVING subtotal_needed > 0
    ORDER BY cp.id, subtotal_needed DESC
  `;

  const [rows] = await connection.query(query, queryParams);
  return rows;
};

/**
 * Get location loads (total products, total quantity, total weight)
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { buildings, floors }
 * @returns {Promise<Array>}
 */
export const getLocationLoads = async (connection, filters) => {
  const { buildings, floors, purposes } = filters;
  const queryParams = [];
  const whereClauses = ["l.is_active = 1"];

  const bClauses = buildTriStateWhere("l.building", buildings, queryParams);
  if (bClauses.length > 0) {
    whereClauses.push(...bClauses);
  }

  const fClauses = buildTriStateWhere("l.floor", floors, queryParams);
  if (fClauses.length > 0) {
    whereClauses.push(...fClauses);
  }

  const pClauses = buildTriStateWhere("l.purpose", purposes, queryParams);
  if (pClauses.length > 0) {
    whereClauses.push(...pClauses);
  }

  let filterSql = "";
  if (whereClauses.length > 0) {
    filterSql = `WHERE ` + whereClauses.join(" AND ");
  }

  const query = `
    SELECT 
      l.id as location_id,
      l.code,
      l.name,
      l.building,
      l.floor,
      l.purpose,
      COUNT(DISTINCT sl.product_id) as total_products,
      SUM(sl.quantity) as total_quantity,
      SUM(sl.quantity * COALESCE(p.weight, 0)) as total_weight,
      SUM(sl.quantity * (COALESCE(p.length, 0) * COALESCE(p.width, 0) * COALESCE(p.height, 0))) / 1000000 as total_cbm
    FROM locations l
    LEFT JOIN stock_locations sl ON l.id = sl.location_id
    LEFT JOIN products p ON sl.product_id = p.id
    ${filterSql}
    GROUP BY l.id
    ORDER BY l.building ASC, l.floor ASC, l.code ASC
  `;

  const [rows] = await connection.query(query, queryParams);
  return rows;
};

/**
 * Get duplicate products in locations separated by purpose.
 * It finds products that have more than 1 location for the same purpose.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Object} filters { buildings, floors }
 * @returns {Promise<Array>}
 */
export const getDuplicateLocations = async (connection, filters) => {
  const { buildings, floors, purposes } = filters;
  const queryParams = [];
  const whereClauses = ["l.is_active = 1", "sl.quantity > 0"];

  const bClauses = buildTriStateWhere("l.building", buildings, queryParams);
  if (bClauses.length > 0) {
    whereClauses.push(...bClauses);
  }

  const fClauses = buildTriStateWhere("l.floor", floors, queryParams);
  if (fClauses.length > 0) {
    whereClauses.push(...fClauses);
  }

  const pClauses = buildTriStateWhere("l.purpose", purposes, queryParams);
  if (pClauses.length > 0) {
    whereClauses.push(...pClauses);
  }

  let filterSql = "";
  if (whereClauses.length > 0) {
    filterSql = `WHERE ` + whereClauses.join(" AND ");
  }

  const query = `
    SELECT
      p.id as product_id,
      p.sku,
      p.name,
      l.purpose,
      COUNT(DISTINCT sl.location_id) as location_count,
      GROUP_CONCAT(DISTINCT l.code ORDER BY l.code ASC SEPARATOR ', ') as location_codes
    FROM products p
    JOIN stock_locations sl ON p.id = sl.product_id
    JOIN locations l ON sl.location_id = l.id
    ${filterSql}
    GROUP BY p.id, l.purpose
    HAVING location_count > 1
    ORDER BY location_count DESC, p.sku ASC
  `;

  const [rows] = await connection.query(query, queryParams);
  return rows;
};

