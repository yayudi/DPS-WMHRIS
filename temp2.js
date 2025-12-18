import db from "../config/db.js";
import * as validationHelper from "./helpers/pickingValidationHelper.js";

// Helper log sederhana dengan Timestamp
const log = (msg) => {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[SYNC][${time}] ${msg}`);
};

/**
 * SERVICE: Process Import Data (Orchestrator Core)
 * Menjalankan logika validasi database dan insert transaksi.
 */
export const processImportData = async (groupedOrders, userId) => {
  const summary = { processed: 0, errors: [] };
  const ordersToProcess = Array.from(groupedOrders.values());

  if (ordersToProcess.length === 0) return summary;

  const connection = await db.getConnection();

  try {
    // Kumpulkan Semua SKU
    const allSkus = new Set();
    ordersToProcess.forEach((order) => {
      order.items.forEach((item) => allSkus.add(item.sku));
    });

    log(`🚀 Memulai validasi ${ordersToProcess.length} order dengan ${allSkus.size} SKU unik...`);

    // Fetch Data (Strict Display)
    const dbData = await validationHelper.fetchReferenceData(connection, Array.from(allSkus));

    // Handle Existing (Update/Cancel)
    const newOrders = await validationHelper.handleExistingInvoices(connection, ordersToProcess);

    // Kalkulasi Validasi
    let allValidItems = [];

    for (const order of newOrders) {
      const { validItems, invalidSkus } = validationHelper.calculateValidations(
        order.items,
        dbData
      );

      if (invalidSkus.length > 0) {
        invalidSkus.forEach((err) => {
          summary.errors.push({ invoice: order.invoiceId, error: err });
        });
        continue;
      }

      if (validItems.length > 0) {
        validItems.forEach((item) => {
          item.meta = {
            userId,
            source: order.source,
            originalFilename: order.originalFilename,
            originalInvoiceId: order.invoiceId,
            customerName: order.customer,
            orderDate: order.orderDate,
            status: order.status,
          };
        });
        allValidItems.push(...validItems);
      }
    }

    // Insert Batch
    const validGroups = new Map();
    allValidItems.forEach((item) => {
      const inv = item.invoiceNos[0];
      if (!validGroups.has(inv)) validGroups.set(inv, []);
      validGroups.get(inv).push(item);
    });

    for (const [invoiceId, items] of validGroups) {
      await connection.beginTransaction();
      try {
        const firstItem = items[0];
        const pickingListId = await validationHelper.insertPickingHeader(
          connection,
          firstItem.meta
        );

        await validationHelper.insertPickingItems(
          connection,
          pickingListId,
          items,
          dbData.validProductMap
        );

        await connection.commit();
        summary.processed++;
      } catch (err) {
        await connection.rollback();
        console.error(`Gagal insert invoice ${invoiceId}:`, err);
        summary.errors.push({ invoice: invoiceId, error: "Database Insert Error: " + err.message });
      }
    }
  } catch (error) {
    console.error("Critical Import Error:", error);
    throw error;
  } finally {
    connection.release();
  }

  log(`🏁 Selesai. Processed: ${summary.processed}, Errors: ${summary.errors.length}`);
  return summary;
};

// Wrapper untuk ImportQueue Worker
export const syncOrdersToDB = async (connection, ordersMap, userId, originalFilename) => {
  for (const order of ordersMap.values()) {
    order.originalFilename = originalFilename;
  }
  return await processImportData(ordersMap, userId);
};

// [MOVED HERE] Wrapper untuk Controller
// Mengubah data flat dari controller menjadi struktur Map yang dibutuhkan processImportData
export const performPickingValidation = async (payload) => {
  const { items, userId, source, originalFilename } = payload;

  const groupedOrders = new Map();
  items.forEach((item) => {
    if (!item.invoiceId) return;
    if (!groupedOrders.has(item.invoiceId)) {
      groupedOrders.set(item.invoiceId, {
        invoiceId: item.invoiceId,
        customer: item.customer,
        orderDate: item.orderDate,
        status: item.status,
        source: source,
        items: [],
        originalFilename: originalFilename,
      });
    }
    groupedOrders.get(item.invoiceId).items.push({
      sku: item.sku,
      qty: item.qty,
      returnedQty: item.returnedQty || 0,
    });
  });

  return await processImportData(groupedOrders, userId);
};
