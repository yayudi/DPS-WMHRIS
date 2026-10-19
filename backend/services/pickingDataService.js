// backend/services/pickingDataService.js
import { withTransaction, withConnection } from "../utils/dbUtils.js";
import Logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";
import * as pickingRepo from "../repositories/pickingRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";
import { signals } from "./firebaseSignalService.js";
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
  return withConnection(async (connection) => {
    return pickingRepo.getPendingItems(connection);
  });
};

/**
 * @param {number} limit
 * @returns {Promise<any>}
 */
export const getHistoryPickingItemsService = async (limit = 1000) => {
  return withConnection(async (connection) => {
    return pickingRepo.getHistoryItems(connection, limit);
  });
};

/**
 * @param {number|string} pickingListId
 * @returns {Promise<any>}
 */
export const fetchPickingListDetails = async (pickingListId) => {
  return withConnection(async (connection) => {
    return pickingRepo.getListDetails(connection, pickingListId);
  });
};

/**
 * Service untuk mengambil ringkasan kebutuhan stok picking list aktif (PENDING & BACKORDER).
 * Mengagregasi total kebutuhan per SKU, total stok gudang, defisit/surplus secara terpaginasi (tanpa rincian pesanan).
 * @param {Object} options
 * @returns {Promise<{ summary: Object, pagination: Object, items: Array<Object>, availableSources: Array<string>, availableLocationPurposes: Array<string> }>}
 */
export const getStockRequirementsService = async (options = {}) => {
  return withConnection(async (connection) => {
    const [listResult, availableSources, availableLocationPurposes] = await Promise.all([
      pickingRepo.getStockRequirementsList(connection, options),
      pickingRepo.getStockRequirementSources(connection),
      pickingRepo.getStockRequirementLocationPurposes(connection),
    ]);

    const { summary, items: rawItems, total } = listResult;

    if (!rawItems || rawItems.length === 0) {
      return {
        summary,
        pagination: {
          page: Number(options.page) || 1,
          limit: Number(options.limit) || 20,
          total: 0,
          totalPages: 1,
        },
        items: [],
        availableSources,
        availableLocationPurposes,
      };
    }

    const validProductIds = rawItems
      .map((r) => r.product_id)
      .filter((id) => id !== null && id !== undefined && id > 0);

    const locationRows =
      validProductIds.length > 0
        ? await pickingRepo.getStockLocationsByProductIds(connection, validProductIds)
        : [];

    // Map lokasi stok per product_id
    const locationMap = new Map();
    locationRows.forEach((loc) => {
      if (!locationMap.has(loc.product_id)) {
        locationMap.set(loc.product_id, []);
      }
      locationMap.get(loc.product_id).push({
        locationId: loc.location_id,
        locationCode: loc.location_code,
        locationName: loc.location_name,
        quantity: Number(loc.quantity),
      });
    });

    const items = rawItems.map((r) => {
      const required = Number(r.total_required) || 0;
      const stock = Number(r.total_stock) || 0;
      const deficit = Number(r.deficit) || 0;

      return {
        sku: r.sku,
        productId: r.product_id,
        productName: r.product_name,
        totalRequired: required,
        totalStock: stock,
        deficit,
        status: r.status || (deficit < 0 ? "DEFICIT" : "SUFFICIENT"),
        orderCount: Number(r.order_count) || 0,
        itemCount: Number(r.item_count) || 0,
        suggestedLocations: r.suggested_locations || "-",
        locations: locationMap.get(r.product_id) || [],
      };
    });

    const limit = Math.max(1, parseInt(options.limit, 10) || 20);
    const page = Math.max(1, parseInt(options.page, 10) || 1);

    return {
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      items,
      availableSources,
      availableLocationPurposes,
    };
  });
};

/**
 * Service untuk mengambil rincian pesanan (invoices) untuk satu SKU spesifik secara terpaginasi.
 * @param {string} sku
 * @param {Object} options
 * @returns {Promise<{ sku: string, pagination: Object, orders: Array<Object> }>}
 */
export const getStockRequirementOrdersService = async (sku, options = {}) => {
  if (!sku || typeof sku !== "string") {
    throw new AppError("SKU wajib diisi.", 400);
  }

  return withConnection(async (connection) => {
    const { rows, total } = await pickingRepo.getStockRequirementOrdersBySku(
      connection,
      sku,
      options
    );

    const orders = rows.map((ord) => ({
      itemId: ord.item_id,
      pickingListId: ord.picking_list_id,
      invoiceId: ord.invoice_id,
      source: ord.source,
      shopName: ord.shop_name,
      customerName: ord.customer_name,
      quantity: Number(ord.quantity),
      itemStatus: ord.item_status,
      orderDate: ord.order_date,
      suggestedLocationCode: ord.suggested_location_code,
    }));

    const limit = Math.max(1, parseInt(options.limit, 10) || 10);
    const page = Math.max(1, parseInt(options.page, 10) || 1);

    return {
      sku,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      orders,
    };
  });
};

// ==============================================================================
// WRITE OPERATIONS (TRANSACTIONS)
// ==============================================================================

/**
 * @param {number|string} pickingListId
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const voidPickingListService = async (pickingListId, userId, existingConnection = null) => {
  return withTransaction(async (connection) => {
    // Cek & Kembalikan Stok untuk item yang sudah divalidasi
    const itemsToRestock = await pickingRepo.getValidatedItemsForRestock(connection, pickingListId);

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

    signals.refreshPicking();
    signals.refreshStock();

    return { success: true, message: "Picking List dibatalkan." };
  }, existingConnection);
};

/**
 * Targeted Refresh: Cek ulang stok khusus untuk satu Picking List (Manual Trigger)
 */
export const retryBackordersService = async (pickingListId, existingConnection = null) => {
  return withTransaction(async (connection) => {
    const unfulfillableRows = await pickingRepo.getUnfulfillableItemsByListId(connection, pickingListId);

    if (unfulfillableRows.length === 0) {
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
      } else {
        // Multi-location sweep jika stok terbagi di beberapa lantai display
        const availableLocs = await locationRepo.getLocationsByProductIds(
          connection,
          [item.product_id],
          item.location_purpose || "DISPLAY",
        );
        const withStock = availableLocs.filter((l) => Number(l.quantity) > 0);
        const totalAvailable = withStock.reduce((acc, l) => acc + Number(l.quantity), 0);

        if (totalAvailable > 0) {
          let remaining = item.quantity;
          let isFirst = true;

          for (const loc of withStock) {
            if (remaining <= 0) break;
            const take = Math.min(Number(loc.quantity), remaining);

            if (isFirst) {
              await pickingRepo.updateItemAllocation(connection, item.id, take, loc.location_id, "PENDING");
              isFirst = false;
            } else {
              await pickingRepo.insertPickingItem(connection, {
                pickingListId: item.picking_list_id,
                productId: item.product_id,
                originalSku: item.original_sku,
                price: item.price || 0,
                quantity: take,
                status: "PENDING",
                suggestedLocationId: loc.location_id,
              });
            }

            loc.quantity = Number(loc.quantity) - take;
            remaining -= take;
            recoveredCount++;
          }

          if (remaining > 0) {
            await pickingRepo.insertPickingItem(connection, {
              pickingListId: item.picking_list_id,
              productId: item.product_id,
              originalSku: item.original_sku,
              price: item.price || 0,
              quantity: remaining,
              status: "BACKORDER",
              suggestedLocationId: null,
            });
          }
        }
      }
    }

    if (recoveredCount > 0) {
      signals.refreshPicking();
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
  }, existingConnection);
};

/**
 * Batch Targeted Refresh: Cek ulang stok untuk beberapa Picking List sekaligus
 */
export const retryBackordersBatchService = async (pickingListIds, existingConnection = null) => {
  if (!pickingListIds || pickingListIds.length === 0) {
    return { success: true, message: "Tidak ada picking list yang dipilih." };
  }

  return withTransaction(async (connection) => {
    // Fetch ALL PENDING & BACKORDER items to ensure no "Ghost Stock" is hiding
    const rows = await pickingRepo.getPendingAndBackorderItemsByListIds(connection, pickingListIds);

    if (rows.length === 0) {
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

    if (recoveredCount > 0 || downgradedCount > 0) {
      signals.refreshPicking();
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
  }, existingConnection);
};

/**
 * SERVICE UTAMA: Menyelesaikan Item Picking
 * FITUR SAFETY CHECK: Memastikan picking list masih aktif & valid sebelum update.
 */
export const completePickingItemsService = async (payloadItems, userId, existingConnection = null) => {
  return withTransaction(async (connection) => {
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
      const unfulfillable = await pickingRepo.getUnfulfillableSkusByListId(connection, listId);

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
      const stocks = await locationRepo.getStockLocationsForUpdate(connection, uniqueProductIds);
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

    signals.refreshPicking();
    signals.refreshStock();

    return {
      success: true,
      message: `Sukses! ${processedCount} item berhasil diproses dan stok telah dipotong.`,
    };
  } catch (error) {
    Logger.error("Complete Transaction Failed", error, "PICKING_DATA_SERVICE");
    throw error;
  }
  }, existingConnection);
};

/**
 * Update produk dan kuantitas item dalam sebuah Picking List secara manual.
 * @param {number|string} pickingListId
 * @param {Array<{ productId: number, sku: string, quantity: number, price?: number }>} newItems
 * @param {number|string} userId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const updatePickingListItemsService = async (pickingListId, newItems, userId, existingConnection = null) => {
  if (!Array.isArray(newItems) || newItems.length === 0) {
    throw new AppError("Pesanan harus memiliki minimal 1 produk.", 400);
  }

  return withTransaction(async (connection) => {
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
      await pickingRepo.deleteItemsByPickingListId(connection, pickingListId);

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

      signals.refreshPicking();
      signals.refreshStock();

      return {
        success: true,
        message: `Berhasil memperbarui item pesanan #${header.original_invoice_id || pickingListId}.`,
      };
    } catch (error) {
      Logger.error("Update Picking Items Failed", error, "PICKING_DATA_SERVICE");
      throw error;
    }
  }, existingConnection);
};

/**
 * Menyelesaikan item picking secara paksa dengan auto-adjustment defisit stok ke Rak Display Utama (A12 - 1, ID: 2).
 * @param {Array<{ id: number, picking_list_id: number, product_id?: number, quantity: number, location_id?: number }>} payloadItems
 * @param {number|string} userId
 * @returns {Promise<{ success: boolean, message: string, data?: { processedCount: number, adjustedQty: number } }>}
 */
export const forceFinishPickingItemsService = async (payloadItems, userId, existingConnection = null) => {
  return withTransaction(async (connection) => {
    try {
      if (!payloadItems || !Array.isArray(payloadItems) || payloadItems.length === 0) {
        throw new AppError("Daftar item tidak boleh kosong.", 400);
      }

    const PRIMARY_DISPLAY_LOCATION_ID = 2; // A12 - 1 (Pajangan Lantai 1)

    // 1. Verifikasi Header Picking Lists
    const uniqueListIds = [...new Set(payloadItems.map((i) => i.picking_list_id))];
    const invoiceMap = new Map();

    for (const listId of uniqueListIds) {
      const header = await pickingRepo.getHeaderById(connection, listId);
      if (!header) {
        throw new AppError(`Picking list #${listId} tidak ditemukan.`, 404);
      }
      if (header.status === "VOID" || header.status === "CANCELLED" || header.status === "CANCEL") {
        throw new AppError(
          `Order #${listId} (${header.original_invoice_id}) telah dibatalkan (VOID/CANCELLED). Tidak dapat diproses.`,
          400,
          "VOID_ORDER",
        );
      }
      invoiceMap.set(listId, header.original_invoice_id);
    }

    // 2. Ambil Item Riil dari DB
    const itemIds = payloadItems.map((i) => i.id);
    const dbItems = await pickingRepo.getItemsByIds(connection, itemIds);
    if (dbItems.length === 0) {
      throw new AppError("Item tidak ditemukan di database.", 404);
    }

    // 3. Locking Stok Terurut Berdasarkan product_id ASC (Pencegahan Deadlock Batch)
    const uniqueProductIds = [...new Set(dbItems.map((item) => item.product_id))].sort((a, b) => a - b);
    const stockMap = new Map(); // key: `${productId}_${locationId}` -> number

    if (uniqueProductIds.length > 0) {
      const stocks = await locationRepo.getSimpleStockLocationsForUpdate(connection, uniqueProductIds);
      for (const s of stocks) {
        stockMap.set(`${s.product_id}_${s.location_id}`, Number(s.quantity));
      }
    }

    // 4. Rencanakan Alokasi Item & Hitung Kebutuhan di Rak Display Utama
    const neededAtPrimary = new Map(); // productId -> number (total quantity)
    const executionPlan = [];

    for (const itemData of dbItems) {
      const {
        id: itemId,
        product_id: prodId,
        quantity: rawQty,
        suggested_location_id: initialLocId,
        picking_list_id,
        status,
      } = itemData;
      const qty = Number(rawQty);

      if (status !== "PENDING" && status !== "BACKORDER") {
        continue; // Lewati item yang sudah selesai atau diretur
      }

      let finalLocationId = initialLocId;
      const currentStockKey = `${prodId}_${initialLocId}`;
      const currentLocStock = initialLocId ? stockMap.get(currentStockKey) || 0 : 0;

      // Jika lokasi awal valid, bukan primary, dan stok fisiknya mencukupi -> tetap potong di lokasi fisik tersebut
      if (initialLocId && initialLocId !== PRIMARY_DISPLAY_LOCATION_ID && currentLocStock >= qty) {
        finalLocationId = initialLocId;
        stockMap.set(currentStockKey, currentLocStock - qty);
      } else {
        // Alihkan ke Rak Display Utama (A12 - 1)
        finalLocationId = PRIMARY_DISPLAY_LOCATION_ID;
        neededAtPrimary.set(prodId, (neededAtPrimary.get(prodId) || 0) + qty);
      }

      executionPlan.push({
        itemId,
        prodId,
        qty,
        finalLocationId,
        picking_list_id,
      });
    }

    // 5. Hitung Defisit Stok & Jalankan Auto-Adjustment pada Rak Display Utama (A12 - 1)
    let totalAdjustedQty = 0;
    for (const [prodId, totalNeeded] of neededAtPrimary.entries()) {
      const primaryKey = `${prodId}_${PRIMARY_DISPLAY_LOCATION_ID}`;
      const currentPrimaryStock = stockMap.has(primaryKey) ? stockMap.get(primaryKey) : 0;

      // Rumus Penanganan Defisit Termasuk Stok Minus:
      // Misal currentPrimaryStock = -10, totalNeeded = 5 -> deficit = Math.max(0, 5 - (-10)) = 15.
      // -10 + 15 = 5 (cukup untuk dipotong 5 tanpa gagal validasi stok)
      const deficit = Math.max(0, totalNeeded - currentPrimaryStock);

      if (deficit > 0) {
        await locationRepo.incrementStock(connection, prodId, PRIMARY_DISPLAY_LOCATION_ID, deficit);
        await stockRepo.createLog(connection, {
          productId: prodId,
          quantity: deficit,
          toLocationId: PRIMARY_DISPLAY_LOCATION_ID,
          type: "ADJUSTMENT",
          userId,
          notes: `Auto-Adjustment Force Finish (Defisit: ${deficit} pcs)`,
        });
        stockMap.set(primaryKey, currentPrimaryStock + deficit);
        totalAdjustedQty += deficit;
      }
    }

    // 6. Eksekusi Pemotongan Stok (SALE) & Update Status Item
    const affectedListIds = new Set();
    let processedCount = 0;

    for (const plan of executionPlan) {
      const { itemId, prodId, qty, finalLocationId, picking_list_id } = plan;

      // Pastikan suggested_location_id terisi
      await pickingRepo.updateSuggestedLocation(connection, itemId, finalLocationId);

      // Update status item -> VALIDATED
      await pickingRepo.validateItem(connection, itemId, finalLocationId);

      // Potong stok fisik
      await locationRepo.deductStock(connection, prodId, finalLocationId, qty);

      // Catat log pergerakan barang (SALE)
      const invRef = invoiceMap.get(picking_list_id) || `List #${picking_list_id}`;
      await stockRepo.createLog(connection, {
        productId: prodId,
        quantity: qty,
        fromLocationId: finalLocationId,
        type: "SALE",
        userId,
        notes: `Sale Ref: ${invRef} (Item #${itemId} - Force Finish)`,
      });

      affectedListIds.add(picking_list_id);
      processedCount++;
    }

    // 7. Update Header Status Jika Semua Item di Picking List Selesai
    for (const listId of affectedListIds) {
      const remainingCount = await pickingRepo.countPendingItems(connection, listId);
      if (remainingCount === 0) {
        await pickingRepo.validateHeader(connection, listId);
      }
    }

      signals.refreshPicking();
      signals.refreshStock();

      return {
        success: true,
        message: `Sukses Force Finish! ${processedCount} item berhasil diselesaikan${
          totalAdjustedQty > 0
            ? ` (Auto-adjustment ${totalAdjustedQty} pcs dilakukan di Rak Display Utama A12 - 1).`
            : "."
        }`,
        data: {
          processedCount,
          adjustedQty: totalAdjustedQty,
        },
      };
    } catch (error) {
      Logger.error("Force Finish Transaction Failed", error, "PICKING_DATA_SERVICE");
      throw error;
    }
  }, existingConnection);
};

