// backend/services/exportService.js
import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as locationRepo from "../repositories/locationRepository.js";
import * as reportRepo from "../repositories/reportRepository.js";
import * as productRepo from "../repositories/productRepository.js";

// Helper Styling
const styleHeader = (
  worksheet,
  rowNumber,
  colCount,
  bgColor = "FFD9E1F2",
  fontColor = "FF000000"
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
  console.log(`[ExportService] Mulai generate STOCK ke: ${filePath}`);
  let connection;

  const stream = fs.createWriteStream(filePath);
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: stream,
    useStyles: true,
    useSharedStrings: true,
  });

  const negativeRedText = { font: { color: { argb: "FF9C0006" } } };
  const currencyFormat = '"Rp"#,##0.00';
  const numberFormat = "#,##0";
  const textFormat = "@";

  try {
    connection = await db.getConnection();

    // Ambil Daftar Lokasi untuk Header Pivot
    const locationCodes = await locationRepo.getAllLocationCodes(connection);

    // Setup Sheet 1: Pivot / Ringkasan
    const pivotSheet = writer.addWorksheet("Ringkasan Stok");
    const pivotHeaderTexts = [
      "SKU",
      "Nama Produk",
      ...locationCodes,
      "Grand Total",
    ];

    // Setup Columns
    const pivotColumns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
    ];
    locationCodes.forEach((code) => pivotColumns.push({ key: code, width: 10 }));
    pivotColumns.push(
      { key: "GrandTotal", width: 15 }
    );
    pivotSheet.columns = pivotColumns;

    // Judul & Header
    pivotSheet.mergeCells(1, 1, 1, pivotHeaderTexts.length);
    const titleCell = pivotSheet.getCell("A1");
    titleCell.value = "Laporan Ringkasan Stok (Per Lokasi)";
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: "center" };
    pivotSheet.getRow(1).commit();

    const pivotHeaderRow = pivotSheet.getRow(3);
    pivotHeaderRow.values = pivotHeaderTexts;
    styleHeader(pivotSheet, 3, pivotHeaderTexts.length, "FF4472C4", "FFFFFFFF");

    // Setup Sheet 2: Raw Data
    const rawSheet = writer.addWorksheet("Data Mentah");
    const rawHeaderTexts = [
      "SKU",
      "Nama Produk",
      "Lokasi",
      "Kuantitas",
      "Kuantitas",
    ];
    rawSheet.columns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
      { key: "Lokasi", width: 15 },
      { key: "Kuantitas", width: 12 },
      { key: "Kuantitas", width: 12 },
    ];
    rawSheet.getRow(1).values = rawHeaderTexts;
    styleHeader(rawSheet, 1, 6, "FFD9E1F2", "FF000000");

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
        console.error(`[ExportService] SQL Stream Error: ${err.message}`);
        cleanup();
        reject(err);
      });

      queryStream.on("data", (row) => {
        try {
          // A. Tulis Raw Row
          const rowArray = [
            row.Sku,
            row.NamaProduk,
            row.Lokasi || "-",
            row.Kuantitas,
            row.Kuantitas,
          ];
          const addedRow = rawSheet.addRow(rowArray);

          // Formatting
          addedRow.getCell(1).numFmt = textFormat;
          addedRow.getCell(4).numFmt = numberFormat;
          if (Number(row.Kuantitas) < 0) addedRow.getCell(4).font = negativeRedText.font;
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
          for (const [sku, data] of pivotData) {
            const rowArray = [
              data.Sku,
              data.NamaProduk,
              ...locationCodes.map((code) => (data[code] === 0 ? "" : data[code])),
              data.GrandTotalKuantitas,
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

            colIdx++;
              grandTotalCell.font = { bold: true, ...negativeRedText.font };

            colIdx++;

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
      } catch (e) {}
    }
    throw error;
  }
};

import * as fastCsv from "fast-csv";

/**
 * Generate Product Master Export (XLSX or CSV)
 */
export const generateProductExportStreaming = async (filters, filePath) => {
  const isCsv = filters.format === "csv";
  console.log(
    `[ExportService] Mulai generate MASTER PRODUK (${isCsv ? "CSV" : "XLSX"}) ke: ${filePath}`
  );

  let connection;
  const stream = fs.createWriteStream(filePath);
  let workbookWriter = null;
  let csvStream = null;
  console.log(`[ExportService] Stream created for ${filePath}`);

  try {
    connection = await db.getConnection();

    // Setup Writter
    if (isCsv) {
      csvStream = fastCsv.format({ headers: true });
      csvStream.pipe(stream);
    } else {
      workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: stream,
        useStyles: true,
        useSharedStrings: true,
      });
    }

    // --- QUERY DATA ---
    // (Optimization: Fetch with stream if extremely large, but for now huge limit is fine)
    // [PHASE 1] Force Regular Product Only (is_package=0)
    const exportFilters = { ...filters, is_package: 0, packageOnly: false, limit: 1000000, offset: 0 };
    const result = await productRepo.getProductsWithFilters(connection, exportFilters);
    const products = result.data;

    // --- WRITE DATA ---
    if (isCsv) {
      // CSV WRITING via Pipeline (Safer & Auto-close)
      console.log("[ExportService] Starting CSV Pipeline...");

      const transformRow = (p) => ({
        sku: p.sku,
        name: p.name,
        price: p.price,
        weight: p.weight || 0,
        is_active: p.is_active ? 1 : 0,
      });

      await pipeline(
        Readable.from(products),
        fastCsv.format({ headers: true }).transform(transformRow),
        stream
      );

      console.log("[ExportService] CSV Pipeline Completed.");
    } else {
      // EXCEL WRITING
      const sheet = workbookWriter.addWorksheet("Master Produk");
      const headers = ["sku", "name", "price", "weight", "is_active"];

      sheet.columns = [
        { key: "sku", width: 12 },
        { key: "name", width: 75 },
        { key: "price", width: 15 },
        { key: "weight", width: 12 },
        { key: "is_active", width: 12 },
      ];

      sheet.getRow(1).values = headers;
      styleHeader(sheet, 1, headers.length, "FF4472C4", "FFFFFFFF");

      products.forEach((p) => {
        sheet
          .addRow({
            sku: p.sku,
            name: p.name,
            price: p.price,
            weight: p.weight || 0,
            is_active: p.is_active ? 1 : 0,
          })
          .commit();
      });

      sheet.commit();
      await workbookWriter.commit();
    }

    // Tunggu stream selesai benar (Hanya untuk Excel, karena Pipeline CSV sudah auto-wait)
    if (!isCsv) {
      console.log("[ExportService] Waiting for stream finish/close...");
      await new Promise((resolve, reject) => {
        if (stream.writableEnded || stream.destroyed) {
           console.log("[ExportService] Stream checks: already ended/destroyed. Resolving.");
           return resolve();
        }

        stream.on("finish", () => {
          console.log("[ExportService] Stream FINISHED.");
          resolve();
        });
        stream.on("close", () => {
          console.log("[ExportService] Stream CLOSED.");
          resolve();
        });
        stream.on("error", (err) => {
          console.error("[ExportService] Stream ERROR:", err);
          reject(err);
        });
      });
    }

    console.log(`[ExportService] Selesai generate MASTER PRODUK.`);
  } catch (error) {
    if (workbookWriter) {
      // Try to close writer/stream on error
      try {
        stream.end();
      } catch (e) {}
    }
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
