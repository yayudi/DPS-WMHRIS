// backend/services/exportService.js
import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import * as fastCsv from "fast-csv";
import { pipeline } from "stream/promises";
import * as locationRepo from "../repositories/locationRepository.js";
import * as reportRepo from "../repositories/reportRepository.js";
import * as productRepo from "../repositories/productRepository.js";
import * as categoryRepo from "../repositories/categoryRepository.js";
import { buildTriStateWhere } from "./stockService.js";
import Logger from "../utils/logger.js";

// Helper Styling
const styleHeader = (
  worksheet,
  rowNumber,
  colCount,
  bgColor = "FFD9E1F2",
  fontColor = "FF000000",
) => {
  const row = worksheet.getRow(rowNumber);
  row.height = 20;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.font = { bold: true, color: { argb: fontColor } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  row.commit();
};

/**
 * Service: Generate Stock Report (Streaming)
 */
export const generateStockReportStreaming = async (filters, filePath) => {
  const isCsv = filters.format === "csv";
  Logger.info(`Mulai generate STOCK (${isCsv ? "CSV" : "XLSX"}) ke: ${filePath}`, "EXPORT_SERVICE");
  let connection;

  const stream = fs.createWriteStream(filePath);
  let writer = null;

  try {
    connection = await db.getConnection();

    // --- CSV LOGIC ---
    if (isCsv) {
      Logger.info("Starting CSV Pipeline for STOCK_REPORT...", "EXPORT_SERVICE");
      const queryStream = reportRepo.getStockReportStream(connection, filters);

      const transformRow = (row) => ({
        SKU: row.Sku,
        "Nama Produk": row.NamaProduk,
        Lokasi: row.Lokasi || "-",
        Kuantitas: row.Kuantitas,
      });

      await pipeline(
        queryStream,
        fastCsv.format({ headers: true, delimiter: ";" }).transform(transformRow),
        stream,
      );

      Logger.info("CSV Pipeline Completed.", "EXPORT_SERVICE");
      if (connection) connection.release();
      return;
    }

    // --- XLSX LOGIC ---
    writer = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: stream,
      useStyles: true,
      useSharedStrings: true,
    });

    const negativeRedText = { font: { color: { argb: "FF9C0006" } } };
    const numberFormat = "#,##0";
    const textFormat = "@";

    // Ambil Daftar Lokasi untuk Header Pivot (Hanya yang relevan dengan filter)
    const locationCodes = await locationRepo.getFilteredLocationCodes(connection, filters);

    // Setup Sheet 1: Pivot / Ringkasan
    const pivotSheet = writer.addWorksheet("Ringkasan Stok", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
    });
    const pivotHeaderTexts = ["SKU", "Nama Produk", ...locationCodes, "Grand Total"];

    // Setup Columns
    const pivotColumns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
    ];
    locationCodes.forEach((code) => pivotColumns.push({ key: code, width: 10 }));
    pivotColumns.push({ key: "GrandTotal", width: 15 });
    pivotSheet.columns = pivotColumns;

    // Judul & Header
    pivotSheet.mergeCells(1, 1, 1, 2);
    const titleCell = pivotSheet.getCell("A1");
    titleCell.value = "Laporan Ringkasan Stok (Per Lokasi)";
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: "center" };
    pivotSheet.getRow(1).commit();

    const pivotHeaderRow = pivotSheet.getRow(2);
    pivotHeaderRow.values = pivotHeaderTexts;

    styleHeader(pivotSheet, 2, pivotHeaderTexts.length, "AA4472C4", "FFFFFFFF");

    // Setup Sheet 2: Raw Data
    const rawSheet = writer.addWorksheet("Data Mentah", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const rawHeaderTexts = ["SKU", "Nama Produk", "Lokasi", "Kuantitas"];
    rawSheet.columns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
      { key: "Lokasi", width: 15 },
      { key: "Kuantitas", width: 12 },
    ];
    rawSheet.getRow(1).values = rawHeaderTexts;
    styleHeader(rawSheet, 1, 4, "FFD9E1F2", "FF000000");

    // Streaming Query
    const queryStream = reportRepo.getStockReportStream(connection, filters);
    const pivotData = new Map();

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (connection) {
          connection.release();
          connection = null;
        }
      };

      queryStream.on("error", (err) => {
        Logger.error("SQL Stream Error", err, "EXPORT_SERVICE");
        cleanup();
        reject(err);
      });

      queryStream.on("data", (row) => {
        try {
          // A. Tulis Raw Row
          const rowArray = [row.Sku, row.NamaProduk, row.Lokasi || "-", row.Kuantitas];
          const addedRow = rawSheet.addRow(rowArray);

          // Formatting
          addedRow.getCell(1).numFmt = textFormat;
          addedRow.getCell(4).numFmt = numberFormat;
          if (Number(row.Kuantitas) < 0) addedRow.getCell(4).font = negativeRedText.font;
          addedRow.commit();

          // B. Agregasi Pivot In-Memory
          // (Asumsi jumlah SKU tidak jutaan, Map masih aman di memori)
          const qty = Number(row.Kuantitas) || 0;
          const val = Number(row.TotalNilai) || 0;
          const price = Number(row.HargaSatuan) || 0;

          if (!pivotData.has(row.Sku)) {
            const newEntry = {
              Sku: row.Sku,
              NamaProduk: row.NamaProduk,
              HargaSatuan: price,
              GrandTotalKuantitas: 0,
              GrandTotalNilai: 0,
            };
            for (const code of locationCodes) newEntry[code] = 0;
            pivotData.set(row.Sku, newEntry);
          }

          const current = pivotData.get(row.Sku);
          if (row.Lokasi && locationCodes.includes(row.Lokasi)) {
            current[row.Lokasi] += qty;
          }
          current.GrandTotalKuantitas += qty;
          current.GrandTotalNilai += val;
        } catch (processingError) {
          cleanup();
          reject(new Error(`Error processing row: ${processingError.message}`));
        }
      });

      queryStream.on("end", async () => {
        try {
          rawSheet.commit(); // Selesai Raw Sheet

          // C. Tulis Pivot Sheet
          for (const data of pivotData.values()) {
            const rowArray = [
              data.Sku,
              data.NamaProduk,
              ...locationCodes.map((code) => (data[code] === 0 ? "" : data[code])),
              data.GrandTotalKuantitas,
            ];
            const addedRow = pivotSheet.addRow(rowArray);

            // Formatting Pivot
            addedRow.getCell(1).numFmt = textFormat;
            let colIdx = 3;
            locationCodes.forEach(() => {
              const cell = addedRow.getCell(colIdx);
              cell.numFmt = numberFormat;
              if (Number(cell.value) < 0) cell.font = negativeRedText.font;
              colIdx++;
            });

            // Grand Total formatting
            const grandTotalCell = addedRow.getCell(colIdx);
            grandTotalCell.numFmt = numberFormat;
            grandTotalCell.font = { bold: true };
            if (data.GrandTotalKuantitas < 0)
              grandTotalCell.font = { bold: true, ...negativeRedText.font };
            grandTotalCell.font = { bold: true, ...negativeRedText.font };
            addedRow.commit();
          }

          pivotSheet.commit();
          await writer.commit(); // Finalize Excel File
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      stream.on("finish", () => {
        cleanup();
        resolve();
      });

      stream.on("error", (err) => {
        cleanup();
        reject(new Error(`File Stream Error: ${err.message}`));
      });
    });
  } catch (error) {
    if (connection) connection.release();
    if (writer) {
      try {
        stream.end();
      } catch {
        //
      }
    }
    throw error;
  }
};

/**
 * Generate Product Master Export (XLSX or CSV)
 */
export const generateProductExportStreaming = async (filters, filePath) => {
  const isCsv = filters.format === "csv";
  Logger.info(
    `Mulai generate MASTER PRODUK (${isCsv ? "CSV" : "XLSX"}) ke: ${filePath}`,
    "EXPORT_SERVICE",
  );

  let connection;
  const stream = fs.createWriteStream(filePath);
  let workbookWriter = null;
  Logger.info(`Stream created for ${filePath}`, "EXPORT_SERVICE");

  try {
    connection = await db.getConnection();

    // Setup Writter
    if (!isCsv) {
      workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: stream,
        useStyles: true,
        useSharedStrings: true,
      });
    }

    // --- QUERY DATA ---
    const exportFilters = { ...filters };
    const queryStream = productRepo.getProductsWithFiltersStream(connection, exportFilters);

    // --- WRITE DATA ---
    const includeImages = filters.includeImages === "true" || filters.includeImages === true;
    const getImageUrl = (path) => {
      if (!path) return "";
      let cleanPath = path.replace(/^\/+/, '');
      if (cleanPath.startsWith('uploads/')) cleanPath = cleanPath.replace(/^uploads\//, '');
      const base = process.env.MEDIA_URL || process.env.VITE_API_MEDIA_URL || "";
      const separator = base && !base.endsWith('/') ? '/' : '';
      return `${base}${separator}${cleanPath}`;
    };

    if (isCsv) {
      // CSV WRITING via Pipeline (Safer & Auto-close)
      Logger.info("Starting CSV Pipeline...", "EXPORT_SERVICE");

      const transformRow = (p) => {
        const row = {};
        if (!filters.columns || filters.columns.includes('sku')) row.sku = p.sku;
        if (!filters.columns || filters.columns.includes('name')) row.name = p.name;
        if (!filters.columns || filters.columns.includes('category_id')) row.kategori = p.category_name || "";
        if (!filters.columns || filters.columns.includes('price')) row.price = p.price;
        if (!filters.columns || filters.columns.includes('is_package')) row.is_package = p.is_package ? 1 : 0;
        if (!filters.columns || filters.columns.includes('weight')) row.weight = p.weight || 0;
        if (!filters.columns || filters.columns.includes('length')) row.length = p.length || 0;
        if (!filters.columns || filters.columns.includes('width')) row.width = p.width || 0;
        if (!filters.columns || filters.columns.includes('height')) row.height = p.height || 0;
        if (!filters.columns || filters.columns.includes('is_active')) row.is_active = p.is_active ? 1 : 0;

        if (includeImages) {
          row.image_url = p.main_paths
            ? p.main_paths
                .split(",")
                .map((path) => getImageUrl(path.trim()))
                .join(", ")
            : "";
        }
        return row;
      };

      await pipeline(
        queryStream,
        fastCsv.format({ headers: true, delimiter: ";" }).transform(transformRow),
        stream,
      );

      Logger.info("CSV Pipeline Completed.", "EXPORT_SERVICE");
    } else {
      // EXCEL WRITING
      const sheet = workbookWriter.addWorksheet("Master Produk");
      
      // Build dynamic columns for Excel
      const columnsDef = [];
      if (!filters.columns || filters.columns.includes('sku')) columnsDef.push({ header: "sku", key: "sku", width: 15 });
      if (!filters.columns || filters.columns.includes('name')) columnsDef.push({ header: "name", key: "name", width: 75 });
      if (!filters.columns || filters.columns.includes('category_id')) columnsDef.push({ header: "kategori", key: "kategori", width: 25 });
      if (!filters.columns || filters.columns.includes('price')) columnsDef.push({ header: "price", key: "price", width: 15 });
      if (!filters.columns || filters.columns.includes('is_package')) columnsDef.push({ header: "is_package", key: "is_package", width: 12 });
      if (!filters.columns || filters.columns.includes('weight')) columnsDef.push({ header: "weight", key: "weight", width: 12 });
      if (!filters.columns || filters.columns.includes('length')) columnsDef.push({ header: "length", key: "length", width: 12 });
      if (!filters.columns || filters.columns.includes('width')) columnsDef.push({ header: "width", key: "width", width: 12 });
      if (!filters.columns || filters.columns.includes('height')) columnsDef.push({ header: "height", key: "height", width: 12 });
      if (!filters.columns || filters.columns.includes('is_active')) columnsDef.push({ header: "is_active", key: "is_active", width: 12 });

      sheet.columns = columnsDef;
      styleHeader(sheet, 1, columnsDef.length, "FF4472C4", "FFFFFFFF");

      let imageSheet = null;
      if (includeImages) {
        imageSheet = workbookWriter.addWorksheet("Gambar Produk");
        imageSheet.columns = [
          { header: "sku", key: "sku", width: 15 },
          { header: "image_url", key: "image_url", width: 80 },
        ];
        styleHeader(imageSheet, 1, 2, "FF4472C4", "FFFFFFFF");
      }

      await new Promise((resolve, reject) => {
        queryStream.on("error", (err) => reject(err));
        queryStream.on("data", (p) => {
          const rowData = {};
          if (!filters.columns || filters.columns.includes('sku')) rowData.sku = p.sku;
          if (!filters.columns || filters.columns.includes('name')) rowData.name = p.name;
          if (!filters.columns || filters.columns.includes('category_id')) rowData.kategori = p.category_name || "";
          if (!filters.columns || filters.columns.includes('price')) rowData.price = p.price;
          if (!filters.columns || filters.columns.includes('is_package')) rowData.is_package = p.is_package ? 1 : 0;
          if (!filters.columns || filters.columns.includes('weight')) rowData.weight = p.weight || 0;
          if (!filters.columns || filters.columns.includes('length')) rowData.length = p.length || 0;
          if (!filters.columns || filters.columns.includes('width')) rowData.width = p.width || 0;
          if (!filters.columns || filters.columns.includes('height')) rowData.height = p.height || 0;
          if (!filters.columns || filters.columns.includes('is_active')) rowData.is_active = p.is_active ? 1 : 0;
          
          sheet.addRow(rowData).commit();

          if (includeImages && imageSheet && p.main_paths) {
            const paths = p.main_paths.split(",");
            paths.forEach((path) => {
              if (path.trim()) {
                imageSheet
                  .addRow({
                    sku: p.sku,
                    image_url: getImageUrl(path.trim()),
                  })
                  .commit();
              }
            });
          }
        });
        queryStream.on("end", async () => {
          try {
            sheet.commit();
            if (imageSheet) imageSheet.commit();

            // Category Reference Sheet
            const categories = await categoryRepo.findAllCategories(connection);
            const catSheet = workbookWriter.addWorksheet("Referensi Kategori");
            catSheet.columns = [
              { key: "id", width: 10 },
              { key: "name", width: 50 },
            ];
            catSheet.getRow(1).values = ["ID", "Nama Kategori (Gunakan Ini)"];
            styleHeader(catSheet, 1, 2, "FF5B9BD5", "FFFFFFFF");
            categories.forEach(c => {
              catSheet.addRow({ id: c.id, name: c.name }).commit();
            });
            catSheet.commit();

            await workbookWriter.commit();
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    }

    // Tunggu stream selesai benar (Hanya untuk Excel, karena Pipeline CSV sudah auto-wait)
    if (!isCsv) {
      Logger.info("Waiting for stream finish/close...", "EXPORT_SERVICE");
      await new Promise((resolve, reject) => {
        if (stream.writableEnded || stream.destroyed) {
          Logger.info("Stream checks: already ended/destroyed. Resolving.", "EXPORT_SERVICE");
          return resolve();
        }

        stream.on("finish", () => {
          Logger.info("Stream FINISHED.", "EXPORT_SERVICE");
          resolve();
        });
        stream.on("close", () => {
          Logger.info("Stream CLOSED.", "EXPORT_SERVICE");
          resolve();
        });
        stream.on("error", (err) => {
          Logger.error("Stream ERROR", err, "EXPORT_SERVICE");
          reject(err);
        });
      });
    }

    Logger.info("Selesai generate MASTER PRODUK.", "EXPORT_SERVICE");
  } catch (error) {
    if (workbookWriter) {
      // Try to close writer/stream on error
      try {
        stream.end();
      } catch {
        //
      }
    }
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

export const generateBatchLogExportStreaming = async (filters, filePath) => {
  const isCsv = filters.format === "csv";
  Logger.info(`Mulai generate BATCH LOG (${isCsv ? "CSV" : "XLSX"}) ke: ${filePath}`, "EXPORT_SERVICE");
  let connection;
  const stream = fs.createWriteStream(filePath);
  let writer = null;

  try {
    connection = await db.getConnection();

    const { startDate, endDate, productName, movementType, sourceLocation, destinationLocation, userId, notes } = filters;
    
    const baseWhere = `sm.created_at BETWEEN ? AND ?`;
    const params = [startDate, `${endDate} 23:59:59`];
    const conditions = [baseWhere];

    if (productName) {
      conditions.push(`(p.name LIKE ? OR p.sku LIKE ?)`);
      params.push(`%${productName}%`, `%${productName}%`);
    }

    const typeClauses = buildTriStateWhere("sm.movement_type", movementType, params);
    if (typeClauses.length > 0) {
      conditions.push(`(${typeClauses.join(" AND ")})`);
    }

    const sourceClauses = buildTriStateWhere("sm.from_location_id", sourceLocation, params);
    if (sourceClauses.length > 0) {
      conditions.push(`(${sourceClauses.join(" AND ")})`);
    }

    const destinationClauses = buildTriStateWhere("sm.to_location_id", destinationLocation, params);
    if (destinationClauses.length > 0) {
      conditions.push(`(${destinationClauses.join(" AND ")})`);
    }

    if (userId) {
      conditions.push(`u.username LIKE ?`);
      params.push(`%${userId}%`);
    }

    if (notes) {
      conditions.push(`sm.notes LIKE ?`);
      params.push(`%${notes}%`);
    }

    const whereClause = conditions.join(" AND ");

    const dataQuery = `
      SELECT sm.id,
        p.sku,
        p.name as product_name,
        sm.quantity,
        sm.movement_type,
        sm.notes,
        sm.created_at,
        u.username as user,
        from_loc.code as from_location,
        to_loc.code as to_location
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN users u ON sm.user_id = u.id
      LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
    `;

    const queryStream = connection.connection.query(dataQuery, params).stream();

    // --- CSV LOGIC ---
    if (isCsv) {
      Logger.info("Starting CSV Pipeline for BATCH_LOG...", "EXPORT_SERVICE");
      const transformRow = (row) => ({
        "Waktu": row.created_at ? new Date(row.created_at).toISOString().replace("T", " ").substring(0, 19) : "-",
        "SKU": row.sku,
        "Produk": row.product_name,
        "Tipe Pergerakan": row.movement_type,
        "Qty": row.quantity,
        "Dari Lokasi": row.from_location || "-",
        "Ke Lokasi": row.to_location || "-",
        "Notes": row.notes || "-",
        "User": row.user
      });

      await pipeline(
        queryStream,
        fastCsv.format({ headers: true, delimiter: ";" }).transform(transformRow),
        stream,
      );

      Logger.info("CSV Pipeline Completed.", "EXPORT_SERVICE");
      return;
    }

    // --- XLSX LOGIC ---
    writer = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: stream,
      useStyles: true,
      useSharedStrings: true,
    });

    const sheet = writer.addWorksheet("Batch Log", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });

    sheet.columns = [
      { header: "Waktu", key: "Waktu", width: 20 },
      { header: "SKU", key: "SKU", width: 20 },
      { header: "Produk", key: "Produk", width: 40 },
      { header: "Tipe Pergerakan", key: "Tipe", width: 20 },
      { header: "Qty", key: "Qty", width: 10 },
      { header: "Dari Lokasi", key: "Dari", width: 15 },
      { header: "Ke Lokasi", key: "Ke", width: 15 },
      { header: "Notes", key: "Notes", width: 50 },
      { header: "User", key: "User", width: 15 }
    ];

    styleHeader(sheet, 1, 9);

    await new Promise((resolve, reject) => {
      queryStream.on("data", (row) => {
        sheet.addRow({
          Waktu: row.created_at ? new Date(row.created_at).toISOString().replace("T", " ").substring(0, 19) : "-",
          SKU: row.sku,
          Produk: row.product_name,
          Tipe: row.movement_type,
          Qty: row.quantity,
          Dari: row.from_location || "-",
          Ke: row.to_location || "-",
          Notes: row.notes || "-",
          User: row.user
        }).commit();
      });

      queryStream.on("end", async () => {
        try {
          sheet.commit();
          await writer.commit();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      queryStream.on("error", reject);
    });

    Logger.info("Waiting for stream finish/close...", "EXPORT_SERVICE");
    await new Promise((resolve, reject) => {
      if (stream.writableEnded || stream.destroyed) return resolve();
      stream.on("finish", resolve);
      stream.on("close", resolve);
      stream.on("error", reject);
    });

    Logger.info("Selesai generate BATCH LOG.", "EXPORT_SERVICE");
  } catch (error) {
    if (writer) {
      try { stream.end(); } catch (err) { Logger.error("Failed closing stream", err, "EXPORT_SERVICE"); }
    }
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
