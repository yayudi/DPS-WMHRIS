import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import * as stockService from "./stockService.js";
import * as locationRepo from "../repositories/locationRepository.js";

export const processStockInboundImport = async (jobId, filePath, userId) => {
  let connection;
  const errors = [];
  const movements = [];

  try {
    connection = await db.getConnection();

    // 1. Load Location Map for Validation
    const locationMap = await locationRepo.getLocationMap(connection);

    // 2. Read Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(1); // Assume first sheet

    if (!sheet) throw new Error("File Excel tidak valid atau kosong.");

    // 3. Parse Rows
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip Header

      // Kolom: A=SKU, B=Location, C=Quantity, D=Notes
      const sku = row.getCell(1).text?.trim();
      const locCode = row.getCell(2).text?.trim();
      const quantity = parseInt(row.getCell(3).value);
      const notes = row.getCell(4).text?.trim();

      if (!sku && !locCode && !quantity) return; // Skip empty rows

      // Basic Validation
      // Cek Lokasi via Map
      const locationId = locationMap.get(locCode);
      if (!locationId) {
        errors.push({ row: rowNumber, error: `Lokasi '${locCode}' tidak ditemukan.` });
        return;
      }
      if (!sku) {
        errors.push({ row: rowNumber, error: "SKU wajib diisi." });
        return;
      }
      if (isNaN(quantity) || quantity <= 0) {
        errors.push({ row: rowNumber, error: "Quantity harus angka positif." });
        return;
      }

      movements.push({
        sku,
        quantity,
        toLocationId: locationId, // For Inbound, dest is toLocation
        fromLocationId: null, // Inbound doesn't have source
        notes: notes || "Batch Inbound",
      });
    });

    if (errors.length > 0) {
      return { success: false, errors };
    }

    if (movements.length === 0) {
      return { success: false, errors: [{ row: 0, error: "Tidak ada data valid untuk diproses." }] };
    }

    // 4. Execute Batch Inbound
    const result = await stockService.processBatchMovementsService({
      type: "INBOUND",
      fromLocationId: null,
      toLocationId: null, // Individual items carry their own toLocationId
      notes: "Batch Inbound",
      movements,
      userId,
      userRoleId: 1, // Assume Admin for Batch Import for now
    });

    return { success: true, count: result.count };
  } finally {
    if (connection) connection.release();
    // Cleanup file
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.error("Gagal hapus file upload:", e);
    }
  }
};
