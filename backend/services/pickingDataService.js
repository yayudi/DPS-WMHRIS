// backend/services/pickingDataService.js
import db from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// REPOSITORIES
import * as pickingRepo from "../repositories/pickingRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

// --- LOGGER SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, "debug_picking.log");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const fileLog = (msg) => {
  const timestamp = new Date().toISOString().replace("T", " ").split(".")[0];
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
};
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
};

// ==============================================================================
// INTERNAL HELPERS
// ==============================================================================

/**
 * Helper Cerdas untuk Menentukan Lokasi Stok (Re-Check & Search)
 * Menggunakan Repository sepenuhnya.
 */
async function ensureStockLocation(connection, productId, qtyNeeded, currentLocId) {
  // Skenario 1: Cek Lokasi Eksisting (Re-validasi)
  if (currentLocId) {
    // Menggunakan locationRepo dengan locking (true)
    const currentStock = await locationRepo.getStockAtLocation(
      connection,
      productId,
      currentLocId,
      true
    );

    if (currentStock >= qtyNeeded) {
      return { locationId: currentLocId, isChanged: false, currentStock };
    } else {
      fileLog(
        `⚠️ Lokasi lama (ID ${currentLocId}) stok tidak cukup. Sisa: ${currentStock}, Butuh: ${qtyNeeded}. Mencari ulang...`
      );
    }
  }

  // Skenario 2: Cari Lokasi Baru (JIT Lookup - Strict Display via Repo)
  const newBestLocId = await locationRepo.findBestStock(connection, productId, qtyNeeded);

  if (newBestLocId) {
    // [SAFETY CHECK] Verifikasi stok di lokasi baru
    // findBestStock mungkin mengembalikan lokasi terbaik yang ada, tapi belum tentu cukup (jika semua lokasi kurang)
    const newStock = await locationRepo.getStockAtLocation(
      connection,
      productId,
      newBestLocId,
      true
    );

    if (newStock >= qtyNeeded) {
      return { locationId: newBestLocId, isChanged: true, currentStock: newStock };
    }

    fileLog(
      `⚠️ Lokasi alternatif (ID ${newBestLocId}) juga tidak cukup. Sisa: ${newStock}, Butuh: ${qtyNeeded}.`
    );
  }

  return { locationId: null, isChanged: false, currentStock: 0 };
}

// ==============================================================================
// READ OPERATIONS
// ==============================================================================

export const getPendingPickingItemsService = async () => {
  const connection = await db.getConnection();
  try {
    return await pickingRepo.getPendingItems(connection);
  } finally {
    connection.release();
  }
};

export const getHistoryPickingItemsService = async (limit = 1000) => {
  const connection = await db.getConnection();
  try {
    return await pickingRepo.getHistoryItems(connection, limit);
  } finally {
    connection.release();
  }
};

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

export const cancelPickingListService = async (pickingListId, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Cek & Kembalikan Stok untuk item yang sudah divalidasi
    const [itemsToRestock] = await connection.query(
      `SELECT product_id, quantity, confirmed_location_id
        FROM picking_list_items
        WHERE picking_list_id = ? AND status = 'VALIDATED' AND confirmed_location_id IS NOT NULL`,
      [pickingListId]
    );

    if (itemsToRestock.length > 0) {
      logger.info(`[CANCEL] Mengembalikan stok untuk ${itemsToRestock.length} item.`);
      for (const item of itemsToRestock) {
        await locationRepo.incrementStock(
          connection,
          item.product_id,
          item.confirmed_location_id,
          item.quantity
        );

        await stockRepo.createLog(connection, {
          productId: item.product_id,
          quantity: item.quantity,
          toLocationId: item.confirmed_location_id,
          type: "CANCEL_RESTOCK",
          userId: userId,
          notes: `Manual Cancel Picking List #${pickingListId}`,
        });
      }
    }

    const [res] = await pickingRepo.cancelHeader(connection, pickingListId);

    if (res.affectedRows === 0) {
      throw new Error("Picking List tidak ditemukan atau sudah dibatalkan.");
    }

    await pickingRepo.cancelItemsByListId(connection, pickingListId);

    await connection.commit();
    return { success: true, message: "Picking List dibatalkan." };
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
    if (!payloadItems?.length) throw new Error("Tidak ada item dipilih.");

    // --- SAFETY CHECK START (REAL-TIME INTERRUPTION) ---
    // Pastikan order belum direvisi (menjadi _REV_) saat picker sedang bekerja
    const listIds = [...new Set(payloadItems.map((i) => i.picking_list_id))];

    for (const listId of listIds) {
      const header = await pickingRepo.getHeaderById(connection, listId);

      if (!header) {
        throw new Error(`Data Picking List #${listId} tidak ditemukan. Mungkin sudah dihapus.`);
      }

      // Cek apakah status Header sudah "Obsolete" (ditandai dengan _REV_)
      if (header.original_invoice_id && header.original_invoice_id.includes("_REV_")) {
        throw new Error(
          `PERHATIAN: Order ${header.original_invoice_id} telah direvisi oleh Admin! ` +
            `Data Anda usang. Mohon refresh halaman dan kerjakan revisi terbaru.`
        );
      }

      // Cek apakah status sudah Cancelled
      if (header.status === "CANCELLED") {
        throw new Error(`Order #${listId} telah dibatalkan. Tidak dapat diproses.`);
      }
    }
    // --- SAFETY CHECK END ---

    const itemIds = payloadItems.map((i) => i.id);
    const dbItems = await pickingRepo.getItemsByIds(connection, itemIds);

    // --- FASE 1: STRICT VALIDATION (SATPAM) ---
    const validationErrors = [];
    const executionPlan = []; // Menyimpan data valid untuk eksekusi nanti

    for (const itemData of dbItems) {
      const {
        id: itemId,
        product_id: prodId,
        quantity: qty,
        suggested_location_id: initialLocId,
        picking_list_id,
        original_sku: sku, // Pastikan repo mengembalikan ini atau ambil ulang
      } = itemData;

      // Cek ketersediaan stok & lokasi
      const { locationId, isChanged, currentStock } = await ensureStockLocation(
        connection,
        prodId,
        qty,
        initialLocId
      );

      if (!locationId) {
        // Gagal: Stok tidak ditemukan sama sekali
        validationErrors.push(
          `Item ID ${itemId} (Prod ${prodId}): Stok habis/tidak cukup di lokasi manapun.`
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
      const errorMsg = `Validasi Gagal! ${
        validationErrors.length
      } item bermasalah:\n- ${validationErrors.join("\n- ")}`;
      throw new Error(errorMsg);
    }

    // --- FASE 2: EKSEKUSI AMAN ---
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
      await stockRepo.createLog(connection, {
        productId: prodId,
        quantity: qty,
        fromLocationId: finalLocationId,
        type: "SALE",
        userId: userId,
        notes: `Sale Ref: Item #${itemId}`,
      });

      affectedListIds.add(picking_list_id);
      processedCount++;
    }

    // --- FASE 3: UPDATE HEADER ---
    for (const listId of affectedListIds) {
      const remainingCount = await pickingRepo.countPendingItems(connection, listId);
      if (remainingCount === 0) {
        await pickingRepo.validateHeader(connection, listId);
      }
    }

    await connection.commit();

    return {
      success: true,
      message: `Sukses! ${processedCount} item berhasil diproses dan stok telah dipotong.`,
    };
  } catch (error) {
    await connection.rollback();
    console.error("[PickingService] Complete Transaction Failed:", error);
    throw error;
  } finally {
    connection.release();
  }
};
