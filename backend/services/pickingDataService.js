// backend/services/pickingDataService.js
import db from "../config/db.js";
import Logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";
import * as pickingRepo from "../repositories/pickingRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";
import { emitSharedTaskSignal } from "./firebaseSignalService.js";
import { restockValidatedItems } from "./helpers/pickingValidationHelper.js";

const fileLog = (msg) => {
  Logger.warn(msg, "PICKING_DATA_SERVICE");
};

const logger = {
  info: (msg) => Logger.info(msg, "PICKING_DATA_SERVICE"),
  error: (msg, err) => Logger.error(msg, err, "PICKING_DATA_SERVICE"),
};

// ==============================================================================
// INTERNAL HELPERS
// ==============================================================================

/**
 * Helper Cerdas untuk Menentukan Lokasi Stok (Re-Check & Search)
 * Menggunakan Repository sepenuhnya.
 */
async function ensureStockLocation(
  connection,
  productId,
  qtyNeeded,
  currentLocId,
  locationPurpose = "DISPLAY",
) {
  // Skenario 1: Cek Lokasi Eksisting (Re-validasi)
  if (currentLocId) {
    // Menggunakan locationRepo dengan locking (true)
    const currentStock = await locationRepo.getStockAtLocation(
      connection,
      productId,
      currentLocId,
      true,
    );

    if (currentStock >= qtyNeeded) {
      return { locationId: currentLocId, isChanged: false, currentStock };
    } else {
      fileLog(
        `⚠️ Lokasi lama (ID ${currentLocId}) stok tidak cukup. Sisa: ${currentStock}, Butuh: ${qtyNeeded}. Mencari ulang...`,
      );
    }
  }

  // Skenario 2: Cari Lokasi Baru (JIT Lookup - Strict Display via Repo)
  const newBestLocId = await locationRepo.findBestStock(
    connection,
    productId,
    qtyNeeded,
    locationPurpose,
  );

  if (newBestLocId) {
    // [SAFETY CHECK] Verifikasi stok di lokasi baru
    // findBestStock mungkin mengembalikan lokasi terbaik yang ada, tapi belum tentu cukup (jika semua lokasi kurang)
    const newStock = await locationRepo.getStockAtLocation(
      connection,
      productId,
      newBestLocId,
      true,
    );

    if (newStock >= qtyNeeded) {
      return { locationId: newBestLocId, isChanged: true, currentStock: newStock };
    }

    fileLog(
      `⚠️ Lokasi alternatif (ID ${newBestLocId}) juga tidak cukup. Sisa: ${newStock}, Butuh: ${qtyNeeded}.`,
    );
  }

  return { locationId: null, isChanged: false, currentStock: 0 };
}

// ==============================================================================
// READ OPERATIONS
// ==============================================================================

/**
 * @returns {Promise<any>}
 */
export const getPendingPickingItemsService = async () => {
  const connection = await db.getConnection();
  try {
    return await pickingRepo.getPendingItems(connection);
  } finally {
    connection.release();
  }
};

/**
 * @param {number} limit
 * @returns {Promise<any>}
 */
export const getHistoryPickingItemsService = async (limit = 1000) => {
  const connection = await db.getConnection();
  try {
    return await pickingRepo.getHistoryItems(connection, limit);
  } finally {
    connection.release();
  }
};

/**
 * @param {number|string} pickingListId
 * @returns {Promise<any>}
 */
export const fetchPickingListDetails = async (pickingListId) => {
  const connection = await db.getConnection();
  try {
    return await pickingRepo.getListDetails(connection, pickingListId);
  } finally {
    connection.release();
  }
};

// ==============================================================================
// WRITE OPERATIONS (TRANSACTIONS)
// ==============================================================================

/**
 * @param {number|string} pickingListId
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const voidPickingListService = async (pickingListId, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Cek & Kembalikan Stok untuk item yang sudah divalidasi
    const [itemsToRestock] = await connection.query(
      `SELECT product_id, quantity, confirmed_location_id
        FROM picking_list_items
        WHERE picking_list_id = ? AND status = 'VALIDATED' AND confirmed_location_id IS NOT NULL`,
      [pickingListId],
    );

    if (itemsToRestock.length > 0) {
      logger.info(`[VOID] Mengembalikan stok untuk ${itemsToRestock.length} item.`);
      for (const item of itemsToRestock) {
        await locationRepo.incrementStock(
          connection,
          item.product_id,
          item.confirmed_location_id,
          item.quantity,
        );

        await stockRepo.createLog(connection, {
          productId: item.product_id,
          quantity: item.quantity,
          toLocationId: item.confirmed_location_id,
          type: "VOID_RESTOCK",
          userId: userId,
          notes: `Manual Void Picking List #${pickingListId}`,
        });
      }
    }

    const [res] = await pickingRepo.voidHeader(connection, pickingListId);

    if (res.affectedRows === 0) {
      throw new AppError(
        "Picking List tidak ditemukan atau sudah dibatalkan.",
        400,
        "INVALID_STATUS",
      );
    }

    await pickingRepo.voidItemsByListId(connection, pickingListId);

    await connection.commit();

    emitSharedTaskSignal("PICKING_LIST", "REFRESH_PICKING").catch((e) =>
      Logger.error("Signal Error", e, "PICKING_DATA_SERVICE"),
    );
    emitSharedTaskSignal("WMS_DASHBOARD", "REFRESH_STOCK").catch((e) =>
      Logger.error("Signal Error", e, "PICKING_DATA_SERVICE"),
    );

    return { success: true, message: "Picking List dibatalkan." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Targeted Refresh: Cek ulang stok khusus untuk satu Picking List (Manual Trigger)
 */
export const retryBackordersService = async (pickingListId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [unfulfillableRows] = await connection.query(
      `
      SELECT
        pli.id,
        pli.product_id,
        pli.quantity,
        pli.original_sku,
        pl.location_purpose
      FROM picking_list_items pli
      JOIN picking_lists pl ON pli.picking_list_id = pl.id
      WHERE pli.picking_list_id = ?
        AND (pli.status = 'BACKORDER' OR (pli.status = 'PENDING' AND pli.suggested_location_id IS NULL))
        AND pl.status IN ('PENDING', 'VALIDATED')
        AND pl.is_active = 1
    `,
      [pickingListId],
    );

    if (unfulfillableRows.length === 0) {
      await connection.rollback();
      return { success: true, message: "Tidak ada item backorder untuk pesanan ini." };
    }

    let recoveredCount = 0;

    for (const item of unfulfillableRows) {
      const bestLocation = await locationRepo.findBestStock(
        connection,
        item.product_id,
        item.quantity,
        item.location_purpose || "DISPLAY",
      );

      if (bestLocation) {
        await pickingRepo.updateSuggestedLocation(connection, item.id, bestLocation.location_id);
        await pickingRepo.updateItemStatus(connection, item.id, "PENDING");
        recoveredCount++;
      }
    }

    await connection.commit();

    if (recoveredCount > 0) {
      emitSharedTaskSignal("PICKING_LIST", "REFRESH_PICKING").catch((e) =>
        Logger.error("Signal Error", e, "PICKING_DATA_SERVICE"),
      );
      return {
        success: true,
        message: `Berhasil mendapatkan stok untuk ${recoveredCount} dari ${unfulfillableRows.length} item backorder.`,
      };
    } else {
      return {
        success: true,
        message: `Stok masih belum tersedia untuk ${unfulfillableRows.length} item.`,
      };
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Batch Targeted Refresh: Cek ulang stok untuk beberapa Picking List sekaligus
 */
export const retryBackordersBatchService = async (pickingListIds) => {
  if (!pickingListIds || pickingListIds.length === 0) {
    return { success: true, message: "Tidak ada picking list yang dipilih." };
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const placeholders = pickingListIds.map(() => "?").join(",");
    // Fetch ALL PENDING & BACKORDER items to ensure no "Ghost Stock" is hiding
    const [rows] = await connection.query(
      `
      SELECT
        pli.id,
        pli.product_id,
        pli.quantity,
        pli.original_sku,
        pli.status,
        pli.suggested_location_id,
        pl.location_purpose
      FROM picking_list_items pli
      JOIN picking_lists pl ON pli.picking_list_id = pl.id
      WHERE pli.picking_list_id IN (${placeholders})
        AND pli.status IN ('PENDING', 'BACKORDER')
        AND pl.status IN ('PENDING', 'VALIDATED')
        AND pl.is_active = 1
    `,
      pickingListIds,
    );

    if (rows.length === 0) {
      await connection.rollback();
      return {
        success: true,
        message: "Tidak ada item pending/backorder pada pesanan yang dipilih.",
      };
    }

    let recoveredCount = 0;
    let downgradedCount = 0;

    for (const item of rows) {
      const { locationId, isChanged } = await ensureStockLocation(
        connection,
        item.product_id,
        item.quantity,
        item.suggested_location_id,
        item.location_purpose || "DISPLAY",
      );

      if (locationId) {
        // Stock is sufficient!
        if (isChanged || item.status === "BACKORDER") {
          // It found a new location, OR it was BACKORDER and now we revived it
          await pickingRepo.updateSuggestedLocation(connection, item.id, locationId);
          if (item.status === "BACKORDER") {
            await pickingRepo.updateItemStatus(connection, item.id, "PENDING");
          }
          recoveredCount++;
        }
      } else {
        // Stock is insufficient (0, or less than needed)
        if (item.status !== "BACKORDER" || item.suggested_location_id !== null) {
          // Downgrade if it wasn't already BACKORDER with null location
          await pickingRepo.updateSuggestedLocation(connection, item.id, null);
          await pickingRepo.updateItemStatus(connection, item.id, "BACKORDER");
          downgradedCount++;
        }
      }
    }

    await connection.commit();

    if (recoveredCount > 0 || downgradedCount > 0) {
      emitSharedTaskSignal("PICKING_LIST", "REFRESH_PICKING").catch((e) =>
        Logger.error("Signal Error", e, "PICKING_DATA_SERVICE"),
      );
    }

    const msg = [];
    if (recoveredCount > 0) msg.push(`Berhasil memulihkan/memindahkan ${recoveredCount} item.`);
    if (downgradedCount > 0)
      msg.push(`${downgradedCount} item kehabisan stok & menjadi BACKORDER.`);

    if (msg.length === 0) {
      return {
        success: true,
        message: `Stok untuk ${rows.length} item telah dievaluasi dan tidak ada perubahan.`,
      };
    }

    return { success: true, message: msg.join(" ") };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * SERVICE UTAMA: Menyelesaikan Item Picking
 * FITUR SAFETY CHECK: Memastikan picking list masih aktif & valid sebelum update.
 */
export const completePickingItemsService = async (payloadItems, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    if (!payloadItems?.length)
      throw new AppError("Tidak ada item dipilih.", 400, "VALIDATION_ERROR");

    // --- SAFETY CHECK START (REAL-TIME INTERRUPTION) ---
    // Pastikan order belum direvisi (menjadi _REV_) saat picker sedang bekerja
    const listIds = [...new Set(payloadItems.map((i) => i.picking_list_id))];
    const invoiceMap = new Map();
    const purposeMap = new Map();
    const validationErrors = []; // Kumpulkan semua error di sini
    const invalidListIds = new Set(); // Simpan listId yang gagal agar tidak dilanjut ke Fase 1

    for (const listId of listIds) {
      const header = await pickingRepo.getHeaderById(connection, listId);

      if (!header) {
        throw new AppError(
          `Data Picking List #${listId} tidak ditemukan. Mungkin sudah dihapus.`,
          404,
          "NOT_FOUND",
        );
      }

      // Cek apakah status Header sudah "Obsolete" (ditandai dengan _REV_)
      if (header.original_invoice_id && header.original_invoice_id.includes("_REV_")) {
        throw new AppError(
          `PERHATIAN: Order ${header.original_invoice_id} telah direvisi oleh Admin! ` +
            `Data Anda usang. Mohon refresh halaman dan kerjakan revisi terbaru.`,
          409,
          "CONFLICT",
        );
      }

      // Cek apakah status sudah Void
      if (header.status === "VOID" || header.status === "CANCELLED" || header.status === "CANCEL") {
        throw new AppError(
          `Order #${listId} telah divoid (dibatalkan). Tidak dapat diproses.`,
          400,
          "VOID_ORDER",
        );
      }

      // --- ANTI PARTIAL PROCESS CHECK ---
      // Blokir jika ada item yang tidak bisa dipenuhi (habis / tidak ada lokasi)
      const [unfulfillable] = await connection.query(
        `SELECT original_sku FROM picking_list_items
          WHERE picking_list_id = ?
            AND (status = 'BACKORDER' OR (status = 'PENDING' AND suggested_location_id IS NULL))`,
        [listId],
      );

      if (unfulfillable.length > 0) {
        invalidListIds.add(listId);
        for (const u of unfulfillable) {
          validationErrors.push(
            `INV [${header.original_invoice_id}] - SKU ${u.original_sku || "UNKNOWN"}: Stok habis (Anti-Parsial).`,
          );
        }
      }

      invoiceMap.set(listId, header.original_invoice_id);
      purposeMap.set(listId, header.location_purpose || "DISPLAY");
    }
    // --- SAFETY CHECK END ---

    const itemIds = payloadItems.map((i) => i.id);
    const dbItems = await pickingRepo.getItemsByIds(connection, itemIds);

    // --- STRICT VALIDATION (SATPAM) ---
    const executionPlan = []; // Menyimpan data valid untuk eksekusi nanti

    // [OPTIMIZATION] Pre-fetch and lock all stock locations for the required products
    const uniqueProductIds = [...new Set(dbItems.map((item) => item.product_id))];
    const stockMap = new Map();
    if (uniqueProductIds.length > 0) {
      uniqueProductIds.sort((a, b) => a - b); // Prevent deadlocks
      const [stocks] = await connection.query(
        `SELECT sl.product_id, sl.location_id, sl.quantity, l.purpose
         FROM stock_locations sl
         JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id IN (?)
         FOR UPDATE`,
        [uniqueProductIds],
      );
      for (const s of stocks) {
        if (!stockMap.has(s.product_id)) stockMap.set(s.product_id, []);
        // Convert quantity to number for safe math
        s.quantity = Number(s.quantity);
        stockMap.get(s.product_id).push(s);
      }
    }

    for (const itemData of dbItems) {
      const {
        product_id: prodId,
        quantity: qty,
        suggested_location_id: initialLocId,
        picking_list_id,
        original_sku: sku,
      } = itemData;

      // Skip item jika invoice-nya sudah ditolak di tahap Anti-Parsial
      if (invalidListIds.has(picking_list_id)) continue;

      const locationPurpose = purposeMap.get(picking_list_id) || "DISPLAY";

      // Cek apakah item sudah diproses
      if (itemData.status !== "PENDING" && itemData.status !== "BACKORDER") {
        const invRef = invoiceMap.get(picking_list_id) || "UNKNOWN-INV";
        validationErrors.push(
          `INV [${invRef}] - SKU ${sku || "Prod ID " + prodId}: Item sudah diproses (Status: ${itemData.status}).`,
        );
        continue;
      }

      // [OPTIMIZATION] Cek ketersediaan stok & lokasi secara in-memory (O(1))
      let locationId = null;
      let isChanged = false;
      const availableStocks = stockMap.get(prodId) || [];

      const currentLocStock = availableStocks.find((s) => s.location_id === initialLocId);

      if (currentLocStock && currentLocStock.quantity >= qty) {
        locationId = initialLocId;
        currentLocStock.quantity -= qty; // Reserve stock in memory
      } else {
        // Cari lokasi alternatif dengan purpose yang sesuai
        const validStocks = availableStocks.filter(
          (s) => s.purpose === locationPurpose && s.quantity >= qty,
        );

        if (validStocks.length > 0) {
          // Sort by priority logic from findBestStock
          validStocks.sort((a, b) => {
            const getPriority = (locId) => {
              if (locId === 2 || locId === 3) return 1;
              if (locId === 4 || locId === 5) return 2;
              return 3;
            };
            const pA = getPriority(a.location_id);
            const pB = getPriority(b.location_id);
            if (pA !== pB) return pA - pB;
            return b.quantity - a.quantity;
          });

          locationId = validStocks[0].location_id;
          isChanged = true;
          validStocks[0].quantity -= qty; // Reserve stock in memory
        }
      }

      if (!locationId) {
        // Gagal: Stok tidak ditemukan sama sekali
        const invRef = invoiceMap.get(picking_list_id) || "UNKNOWN-INV";
        validationErrors.push(
          `INV [${invRef}] - SKU ${sku || "Prod ID " + prodId}: Stok habis/tidak cukup di lokasi manapun.`,
        );
      } else {
        // Sukses: Simpan rencana eksekusi
        executionPlan.push({
          ...itemData,
          finalLocationId: locationId,
          isLocationChanged: isChanged,
        });
      }
    }

    // [BLOCKER] Jika ada error, batalkan SEMUA.
    if (validationErrors.length > 0) {
      const errorMsg = `Sebagian pesanan gagal diproses karena masalah ketersediaan stok atau status.`;
      const error = new AppError(errorMsg, 400, "VALIDATION_ERROR");
      error.details = validationErrors;
      throw error;
    }

    // --- EKSEKUSI AMAN ---
    const affectedListIds = new Set();
    let processedCount = 0;

    for (const plan of executionPlan) {
      const {
        id: itemId,
        product_id: prodId,
        quantity: qty,
        finalLocationId,
        isLocationChanged,
        picking_list_id,
      } = plan;

      // Update Lokasi jika berubah
      if (isLocationChanged) {
        await pickingRepo.updateSuggestedLocation(connection, itemId, finalLocationId);
        fileLog(`🔄 Re-route Item ID ${itemId} ke lokasi baru: ${finalLocationId}`);
      }

      // 2. Update Status Item -> VALIDATED
      await pickingRepo.validateItem(connection, itemId, finalLocationId);

      // 3. Potong Stok Fisik
      await locationRepo.deductStock(connection, prodId, finalLocationId, qty);

      // 4. Catat Log
      const invoiceRef = invoiceMap.get(picking_list_id) || `List #${picking_list_id}`;
      await stockRepo.createLog(connection, {
        productId: prodId,
        quantity: qty,
        fromLocationId: finalLocationId,
        type: "SALE",
        userId: userId,
        notes: `Sale Ref: ${invoiceRef} (Item #${itemId})`,
      });

      affectedListIds.add(picking_list_id);
      processedCount++;
    }

    // --- UPDATE HEADER ---
    for (const listId of affectedListIds) {
      const remainingCount = await pickingRepo.countPendingItems(connection, listId);
      if (remainingCount === 0) {
        await pickingRepo.validateHeader(connection, listId);
      }
    }

    await connection.commit();

    emitSharedTaskSignal("PICKING_LIST", "REFRESH_PICKING").catch((e) =>
      Logger.error("Signal Error", e, "PICKING_DATA_SERVICE"),
    );
    emitSharedTaskSignal("WMS_DASHBOARD", "REFRESH_STOCK").catch((e) =>
      Logger.error("Signal Error", e, "PICKING_DATA_SERVICE"),
    );

    return {
      success: true,
      message: `Sukses! ${processedCount} item berhasil diproses dan stok telah dipotong.`,
    };
  } catch (error) {
    await connection.rollback();
    Logger.error("Complete Transaction Failed", error, "PICKING_DATA_SERVICE");
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Update produk dan kuantitas item dalam sebuah Picking List secara manual.
 * @param {number|string} pickingListId
 * @param {Array<{ productId: number, sku: string, quantity: number, price?: number }>} newItems
 * @param {number|string} userId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const updatePickingListItemsService = async (pickingListId, newItems, userId) => {
  if (!Array.isArray(newItems) || newItems.length === 0) {
    throw new AppError("Pesanan harus memiliki minimal 1 produk.", 400);
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const header = await pickingRepo.getHeaderById(connection, pickingListId);
    if (!header || !header.is_active) {
      throw new AppError("Picking list tidak ditemukan atau sudah tidak aktif.", 404);
    }
    if (header.status !== "PENDING" && header.status !== "VALIDATED") {
      throw new AppError(`Pesanan dengan status ${header.status} tidak dapat diubah.`, 400);
    }

    // Kembalikan alokasi jika sempat ada item VALIDATED
    await restockValidatedItems(connection, pickingListId, userId, "Edit Item Pesanan");

    // Hapus item lama
    await connection.query("DELETE FROM picking_list_items WHERE picking_list_id = ?", [pickingListId]);

    // Evaluasi lokasi stok untuk item baru
    const rowsToInsert = [];
    for (const item of newItems) {
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        throw new AppError(`Kuantitas untuk SKU ${item.sku} harus lebih besar dari 0.`, 400);
      }

      const { locationId } = await ensureStockLocation(
        connection,
        item.productId,
        qty,
        null,
        header.location_purpose || "DISPLAY"
      );

      const status = locationId ? "PENDING" : "BACKORDER";
      const price = item.price || 0;
      rowsToInsert.push([pickingListId, item.productId, item.sku, price, qty, status, locationId]);
    }

    await pickingRepo.createItemsBulk(connection, rowsToInsert);

    // Reset header ke PENDING
    await pickingRepo.updateHeaderStatus(connection, pickingListId, "PENDING", 1);

    await connection.commit();

    emitSharedTaskSignal("PICKING_LIST", "REFRESH_PICKING").catch((e) =>
      Logger.error("Signal Error", e, "PICKING_DATA_SERVICE")
    );
    emitSharedTaskSignal("WMS_DASHBOARD", "REFRESH_STOCK").catch((e) =>
      Logger.error("Signal Error", e, "PICKING_DATA_SERVICE")
    );

    return {
      success: true,
      message: `Berhasil memperbarui item pesanan #${header.original_invoice_id || pickingListId}.`,
    };
  } catch (error) {
    await connection.rollback();
    Logger.error("Update Picking Items Failed", error, "PICKING_DATA_SERVICE");
    throw error;
  } finally {
    connection.release();
  }
};

