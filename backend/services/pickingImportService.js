// backend/services/pickingImportService.js
import db from "../config/db.js";
import * as validationHelper from "./helpers/pickingValidationHelper.js";

// Helper log sederhana dengan Timestamp
const log = (msg) => {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[SYNC][${time}] ${msg}`);
};

/**
 * SERVICE: Process Import Data (Orchestrator)
 */
export const syncOrdersToDB = async (
  connection,
  groupedOrders,
  userId,
  originalFilename,
  onProgress = null,
  dryRun = false
) => {
  const summary = { processed: 0, updatedCount: 0, errors: [] };
  const ordersToProcess = Array.from(groupedOrders.values());
  const totalOrders = ordersToProcess.length;

  if (totalOrders === 0) return summary;

  log(`🚀 Memulai proses ${totalOrders} order. Mode: ${dryRun ? "DRY RUN (Simulasi)" : "LIVE"}`);

  // Report Progress Awal
  if (onProgress) await onProgress(0, totalOrders);

  try {
    // Kumpulkan SKU
    const allSkus = new Set();
    ordersToProcess.forEach((order) => {
      order.items.forEach((item) => allSkus.add(item.sku));
    });

    log(`📦 Mengambil referensi untuk ${allSkus.size} SKU unik...`);
    const dbData = await validationHelper.fetchReferenceData(connection, Array.from(allSkus));

    // 2. Mulai Transaksi Global
    // Penting: Transaksi dimulai DI SINI, bukan di dalam helper, agar bisa di-rollback total.
    await connection.beginTransaction();

    try {
      // 3. Handle Existing Invoices (Sync Status / Archive / Cancel)
      // Helper ini sekarang HANYA menjalankan query, tidak commit transaksi.
      log(`🔄 Sinkronisasi status order lama...`);

      // Inject filename ke setiap order untuk keperluan logging/notes
      ordersToProcess.forEach((o) => (o.originalFilename = originalFilename));

      const newOrdersToInsert = await validationHelper.handleExistingInvoices(
        connection,
        ordersToProcess
      );

      log(`✨ ${newOrdersToInsert.length} order baru siap divalidasi & insert.`);

      // 4. Proses Insert Order Baru
      let processedCounter = 0;

      // Grouping untuk Insert Batch (Validasi dulu per order)
      for (const order of newOrdersToInsert) {
        const { validItems, invalidSkus } = validationHelper.calculateValidations(
          order.items,
          dbData
        );

        if (invalidSkus.length > 0) {
          invalidSkus.forEach((err) => summary.errors.push(`Order ${order.invoiceId}: ${err}`));
          continue; // Skip order ini
        }

        if (validItems.length > 0) {
          // Attach metadata
          const meta = {
            userId,
            source: order.source,
            originalFilename: originalFilename,
            originalInvoiceId: order.invoiceId,
            customerName: order.customer,
            orderDate: order.orderDate,
            status: order.status,
          };

          // Insert Header
          const listId = await validationHelper.insertPickingHeader(connection, meta);

          // Insert Items
          await validationHelper.insertPickingItems(
            connection,
            listId,
            validItems,
            dbData.validProductMap
          );

          summary.processed++;
        }

        // Update Progress (Setiap 5 order agar tidak spam DB)
        processedCounter++;
        if (onProgress && processedCounter % 5 === 0) {
          // Kita asumsikan progress 50% untuk sync, 50% untuk insert (simplified)
          // Atau hitung kumulatif. Di sini kita hitung berdasarkan totalOrders.
          await onProgress(processedCounter, totalOrders);
        }
      }

      // 5. Finalisasi Transaksi
      if (dryRun) {
        log(`🛑 Dry Run Selesai. Melakukan ROLLBACK...`);
        await connection.rollback();
        summary.updatedCount = 0; // Reset count karena tidak ada yang tersimpan
      } else {
        await connection.commit();
        log(`✅ Transaksi COMMITTED.`);
        summary.updatedCount = summary.processed;
      }

      // Report 100%
      if (onProgress) await onProgress(totalOrders, totalOrders);
    } catch (innerError) {
      // Rollback jika ada error di tengah proses logic
      await connection.rollback();
      throw innerError;
    }
  } catch (error) {
    console.error("[PickingImport] Critical Error:", error);
    summary.errors.push(`System Error: ${error.message}`);
    // Jika error terjadi sebelum beginTransaction (misal fetchReferenceData gagal), tidak perlu rollback.
    // Jika sesudah, sudah dihandle oleh inner catch.
    throw error;
  }

  return summary;
};

// Wrapper untuk Controller (Legacy Support - Jika ada controller lama yang memanggil ini langsung)
export const performPickingValidation = async (payload) => {
  throw new Error("Deprecated: Use Job Queue Import instead.");
};
