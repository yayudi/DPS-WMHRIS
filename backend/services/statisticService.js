// backend/services/statisticService.js
import * as statisticRepo from "../repositories/statisticRepository.js";
import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import Logger from "../utils/logger.js";
import { styleHeader, sanitizeSheetName } from "../utils/excelUtils.js";

/**
 * @param {string} startDate
 * @param {string} endDate
 */
export const getStockMovementStatistics = async (filters) => {
  const { startDate, endDate, status: filterStatus, movement: filterMovement } = filters;
  let connection;
  try {
    connection = await db.getConnection();

    // Fetch data paralel
    const [rows, timelineRows] = await Promise.all([
      statisticRepo.getStockMovementStats(connection, filters),
      statisticRepo.getMovementTimelineStats(connection, filters),
    ]);

    // Calculate Days Diff to find Avg Daily Sales
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    // Add 1 to include both start and end dates
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1 || 1;

    let data = rows.map((row) => {
      const avgDailySales = Number(row.total_sold) / days;
      const currentStock = Number(row.current_stock);
      const daysOfInventory = avgDailySales > 0 ? currentStock / avgDailySales : -1;

      let status;

      // Stok 0 atau minus dianggap CRITICAL
      if (currentStock < 0) {
        status = "NEGATIVE";
      } else if (currentStock === 0) {
        status = "EMPTY";
      } else if (daysOfInventory >= 0 && daysOfInventory <= 7) {
        status = "CRITICAL";
      } else if (daysOfInventory > 7 && daysOfInventory <= 14) {
        status = "WARNING";
      } else if (daysOfInventory === -1 && currentStock > 0 && currentStock >= 100) {
        status = "OVERSTOCK";
      } else {
        status = "SAFE";
      }

      return {
        ...row,
        current_stock: currentStock,
        total_sold: Number(row.total_sold),
        total_inbound: Number(row.total_inbound),
        avg_daily_sales: Number(avgDailySales.toFixed(2)),
        days_of_inventory: daysOfInventory >= 0 ? Number(daysOfInventory.toFixed(1)) : null,
        status,
      };
    });

    if (filterStatus) {
      if (typeof filterStatus === "string" && filterStatus !== "all") {
        data = data.filter((item) => item.status === filterStatus.toUpperCase());
      } else if (typeof filterStatus === "object") {
        const inc = filterStatus.include
          ? Array.isArray(filterStatus.include)
            ? filterStatus.include
            : Object.values(filterStatus.include)
          : [];
        if (inc.length > 0) {
          const incUpper = inc.map((s) => String(s).toUpperCase());
          data = data.filter((item) => incUpper.includes(item.status));
        }
        const exc = filterStatus.exclude
          ? Array.isArray(filterStatus.exclude)
            ? filterStatus.exclude
            : Object.values(filterStatus.exclude)
          : [];
        if (exc.length > 0) {
          const excUpper = exc.map((s) => String(s).toUpperCase());
          data = data.filter((item) => !excUpper.includes(item.status));
        }
      }
    }

    if (filterMovement && filterMovement !== "all") {
      if (filterMovement === "active") {
        data = data.filter((item) => item.total_sold > 0 || item.total_inbound > 0);
      } else if (filterMovement === "dead") {
        data = data.filter((item) => item.total_sold === 0 && item.total_inbound === 0);
      }
    }

    // Format timeline dates nicely (e.g. YYYY-MM-DD to handle local time offsets) preserving string
    const timeline = timelineRows.map((t) => ({
      date: t.date,
      total_out: Number(t.total_out),
      total_in: Number(t.total_in),
    }));

    return {
      summary: data,
      timeline: timeline,
    };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * @param {any} filters
 * @returns {Promise<any>}
 */
export const getStockTimelineStatistics = async (filters) => {
  // Extract only needed properties or use filters directly
  let connection;
  try {
    connection = await db.getConnection();
    const rows = await statisticRepo.getMovementTimelineStats(connection, filters);

    // Map to expected format with totals
    const data = rows.map((row) => ({
      date: row.date,
      totalIn: Number(row.total_in),
      totalOut: Number(row.total_out),
      netChange: Number(row.total_in) - Number(row.total_out),
    }));

    return data;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * @param {Object} filters
 */
export const getInventoryValueStatistics = async (filters) => {
  let connection;
  try {
    connection = await db.getConnection();
    const rows = await statisticRepo.getInventoryValueStats(connection, filters);

    // Calculate global total
    let globalTotalValue = 0;
    rows.forEach((row) => {
      globalTotalValue += Number(row.total_value);
    });

    const data = rows.map((row) => {
      const percentage =
        globalTotalValue > 0 ? (Number(row.total_value) / globalTotalValue) * 100 : 0;

      let status;
      if (Number(row.total_quantity) === 0) {
        status = "EMPTY";
      } else if (Number(row.total_quantity) < 0) {
        status = "NEGATIVE";
      } else if (Number(row.total_quantity) > 100) {
        status = "OVERSTOCK";
      } else if (Number(row.total_quantity) > 50 && Number(row.total_quantity) < 100) {
        status = "WARNING";
      } else if (Number(row.total_quantity) > 0 && Number(row.total_quantity) < 50) {
        status = "CRITICAL";
      } else {
        status = "SAFE";
      }

      return {
        ...row,
        total_quantity: Number(row.total_quantity),
        total_value: Number(row.total_value),
        percentage: Number(percentage.toFixed(2)),
        status,
      };
    });

    return data;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * @param {any} filters
 * @param {any} filePath
 * @returns {Promise<any>}
 */
export const generateStatisticExport = async (filters, filePath) => {
  Logger.info(`Starting export to: ${filePath}`, "STATISTIC_SERVICE");
  const stream = fs.createWriteStream(filePath);
  const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: stream,
    useStyles: true,
    useSharedStrings: true,
  });

  const writeDataToSheet = (sheetName, data) => {
    const safeSheetName = sanitizeSheetName(sheetName);
    const sheet = workbookWriter.addWorksheet(safeSheetName);

    const headers = [
      "SKU",
      "Nama Produk",
      "Status",
      "Stok Saat Ini",
      "Total Terjual",
      "Total Masuk",
      "Rata-rata Terjual Harian",
      "Estimasi Hari Stok",
    ];

    sheet.columns = [
      { key: "sku", width: 15 },
      { key: "name", width: 40 },
      { key: "status", width: 15 },
      { key: "current_stock", width: 15 },
      { key: "total_sold", width: 15 },
      { key: "total_inbound", width: 15 },
      { key: "avg_daily_sales", width: 25 },
      { key: "days_of_inventory", width: 20 },
    ];

    sheet.getRow(1).values = headers;
    styleHeader(sheet, 1, headers.length, "FF4472C4", "FFFFFFFF");

    for (const row of data) {
      sheet
        .addRow({
          sku: row.sku,
          name: row.name,
          status: row.status,
          current_stock: row.current_stock,
          total_sold: row.total_sold,
          total_inbound: row.total_inbound,
          avg_daily_sales: row.avg_daily_sales,
          days_of_inventory: row.days_of_inventory !== null ? row.days_of_inventory : "N/A",
        })
        .commit();
    }

    sheet.commit();
  };

  try {
    // 1. Tulis Sheet Global (Gabungan semua lokasi yang di-filter)
    const globalStats = await getStockMovementStatistics(filters);
    writeDataToSheet("Statistik Global", globalStats.summary || []);

    // 2. Buat Sheet Tambahan per Gedung (jika user memfilter gedung)
    if (filters.buildings && Array.isArray(filters.buildings) && filters.buildings.length > 0) {
      for (const building of filters.buildings) {
        // Ambil data spesifik hanya untuk gedung ini
        const specificFilters = { ...filters, buildings: [building] };
        const buildingStats = await getStockMovementStatistics(specificFilters);

        writeDataToSheet(`${building}`, buildingStats.summary || []);
      }
    }

    await workbookWriter.commit();

    await new Promise((resolve, reject) => {
      if (stream.writableEnded || stream.destroyed) return resolve();
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.on("close", resolve);
    });

    Logger.info("Finished.", "STATISTIC_SERVICE");
  } catch (error) {
    Logger.error("Error in generateStatisticExport", error, "STATISTIC_SERVICE");
    try {
      stream.end();
    } catch {
      /* ignore */
    }
    throw error;
  }
};

/**
 * Fetch comprehensive Shop Performance Statistics.
 * Returns 5 datasets: summary, dailyTrend, topProducts, fulfillment, comparison.
 * @param {Object} filters { startDate, endDate, source, shopName, prevStartDate, prevEndDate }
 * @returns {Promise<{summary: Array, dailyTrend: Array, topProducts: Array, fulfillment: Array, comparison: Object}>}
 */
export const getShopPerformanceStats = async (filters) => {
  let connection;
  try {
    connection = await db.getConnection();

    const queries = [
      statisticRepo.getShopPerformanceStats(connection, filters),
      statisticRepo.getDailySalesTrend(connection, filters),
      statisticRepo.getTopSellingProducts(connection, { ...filters, limit: 10 }),
      statisticRepo.getFulfillmentHealth(connection, filters),
    ];

    // Only run comparison if previous dates are provided
    if (filters.prevStartDate && filters.prevEndDate) {
      queries.push(statisticRepo.getPeriodComparison(connection, filters));
    }

    const results = await Promise.all(queries);
    const [summaryRows, trendRows, topRows, healthRows] = results;
    const comparisonRows = results[4] || [];

    const summary = summaryRows.map((row) => ({
      ...row,
      total_orders: Number(row.total_orders),
      total_items_sold: Number(row.total_items_sold),
      total_revenue: Number(row.total_revenue),
    }));

    const dailyTrend = trendRows.map((row) => ({
      date: row.date,
      totalOrders: Number(row.total_orders),
      totalItemsSold: Number(row.total_items_sold),
      totalRevenue: Number(row.total_revenue),
    }));

    const topProducts = topRows.map((row) => ({
      source: row.source,
      shopName: row.shop_name,
      sku: row.sku,
      productName: row.product_name,
      totalSold: Number(row.total_sold),
      revenue: Number(row.revenue),
    }));

    const fulfillment = healthRows.map((row) => {
      const total = Number(row.total_orders);
      const completed = Number(row.completed_orders);
      const cancelled = Number(row.cancelled_orders);
      const returned = Number(row.returned_orders);
      const pending = Number(row.pending_orders);

      return {
        source: row.source,
        shopName: row.shop_name,
        totalOrders: total,
        completedOrders: completed,
        cancelledOrders: cancelled,
        returnedOrders: returned,
        pendingOrders: pending,
        completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
        cancellationRate: total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0,
        returnRate: total > 0 ? Number(((returned / total) * 100).toFixed(1)) : 0,
      };
    });

    // Build comparison object
    const currentRow = comparisonRows.find((r) => r.period === "current");
    const previousRow = comparisonRows.find((r) => r.period === "previous");
    const calcDelta = (curr, prev) =>
      prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0;

    const comparison = {
      current: {
        totalOrders: currentRow ? Number(currentRow.total_orders) : 0,
        totalItemsSold: currentRow ? Number(currentRow.total_items_sold) : 0,
        totalRevenue: currentRow ? Number(currentRow.total_revenue) : 0,
      },
      previous: {
        totalOrders: previousRow ? Number(previousRow.total_orders) : 0,
        totalItemsSold: previousRow ? Number(previousRow.total_items_sold) : 0,
        totalRevenue: previousRow ? Number(previousRow.total_revenue) : 0,
      },
      delta: {
        orders: calcDelta(
          currentRow ? Number(currentRow.total_orders) : 0,
          previousRow ? Number(previousRow.total_orders) : 0,
        ),
        items: calcDelta(
          currentRow ? Number(currentRow.total_items_sold) : 0,
          previousRow ? Number(previousRow.total_items_sold) : 0,
        ),
        revenue: calcDelta(
          currentRow ? Number(currentRow.total_revenue) : 0,
          previousRow ? Number(previousRow.total_revenue) : 0,
        ),
      },
    };

    return { summary, dailyTrend, topProducts, fulfillment, comparison };
  } catch (error) {
    Logger.error("Error in getShopPerformanceStats", error, "STATISTIC_SERVICE");
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get package components analysis based on package sales
 * @param {Object} filters { startDate, endDate, categoryId, searchQuery }
 * @returns {Promise<Array>}
 */
export const getPackageComponentAnalysis = async (filters) => {
  let connection;
  try {
    connection = await db.getConnection();
    const rows = await statisticRepo.getPackageComponentAnalysis(connection, filters);

    // Parse packageCategoryId filter
    let pInclude = [];
    let pExclude = [];
    if (filters.packageCategoryId) {
      try {
        const parsed = JSON.parse(filters.packageCategoryId);
        pInclude = parsed.include || [];
        pExclude = parsed.exclude || [];
      } catch {
        /* ignore */
      }
    }

    const componentMap = new Map();

    rows.forEach((row) => {
      const cmpId = row.component_product_id;
      if (!componentMap.has(cmpId)) {
        componentMap.set(cmpId, {
          component_product_id: row.component_product_id,
          sku: row.component_sku,
          name: row.component_name,
          category_id: row.component_category_id,
          current_stock: parseInt(row.current_stock) || 0,
          total_needed: 0,
          packages: [],
        });
      }

      const comp = componentMap.get(cmpId);
      const subtotalNeeded = Number(row.subtotal_needed);

      // Filter packages based on packageCategoryId
      const pid = row.package_category_id;
      let includePackage = true;
      if (pInclude.length > 0 && !pInclude.includes(pid)) includePackage = false;
      if (pExclude.length > 0 && pExclude.includes(pid)) includePackage = false;

      if (includePackage) {
        comp.packages.push({
          package_sku: row.package_sku,
          package_name: row.package_name,
          package_category_id: row.package_category_id,
          sold: parseInt(row.sold) || 0,
          qty_per_package: parseInt(row.qty_per_package) || 0,
          subtotal_needed: parseInt(row.subtotal_needed) || 0,
        });

        comp.total_needed += subtotalNeeded;
      }
    });

    const data = Array.from(componentMap.values()).map((comp) => {
      const currentStock = comp.current_stock;
      const totalNeeded = comp.total_needed;
      const deficit = totalNeeded - currentStock;

      let status = "SAFE";
      if (deficit > 0) {
        status = "DEFICIT";
      } else if (currentStock === 0 && totalNeeded > 0) {
        status = "DEFICIT";
      } else if (deficit <= 0 && deficit >= -20) {
        status = "WARNING";
      }

      return {
        ...comp,
        deficit,
        status,
      };
    });

    // Parse stockStatus filter
    let sInclude = [];
    let sExclude = [];
    if (filters.stockStatus) {
      try {
        const parsed = JSON.parse(filters.stockStatus);
        sInclude = parsed.include || [];
        sExclude = parsed.exclude || [];
      } catch {
        /* ignore */
      }
    }

    const finalData = data.filter((comp) => {
      // Don't show components that are not needed by ANY package after filtering
      if (comp.total_needed === 0) return false;

      // Filter by stock status
      if (sInclude.length > 0 && !sInclude.includes(comp.status)) return false;
      if (sExclude.length > 0 && sExclude.includes(comp.status)) return false;
      return true;
    });

    // Sort by total needed descending
    finalData.sort((a, b) => b.total_needed - a.total_needed);

    return finalData;
  } catch (error) {
    Logger.error("Error in getPackageComponentAnalysis", error, "STATISTIC_SERVICE");
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get location analysis including location loads and duplicated products
 * @param {Object} filters { buildings, floors }
 * @returns {Promise<{locationLoads: Array, duplicateProducts: Array}>}
 */
export const getLocationAnalysis = async (filters) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [locationLoads, duplicateRows] = await Promise.all([
      statisticRepo.getLocationLoads(connection, filters),
      statisticRepo.getDuplicateLocations(connection, filters),
    ]);

    // Format location loads
    const formattedLocationLoads = locationLoads.map((row) => ({
      location_id: row.location_id,
      code: row.code,
      name: row.name,
      building: row.building,
      floor: row.floor,
      purpose: row.purpose,
      total_products: Number(row.total_products) || 0,
      total_quantity: Number(row.total_quantity) || 0,
      total_weight: Number(row.total_weight) || 0,
      total_cbm: Number(row.total_cbm) || 0,
    }));

    // Format duplicate products
    const formattedDuplicateProducts = duplicateRows.map((row) => ({
      product_id: row.product_id,
      sku: row.sku,
      name: row.name,
      purpose: row.purpose,
      location_count: Number(row.location_count),
      locations: row.location_codes, // comma-separated string
    }));

    return {
      locationLoads: formattedLocationLoads,
      duplicateProducts: formattedDuplicateProducts,
    };
  } catch (error) {
    Logger.error("Error in getLocationAnalysis", error, "STATISTIC_SERVICE");
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

