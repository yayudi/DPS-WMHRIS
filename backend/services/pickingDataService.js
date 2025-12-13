// backend/services/pickingDataService.js
import db from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { processImportData } from "./pickingImportService.js";

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
  console.log(msg);
};
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
};

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
    // [SAFETY] Cek apakah ada item yang sudah VALIDATED (Stok sudah terpotong)
    // Jika ada, kita harus kembalikan stoknya sebelum membatalkan order.
    // (Menggunakan query manual untuk SELECT karena ini logic spesifik service ini)
    const [itemsToRestock] = await connection.query(
      `SELECT product_id, quantity, confirmed_location_id
       FROM picking_list_items
       WHERE picking_list_id = ? AND status = 'VALIDATED' AND confirmed_location_id IS NOT NULL`,
      [pickingListId]
    );

    if (itemsToRestock.length > 0) {
      logger.info(
        `[CANCEL] Mengembalikan stok untuk ${itemsToRestock.length} item yang sudah dipicking.`
      );
      for (const item of itemsToRestock) {
        // Increment Stock via Repo
        await locationRepo.incrementStock(
          connection,
          item.product_id,
          item.confirmed_location_id,
          item.quantity
        );

        // Log Movement via Repo
        await stockRepo.createLog(connection, {
          productId: item.product_id,
          quantity: item.quantity,
          toLocationId: item.confirmed_location_id,
          type: "CANCEL_RESTOCK", // Manual Cancel Restock
          userId: userId,
          notes: `Manual Cancel Picking List #${pickingListId}`,
        });
      }
    }

    // 1. Update Header
    const [res] = await pickingRepo.cancelHeader(connection, pickingListId);

    if (res.affectedRows === 0) {
      throw new Error("Picking List tidak ditemukan atau sudah diproses.");
    }

    // 2. Update Items
    await pickingRepo.cancelItemsByListId(connection, pickingListId);

    await connection.commit();
    return { success: true, message: "Picking List dibatalkan (Stok dikembalikan jika ada)." };
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

    // REPO: Ambil data item
    const dbItems = await pickingRepo.getItemsByIds(connection, itemIds);

    const affectedListIds = new Set();
    let processedCount = 0;

    for (const itemData of dbItems) {
      let {
        id: itemId,
        product_id: prodId,
        quantity: qty,
        suggested_location_id: locId,
      } = itemData;

      // ---------------------------------------------------------
      // 🔥 JIT LOOKUP: Re-evaluasi lokasi via Location Repository
      // ---------------------------------------------------------
      if (!locId) {
        fileLog(`🔍 Re-evaluasi lokasi untuk Item ID ${itemId}...`);

        // REPO: Cari lokasi terbaik
        locId = await locationRepo.findBestStock(connection, prodId, qty);

        if (locId) {
          // REPO: Simpan lokasi baru ke history item
          await pickingRepo.updateSuggestedLocation(connection, itemId, locId);
          fileLog(`✅ Lokasi ditemukan: ID ${locId}`);
        } else {
          fileLog(`❌ Stok tetap tidak ditemukan untuk Item ID ${itemId}. Skip.`);
          continue;
        }
      }

      // REPO: Update Status Item
      await pickingRepo.validateItem(connection, itemId, locId);

      // REPO: Potong Stok Fisik
      await locationRepo.deductStock(connection, prodId, locId, qty);

      // REPO: Catat Log Pergerakan
      await stockRepo.createLog(connection, {
        productId: prodId,
        quantity: qty,
        fromLocationId: locId, // Barang keluar dari lokasi ini
        type: "SALE",
        userId: userId,
        notes: `Sale Ref: Item #${itemId}`,
      });

      affectedListIds.add(itemData.picking_list_id);
      processedCount++;
    }

    // Cek Status Header
    for (const listId of affectedListIds) {
      // REPO: Hitung sisa item pending
      const remainingCount = await pickingRepo.countPendingItems(connection, listId);

      if (remainingCount === 0) {
        // REPO: Update Header jadi VALIDATED
        await pickingRepo.validateHeader(connection, listId);
      }
    }

    await connection.commit();

    if (processedCount === 0) {
      return { success: false, message: "Gagal memproses. Stok fisik mungkin kosong." };
    }

    return {
      success: true,
      message: `${processedCount} item berhasil diproses.`,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ==============================================================================
// IMPORT ORCHESTRATOR
// ==============================================================================

export const performPickingValidation = async (payload) => {
  const { items, userId, source } = payload;
  logger.info(`[ORCHESTRATOR] Menerima ${items.length} baris data dari ${source}.`);

  // Grouping Data per Invoice menggunakan Map
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
        originalFilename: payload.originalFilename, // Pass filename ke group
      });
    }
    // [FIX UTAMA DISINI]
    // Pastikan returnedQty diteruskan ke service, bukan hilang.
    groupedOrders.get(item.invoiceId).items.push({
      sku: item.sku,
      qty: item.qty,
      returnedQty: item.returnedQty || 0, // <-- DATA KRUSIAL UNTUK PARTIAL RETURN
    });
  });

  // Panggil Service Import (Smart Versioning & Split Logic ada di dalam sini)
  const summary = await processImportData(groupedOrders, userId);

  return {
    processedInvoices: summary.processed,
    validItems: [],
    invalidSkus: summary.errors.map((e) => `[${e.invoice}] ${e.error}`),
  };
};
