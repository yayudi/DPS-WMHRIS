// backend/services/pickingImportService.js
import db from "../config/db.js";
import { WMS_STATUS, MP_STATUS } from "../config/wmsConstants.js";
import * as productRepo from "../repositories/productRepository.js";
import * as pickingRepo from "../repositories/pickingRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const safe = (val) => (val === undefined ? null : val);
const normalizeStr = (str) =>
  String(str)
    .trim()
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ");

// Helper Log
const log = (invoiceId, msg) => {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[IMPORT][${time}][${invoiceId || "GENERAL"}] ${msg}`);
};

/**
 * ============================================================================
 * MAIN ENTRY POINT
 * ============================================================================
 */
export const processImportData = async (parsedOrders, userId) => {
  const results = { processed: 0, new: 0, updated: 0, obsolete: 0, errors: [] };

  log(null, `🚀 Memulai proses import ${parsedOrders.size} order...`);

  // 1. Pre-fetch Data Produk (Bulk Optimization)
  const allSkus = new Set();
  for (const orderData of parsedOrders.values()) {
    orderData.items.forEach((i) => allSkus.add(i.sku));
  }

  const preFetchConnection = await db.getConnection();
  let productInfoMap;
  try {
    productInfoMap = await productRepo.getProductMapWithComponents(
      preFetchConnection,
      Array.from(allSkus)
    );
  } finally {
    preFetchConnection.release();
  }

  // 2. Loop Transaction per Invoice
  for (const [invoiceId, orderData] of parsedOrders) {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Panggil Handler Logika Utama
      await processSingleInvoice(connection, invoiceId, orderData, userId, productInfoMap, results);

      await connection.commit();
      results.processed++;
    } catch (error) {
      await connection.rollback();
      const errorMsg =
        error.code === "ER_BAD_NULL_ERROR" ? "Data Wajib (Not Null) Kosong" : error.message;
      results.errors.push({ invoice: invoiceId, error: errorMsg });
      console.error(`Error processing invoice ${invoiceId}:`, error);
    } finally {
      connection.release();
    }
  }

  return results;
};

/**
 * ============================================================================
 * CORE LOGIC HANDLERS
 * ============================================================================
 */

async function processSingleInvoice(conn, invoiceId, orderData, userId, productInfoMap, results) {
  // 1. Analisis Status & Header
  const existingHeader = await pickingRepo.findActiveHeaderByInvoice(conn, safe(invoiceId));
  const mpStatus = safe(orderData.status) || MP_STATUS.NEW;

  // Deteksi Status Flag
  const isMpCancel = mpStatus === MP_STATUS.CANCELLED;
  const hasReturnedItems = orderData.items.some((i) => i.returnedQty && i.returnedQty > 0);
  const isMpReturn = mpStatus === MP_STATUS.RETURNED || hasReturnedItems;

  if (hasReturnedItems) {
    log(invoiceId, `   ⚠️ Partial Return Detected from Item Qty (Header: ${mpStatus})`);
  }

  // 2. Tentukan Strategi (Create New atau Update)
  const action = await determineImportAction(
    conn,
    existingHeader,
    orderData,
    invoiceId,
    mpStatus,
    isMpReturn
  );

  // 3. Eksekusi Strategi
  if (action === "CREATE_NEW") {
    // [FIX] Menggunakan nama fungsi yang konsisten 'executeCreateFlow'
    await executeCreateFlow(
      conn,
      invoiceId,
      orderData,
      userId,
      existingHeader,
      productInfoMap, // Arg 6: Product Map
      { isMpCancel, isMpReturn, mpStatus }, // Arg 7: Flags
      results
    );
  } else {
    await executeUpdateFlow(
      conn,
      invoiceId,
      orderData,
      userId,
      existingHeader,
      { isMpCancel, isMpReturn, mpStatus },
      results
    );
  }
}

/**
 * Menentukan apakah harus membuat revisi baru atau update status saja.
 */
async function determineImportAction(
  conn,
  existingHeader,
  orderData,
  invoiceId,
  mpStatus,
  isMpReturn
) {
  if (!existingHeader) return "CREATE_NEW";

  const oldItems = await pickingRepo.getItemsForComparison(conn, existingHeader.id);
  const isContentChanged = hasOrderChanged(
    orderData.items,
    oldItems,
    invoiceId,
    mpStatus,
    existingHeader.status
  );

  if (
    isContentChanged ||
    existingHeader.status === "OBSOLETE" ||
    existingHeader.status === "CANCEL"
  ) {
    // Pengecualian: Jika status RETURNED dan isinya sama, hanya update (re-scan)
    if (existingHeader.status === "RETURNED" && isMpReturn && !isContentChanged) {
      return "UPDATE_EXISTING";
    }
    return "CREATE_NEW"; // Revisi / Re-aktivasi
  }

  return "UPDATE_EXISTING"; // Data Identik
}

/**
 * Flow Pembuatan Picking List Baru (Termasuk Arsip Versi Lama)
 */
async function executeCreateFlow(
  conn,
  invoiceId,
  orderData,
  userId,
  existingHeader,
  productInfoMap,
  flags,
  results
) {
  // Arsipkan header lama jika ada
  if (existingHeader) {
    log(invoiceId, `🔄 Revisi Detected. Archiving old ID ${existingHeader.id}...`);
    await pickingRepo.archiveHeader(conn, existingHeader.id);
    results.obsolete++;
  }

  // Tentukan Status Awal WMS
  let initialWmsStatus = WMS_STATUS.PENDING;
  if (flags.isMpCancel) {
    initialWmsStatus = WMS_STATUS.CANCEL;
  } else if (flags.isMpReturn) {
    // Gatekeeper: Jangan biarkan Order Baru langsung jadi RETURNED tanpa history sales
    if (
      !existingHeader ||
      existingHeader.status === "CANCEL" ||
      existingHeader.status === "OBSOLETE"
    ) {
      log(invoiceId, `🛑 New/Revived Order with Return Status. Converting to CANCEL.`);
      initialWmsStatus = WMS_STATUS.CANCEL;
    } else {
      initialWmsStatus = WMS_STATUS.RETURNED;
    }
  }

  log(invoiceId, `✨ Creating NEW Header. WMS Status: ${initialWmsStatus}`);

  const newPickingId = await pickingRepo.createHeader(conn, {
    userId: safe(userId),
    source: safe(orderData.source || "Tokopedia"),
    invoiceId: safe(invoiceId),
    customer: safe(orderData.customer),
    orderDate: safe(orderData.orderDate) || now(),
    status: safe(initialWmsStatus),
    mpStatus: safe(flags.mpStatus),
    filename: orderData.originalFilename,
  });

  // Loop & Insert Items
  for (const item of orderData.items) {
    const productInfo = productInfoMap.get(item.sku);
    let itemsToInsert = [];

    // Handle Paket
    if (productInfo?.is_package && productInfo?.components.length > 0) {
      itemsToInsert = productInfo.components.map((comp) => ({
        productId: comp.id,
        sku: comp.sku,
        qty: item.qty * comp.qty_ratio,
      }));
    } else {
      itemsToInsert = [
        { productId: productInfo ? productInfo.id : null, sku: item.sku, qty: item.qty },
      ];
    }

    for (const subItem of itemsToInsert) {
      let finalProductId = subItem.productId;
      if (!finalProductId) {
        finalProductId = await productRepo.getIdBySku(conn, subItem.sku);
        if (!finalProductId) throw new Error(`SKU '${subItem.sku}' tidak terdaftar.`);
      }

      // Logic Lokasi: Hanya cari lokasi jika PENDING. Jika CANCEL/RETURNED, lokasi NULL.
      const isPickingNeeded = initialWmsStatus === WMS_STATUS.PENDING;
      const suggestedLocId = isPickingNeeded
        ? await locationRepo.findBestStock(conn, finalProductId, subItem.qty)
        : null;

      let itemStatus = initialWmsStatus;
      // Override: Jika item spesifik ini punya returnedQty dan header bukan cancel
      if (
        initialWmsStatus !== WMS_STATUS.CANCEL &&
        item.returnedQty > 0 &&
        item.returnedQty >= item.qty
      ) {
        itemStatus = WMS_STATUS.RETURNED;
      }

      await pickingRepo.createItem(conn, {
        listId: newPickingId,
        productId: finalProductId,
        sku: subItem.sku,
        qty: subItem.qty,
        status: itemStatus,
        locationId: suggestedLocId,
      });
    }
  }
  results.new++;
}

/**
 * Flow Update Status Existing
 */
async function executeUpdateFlow(
  conn,
  invoiceId,
  orderData,
  userId,
  existingHeader,
  flags,
  results
) {
  const currentId = existingHeader.id;

  if (flags.isMpCancel) {
    await handleCancelUpdate(conn, invoiceId, existingHeader, flags.mpStatus, userId);
  } else if (flags.isMpReturn) {
    await handleReturnUpdate(conn, invoiceId, existingHeader, orderData, flags.mpStatus);
  } else {
    // Normal Update (Shipped/Completed)
    if (existingHeader.marketplace_status !== flags.mpStatus) {
      log(
        invoiceId,
        `ℹ️ Update Marketplace Status: ${existingHeader.marketplace_status} -> ${flags.mpStatus}`
      );
      await pickingRepo.updateMarketplaceStatus(conn, currentId, safe(flags.mpStatus));
    }
  }
  results.updated++;
}

/**
 * Logika Update CANCEL (Termasuk Auto-Restock)
 */
async function handleCancelUpdate(conn, invoiceId, existingHeader, mpStatus, userId) {
  if (existingHeader.status === WMS_STATUS.CANCEL) return;

  log(invoiceId, `🛑 Update Status: CANCEL (Prev: ${existingHeader.status})`);

  // Auto Restock jika barang sudah VALIDATED (terpotong stoknya)
  if (existingHeader.status === WMS_STATUS.VALIDATED) {
    log(invoiceId, `   ♻️ Order sebelumnya VALIDATED. Mengembalikan stok...`);
    const [itemsToRestock] = await conn.query(
      `SELECT product_id, quantity, confirmed_location_id
       FROM picking_list_items
       WHERE picking_list_id = ? AND status = 'VALIDATED' AND confirmed_location_id IS NOT NULL`,
      [existingHeader.id]
    );

    for (const item of itemsToRestock) {
      await locationRepo.incrementStock(
        conn,
        item.product_id,
        item.confirmed_location_id,
        item.quantity
      );
      await stockRepo.createLog(conn, {
        productId: item.product_id,
        quantity: item.quantity,
        toLocationId: item.confirmed_location_id,
        type: "CANCEL_RESTOCK",
        userId: userId,
        notes: `Auto Cancel ${invoiceId}`,
      });
    }
    log(invoiceId, `   ✅ Stok dikembalikan untuk ${itemsToRestock.length} item.`);
  }

  await pickingRepo.updateMarketplaceStatus(
    conn,
    existingHeader.id,
    safe(mpStatus),
    WMS_STATUS.CANCEL
  );
  await pickingRepo.cancelItemsByListId(conn, existingHeader.id);
}

/**
 * Logika Update RETURN (Smart Split Partial Return)
 */
async function handleReturnUpdate(conn, invoiceId, existingHeader, orderData, mpStatus) {
  // [GATEKEEPER 2 - EXISTING PENDING]
  if (existingHeader.status === WMS_STATUS.PENDING) {
    log(invoiceId, `🛑 ALERT: Order is PENDING but marked RETURNED. Converting to CANCEL.`);
    await pickingRepo.updateMarketplaceStatus(
      conn,
      existingHeader.id,
      safe(mpStatus),
      WMS_STATUS.CANCEL
    );
    await pickingRepo.cancelItemsByListId(conn, existingHeader.id);
    return;
  }

  log(invoiceId, `↩️ Processing RETURN update...`);
  await pickingRepo.updateMarketplaceStatus(
    conn,
    existingHeader.id,
    safe(mpStatus),
    WMS_STATUS.RETURNED
  );

  const [dbItems] = await conn.query(
    `SELECT id, original_sku, quantity, status, product_id FROM picking_list_items WHERE picking_list_id = ?`,
    [existingHeader.id]
  );

  // [Smart Accumulation] Hitung total yg sudah diretur
  const dbReturnedMap = new Map();
  for (const item of dbItems) {
    if (item.status === WMS_STATUS.RETURNED || item.status === "COMPLETED_RETURN") {
      const key = normalizeStr(item.original_sku);
      const current = dbReturnedMap.get(key) || 0;
      dbReturnedMap.set(key, current + item.quantity);
    }
  }

  const csvItemMap = new Map();
  orderData.items.forEach((i) => csvItemMap.set(normalizeStr(i.sku), i));

  for (const dbItem of dbItems) {
    // Proses hanya item SALES (Pending/Validated)
    if (dbItem.status === WMS_STATUS.RETURNED || dbItem.status === "COMPLETED_RETURN") continue;

    const normSku = normalizeStr(dbItem.original_sku);
    const csvItem = csvItemMap.get(normSku);

    let totalTargetReturn = 0;
    if (csvItem) {
      if (csvItem.returnedQty && csvItem.returnedQty > 0) {
        totalTargetReturn = csvItem.returnedQty;
      } else if (!csvItem.hasOwnProperty("returnedQty")) {
        totalTargetReturn = dbItem.quantity; // Fallback
      }
    }

    // Hitung Sisa Retur
    const alreadyReturned = dbReturnedMap.get(normSku) || 0;
    const remainingToReturn = totalTargetReturn - alreadyReturned;

    if (remainingToReturn <= 0) continue; // Sudah sinkron, skip

    const qtyToTake = Math.min(remainingToReturn, dbItem.quantity);

    if (qtyToTake > 0) {
      if (qtyToTake === dbItem.quantity) {
        // Full Line Return
        await conn.query(`UPDATE picking_list_items SET status = ? WHERE id = ?`, [
          WMS_STATUS.RETURNED,
          dbItem.id,
        ]);
        log(invoiceId, `      ACTION: Full Line Return Updated (${qtyToTake})`);
      } else {
        // Partial Split
        const remainingQty = dbItem.quantity - qtyToTake;
        await conn.query(`UPDATE picking_list_items SET quantity = ? WHERE id = ?`, [
          remainingQty,
          dbItem.id,
        ]);

        await conn.query(
          `INSERT INTO picking_list_items (
              picking_list_id, product_id, original_sku, quantity, status,
              suggested_location_id, picked_from_location_id, confirmed_location_id
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`,
          [
            existingHeader.id,
            dbItem.product_id,
            dbItem.original_sku,
            qtyToTake,
            WMS_STATUS.RETURNED,
          ]
        );
        log(
          invoiceId,
          `      ACTION: Partial Split Executed (Sold: ${remainingQty}, New Ret: ${qtyToTake})`
        );
      }

      // Update map akumulasi
      dbReturnedMap.set(normSku, alreadyReturned + qtyToTake);
    }
  }
}

/**
 * ============================================================================
 * UTILS
 * ============================================================================
 */
const hasOrderChanged = (newItems, oldItems, invoiceId, newMpStatus, currentWmsStatus) => {
  const isQtyDifferent = (q1, q2) => Math.abs(q1 - q2) > 0.001;

  const oldMap = new Map();
  oldItems.forEach((i) =>
    oldMap.set(normalizeStr(i.sku), (oldMap.get(normalizeStr(i.sku)) || 0) + Number(i.qty))
  );

  const newMap = new Map();
  newItems.forEach((i) =>
    newMap.set(normalizeStr(i.sku), (newMap.get(normalizeStr(i.sku)) || 0) + Number(i.qty))
  );

  if (oldMap.size !== newMap.size) return true;

  for (const [sku, oldQty] of oldMap.entries()) {
    const newQty = newMap.get(sku);
    if (newQty === undefined || isQtyDifferent(newQty, oldQty)) return true;
  }
  return false;
};
