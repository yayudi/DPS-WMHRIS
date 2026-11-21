import db from "../config/db.js";
import ExcelJS from "exceljs";
import * as stockService from "./stockService.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as productRepo from "../repositories/productRepository.js";
import { STOCK_MOVEMENT_TYPE } from "../config/wmsConstants.js";

/**
 * @param {number|string} jobId
 * @param {any} filePath
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const processStockInboundImport = async (
  jobId,
  filePath,
  userId,
  jobNotes = "Batch Inbound",
) => {
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
    const sheet = workbook.getWorksheet(1);

    if (!sheet) throw new Error("File Excel tidak valid atau kosong.");

    // 3. First pass: collect unique SKUs for bulk validation
    const skuSet = new Set();
    const rawRows = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip Header

      const sku = row.getCell(1).text?.trim();
      const locCode = row.getCell(2).text?.trim();
      const qtyRaw = row.getCell(3).value;
      const notes = row.getCell(4).text?.trim();

      if (!sku && !locCode && !qtyRaw) return; // Skip empty rows

      if (sku) skuSet.add(sku);
      rawRows.push({ rowNumber, sku, locCode, qtyRaw, notes });
    });

    // 4. Bulk fetch product map for SKU validation
    const productMap =
      skuSet.size > 0
        ? await productRepo.getProductMapWithComponents(connection, Array.from(skuSet))
        : new Map();

    // 5. Second pass: validate each row
    for (const { rowNumber, sku, locCode, qtyRaw, notes } of rawRows) {
      const quantity = parseInt(qtyRaw);

      if (!sku) {
        errors.push({ row: rowNumber, error: "SKU wajib diisi." });
        continue;
      }
      if (!productMap.has(sku)) {
        errors.push({ row: rowNumber, error: `SKU '${sku}' tidak ditemukan di database.` });
        continue;
      }

      const locationId = locationMap.get(locCode);
      if (!locationId) {
        errors.push({ row: rowNumber, error: `Lokasi '${locCode}' tidak ditemukan.` });
        continue;
      }
      if (isNaN(quantity) || quantity <= 0) {
        errors.push({ row: rowNumber, error: "Quantity harus angka positif." });
        continue;
      }

      movements.push({
        sku,
        quantity,
        toLocationId: locationId,
        fromLocationId: null,
        notes: notes || jobNotes || "Batch Inbound",
      });
    }

    if (movements.length === 0) {
      return {
        success: false,
        errors:
          errors.length > 0 ? errors : [{ row: 0, error: "Tidak ada data valid untuk diproses." }],
      };
    }

    // 4. Execute Batch Inbound
    const result = await stockService.processBatchMovementsService({
      type: STOCK_MOVEMENT_TYPE.INBOUND,
      fromLocationId: null,
      toLocationId: null, // Individual items carry their own toLocationId
      notes: jobNotes || "Batch Inbound",
      movements,
      userId,
      userRoleId: 1, // Assume Admin for Batch Import for now
    });

    return { success: true, count: result.count, errors };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Proses Bulk Import Stock Adjustment (Stock Opname)
 * Digunakan oleh importQueue.js -> jobType: ADJUST_STOCK
 *
 * @param {object} connection - DB Connection dari Worker
 * @param {string} filePath - Absolute path ke file Excel
 * @param {number} userId - ID User yang menjalankan job
 * @param {string} originalFilename - Nama file asli
 * @param {function} updateProgress - Callback untuk update progress worker
 * @param {boolean} isDryRun - Jika true, hanya simulasi
 * @returns {Promise<object>} - { stats, errors, logSummary }
 */
export const processStockImport = async (
  connection,
  filePath,
  userId,
  originalFilename,
  updateProgress,
  isDryRun,
) => {
  const errors = [];
  const movements = [];
  const stats = { success: 0, failed: 0 };
  let logSummary;

  try {
    // 1. Load Data dasar (Location Map)
    const locationMap = await locationRepo.getLocationMap(connection);

    // 2. Baca file Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(1);

    if (!sheet) {
      throw new Error("File Excel tidak valid atau kosong.");
    }

    // Ekstrak baris (mulai dari baris 2 karena baris 1 adalah header)
    // Excel columns expected: A=SKU, B=LT (Lokasi), C=ACTUAL, D=NOTES
    const rowData = [];
    const skuSet = new Set();

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip Header

      const sku = row.getCell(1).text?.trim();
      const locCode = row.getCell(2).text?.trim();
      const actualStr = row.getCell(3).text?.trim() || row.getCell(3).value?.toString();
      const notes = row.getCell(4).text?.trim();

      if (!sku && !locCode && !actualStr) return; // Skip baris kosong

      skuSet.add(sku);
      rowData.push({
        rowNumber,
        sku,
        locCode,
        actualStr,
        notes,
      });
    });

    if (rowData.length === 0) {
      logSummary = "Selesai. Tidak ada baris data untuk diproses.";
      return { stats, errors, logSummary };
    }

    // 3. Ambil Product Map untuk validasi SKU massal
    const productMap = await productRepo.getProductMapWithComponents(
      connection,
      Array.from(skuSet),
    );

    // 4. Proses perhitungan selisih stok (Difference)
    for (let i = 0; i < rowData.length; i++) {
      const data = rowData[i];
      const { rowNumber, sku, locCode, actualStr, notes } = data;

      try {
        // Validasi Lokasi
        const locationId = locationMap.get(locCode);
        if (!locationId) {
          throw new Error(`Lokasi '${locCode}' tidak valid atau tidak ditemukan.`);
        }

        // Validasi Produk
        const product = productMap.get(sku.toUpperCase());
        if (!product) {
          throw new Error(`SKU '${sku}' tidak ditemukan di database.`);
        }

        // Validasi Aktual (Harus Angka)
        const actual = parseInt(actualStr, 10);
        if (isNaN(actual) || actual < 0) {
          throw new Error(`Stok aktual ('${actualStr}') tidak valid. Harus angka bulat >= 0.`);
        }

        // Tambahkan ke daftar movement (dengan quantity absolut aktual)
        movements.push({
          sku,
          quantity: actual,
          toLocationId: locationId,
          notes: notes || "Stock Opname (Excel)",
        });

        stats.success++;
      } catch (err) {
        // Tangkap error per baris tanpa menghentikan proses
        errors.push({ row: rowNumber, message: err.message });
        stats.failed++;
      }

      // Update progress tiap 50 baris
      if (i % 50 === 0 && typeof updateProgress === "function") {
        await updateProgress(i + 1, rowData.length);
      }
    }

    // 5. Eksekusi Batch
    let processedMovements = 0;
    if (movements.length > 0 && !isDryRun) {
      // Panggil Service Khusus Opname (Pure Override)
      const result = await stockService.processBatchOpnameService({
        movements,
        userId, // Diambil dari args worker
        userRoleId: 1, // Superadmin assumption for worker imports
      });
      processedMovements = result.count || 0;
    }

    // 6. Siapkan Laporan Balasan
    logSummary = `Selesai Import Penyesuaian Stok. Berhasil validasi: ${stats.success} baris. Gagal: ${stats.failed} baris. ${movements.length} item diproses (${processedMovements} movement DB).`;
    if (isDryRun) {
      logSummary = `[SIMULASI] ${logSummary}`;
    }

    return { stats, errors, logSummary };
  } catch (err) {
    // Tangkap error global
    return {
      stats,
      errors: [{ row: 0, message: err.message }],
      logSummary: `Gagal total memproses Import Stok: ${err.message}`,
    };
  }
};
