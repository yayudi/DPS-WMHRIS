// backend/services/stockImportService.js
import fs from "fs";
import ExcelJS from "exceljs";
import path from "path";
import * as productRepo from "../repositories/productRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

/**
 * Service untuk memproses import Stock Opname / Adjustment
 * Mendukung Dry Run dan Progress Tracking.
 */
export async function processStockImport(
  connection,
  filePath,
  userId,
  originalFilename = null,
  onProgress = null,
  dryRun = false
) {
  try {
    const fileNameForLog = originalFilename || path.basename(filePath);
    console.log(`[StockImport] Memulai proses file (DryRun=${dryRun}): ${fileNameForLog}`);

    // 1. Baca Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet("Input Stok") || workbook.worksheets[0]; // Fallback ke sheet pertama jika nama beda

    if (!worksheet)
      throw new Error("File Excel tidak valid atau kosong (Sheet 'Input Stok' tidak ditemukan).");

    const rawItems = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip Header

      // Asumsi Kolom: A=SKU, B=Kode Lokasi, C=Qty Fisik, D=Catatan
      const sku = row.getCell(1).value?.toString().trim();
      const locCode = row.getCell(2).value?.toString().trim();
      const qtyVal = row.getCell(3).value;
      const notes = row.getCell(4).value?.toString().trim();

      if (sku && locCode && qtyVal !== null && qtyVal !== undefined) {
        rawItems.push({
          row: rowNumber,
          sku,
          locCode,
          qty: parseInt(qtyVal, 10),
          notes,
        });
      }
    });

    const totalRows = rawItems.length;
    console.log(`[StockImport] Ditemukan ${totalRows} baris data stok.`);

    // 2. Pre-fetch Data Referensi (Batch Optimization)
    const allSkus = new Set(rawItems.map((i) => i.sku));

    // Fetch Products (termasuk komponen paket)
    const productMap = await productRepo.getProductMapWithComponents(
      connection,
      Array.from(allSkus)
    );

    // Fetch Locations Manual (karena locationRepo mungkin belum punya bulk getByCodes)
    // Kita buat map sederhana: Code -> ID
    const [locRows] = await connection.query("SELECT id, code FROM locations WHERE is_active = 1");
    const locationMap = new Map(locRows.map((l) => [l.code, l.id]));

    // Lapor progress awal
    if (onProgress) await onProgress(0, totalRows);

    let successCount = 0;
    const errors = [];
    let processedCounter = 0;

    // 3. Mulai Transaksi
    await connection.beginTransaction();

    try {
      for (const item of rawItems) {
        try {
          // Validasi Lokasi
          const locationId = locationMap.get(item.locCode);
          if (!locationId) {
            throw new Error(`Lokasi '${item.locCode}' tidak ditemukan.`);
          }

          // Validasi Produk
          const product = productMap.get(item.sku);
          if (!product) {
            throw new Error(`SKU '${item.sku}' tidak terdaftar.`);
          }

          // Logic Breakdown Paket
          let itemsToProcess = [];

          if (product.is_package) {
            if (!product.components || product.components.length === 0) {
              throw new Error(`Paket '${item.sku}' tidak memiliki komponen terdaftar.`);
            }
            // Pecah ke komponen
            itemsToProcess = product.components.map((comp) => ({
              productId: comp.component_product_id, // Pastikan field ini sesuai repo
              targetQty: item.qty * comp.quantity_per_package,
              isComponent: true,
              parentSku: item.sku,
            }));
          } else {
            // Single Product
            itemsToProcess.push({
              productId: product.id,
              targetQty: item.qty,
              isComponent: false,
            });
          }

          // Eksekusi Update Stok
          for (const proc of itemsToProcess) {
            // Cek Stok Lama (untuk log selisih)
            const oldStock = await locationRepo.getStockAtLocation(
              connection,
              proc.productId,
              locationId
            );
            const diff = proc.targetQty - oldStock;

            if (diff !== 0) {
              // Upsert Stok (Set Absolute)
              // Note: upsertStock harus support set nilai absolut, bukan increment
              // Jika repo Anda cuma punya increment, kita harus hitung selisih.
              // Asumsi: locationRepo.upsertStock(conn, prodId, locId, newQty) -> Set nilai jadi newQty
              await locationRepo.upsertStock(
                connection,
                proc.productId,
                locationId,
                proc.targetQty
              );

              // Catat Log
              const auditNote = `Opname${dryRun ? " (Simulasi)" : ""}: ${
                item.notes || "-"
              } | File: ${fileNameForLog}`;
              const logType = diff > 0 ? "ADJUST_PLUS" : "ADJUST_MINUS";

              await stockRepo.createLog(connection, {
                productId: proc.productId,
                quantity: Math.abs(diff), // Log movement selalu positif
                fromLocationId: diff < 0 ? locationId : null,
                toLocationId: diff > 0 ? locationId : null,
                type: logType,
                userId: userId,
                notes: proc.isComponent ? `[Komp. dari ${proc.parentSku}] ${auditNote}` : auditNote,
              });
            }
          }

          successCount++;
        } catch (rowErr) {
          errors.push({ row: item.row, message: rowErr.message, sku: item.sku });
        }

        processedCounter++;
        if (onProgress && processedCounter % 20 === 0) {
          await onProgress(processedCounter, totalRows);
        }
      }

      // Finalisasi Transaksi
      if (dryRun) {
        console.log(`[StockImport] Mode Dry Run. Rollback.`);
        await connection.rollback();
        successCount = 0; // Reset karena tidak ada yg tersimpan
      } else {
        await connection.commit();
        console.log(`[StockImport] Commit Database.`);
      }

      if (onProgress) await onProgress(totalRows, totalRows);
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    let summaryMsg = dryRun
      ? `[SIMULASI] Valid: ${successCount} baris. Error: ${errors.length} baris.`
      : `Sukses: ${successCount} stok diperbarui. Gagal: ${errors.length}.`;

    return {
      logSummary: summaryMsg,
      errors: errors,
      stats: { success: successCount, failed: errors.length },
    };
  } catch (error) {
    console.error("[StockImport] Fatal Error:", error);
    throw error;
  }
}
