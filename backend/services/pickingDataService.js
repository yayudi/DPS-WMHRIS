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
      return { locationId: currentLocId, isChanged: false };
    } else {
      fileLog(
        `⚠️ Lokasi lama (ID ${currentLocId}) stok tidak cukup/hilang. Sisa: ${currentStock}, Butuh: ${qtyNeeded}. Mencari ulang...`
      );
    }
  }

  // Skenario 2: Cari Lokasi Baru (JIT Lookup - Strict Display via Repo)
  const newBestLocId = await locationRepo.findBestStock(connection, productId, qtyNeeded);

  if (newBestLocId) {
    return { locationId: newBestLocId, isChanged: true };
  }

  return { locationId: null, isChanged: false };
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
 */
export const completePickingItemsService = async (payloadItems, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    if (!payloadItems?.length) throw new Error("Tidak ada item dipilih.");

    const itemIds = payloadItems.map((i) => i.id);
    const dbItems = await pickingRepo.getItemsByIds(connection, itemIds);

    const affectedListIds = new Set();
    let processedCount = 0;
    const failedItems = [];

    for (const itemData of dbItems) {
      let {
        id: itemId,
        product_id: prodId,
        quantity: qty,
        suggested_location_id: initialLocId,
      } = itemData;

      // ---------------------------------------------------------
      // 🔥 CORE LOGIC: SMART ALLOCATION (Re-check & Find)
      // ---------------------------------------------------------
      const { locationId, isChanged } = await ensureStockLocation(
        connection,
        prodId,
        qty,
        initialLocId
      );

      if (!locationId) {
        fileLog(`❌ Stok fisik HABIS untuk Item ID ${itemId} (Prod ${prodId}). Skip.`);
        failedItems.push(itemId);
        continue;
      }

      if (isChanged) {
        await pickingRepo.updateSuggestedLocation(connection, itemId, locationId);
        fileLog(`🔄 Re-route Item ID ${itemId} ke lokasi baru: ${locationId}`);
      }

      // ---------------------------------------------------------
      // EKSEKUSI TRANSAKSI STOK
      // ---------------------------------------------------------

      // Update Status Item (Sekarang pasti punya locationId yang valid & stok cukup)
      await pickingRepo.validateItem(connection, itemId, locationId);

      // Potong Stok Fisik
      await locationRepo.deductStock(connection, prodId, locationId, qty);

      // Catat Log
      await stockRepo.createLog(connection, {
        productId: prodId,
        quantity: qty,
        fromLocationId: locationId,
        type: "SALE",
        userId: userId,
        notes: `Sale Ref: Item #${itemId}`,
      });

      affectedListIds.add(itemData.picking_list_id);
      processedCount++;
    }

    // ---------------------------------------------------------
    // HEADER VALIDATION CHECK
    // ---------------------------------------------------------
    for (const listId of affectedListIds) {
      const remainingCount = await pickingRepo.countPendingItems(connection, listId);
      if (remainingCount === 0) {
        await pickingRepo.validateHeader(connection, listId);
      }
    }

    await connection.commit();

    if (processedCount === 0) {
      return {
        success: false,
        message: "Gagal memproses item. Stok fisik mungkin habis atau lokasi tidak ditemukan.",
      };
    }

    let message = `${processedCount} item berhasil diproses.`;
    if (failedItems.length > 0) {
      message += ` ${failedItems.length} item gagal diproses (stok habis).`;
    }

    return { success: true, message };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
