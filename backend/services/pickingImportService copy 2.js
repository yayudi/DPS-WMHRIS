// backend/services/pickingImportService.js
import db from "../config/db.js";
import { WMS_STATUS, MP_STATUS } from "../config/wmsConstants.js";
import * as productRepo from "../repositories/productRepository.js";
import * as pickingRepo from "../repositories/pickingRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const safe = (val) => (val === undefined ? null : val);

// Helper log sederhana dengan Timestamp
const log = (invoiceId, msg) => {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[IMPORT][${time}][${invoiceId || "GENERAL"}] ${msg}`);
};

/**
 * 🕵️ DEBUGGER: Membandingkan Item Lama vs Baru
 */
const hasOrderChanged = (newItems, oldItems, invoiceId, newMpStatus, currentWmsStatus) => {
  console.group(`🔍 [COMPARE] Checking Revision for Invoice: ${invoiceId}`);
  console.log(`   ℹ️ Status Check: DB(WMS)=[${currentWmsStatus}] vs CSV(MP)=[${newMpStatus}]`);

  const normalize = (sku) =>
    String(sku)
      .trim()
      .toUpperCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ");

  const isQtyDifferent = (q1, q2) => Math.abs(q1 - q2) > 0.001;

  const oldMap = new Map();
  oldItems.forEach((i) => {
    const sku = normalize(i.sku);
    const qty = Number(i.qty);
    oldMap.set(sku, (oldMap.get(sku) || 0) + qty);
  });

  const newMap = new Map();
  newItems.forEach((i) => {
    const sku = normalize(i.sku);
    const qty = Number(i.qty);
    newMap.set(sku, (newMap.get(sku) || 0) + qty);
  });

  if (oldMap.size !== newMap.size) {
    console.warn(`   ⚠️ DIFF: Jumlah SKU beda. DB=${oldMap.size}, CSV=${newMap.size}`);
    console.groupEnd();
    return true;
  }

  for (const [sku, oldQty] of oldMap.entries()) {
    const newQty = newMap.get(sku);
    if (newQty === undefined) {
      console.warn(`   ⚠️ DIFF: SKU ${sku} hilang di CSV.`);
      console.groupEnd();
      return true;
    }
    if (isQtyDifferent(newQty, oldQty)) {
      console.warn(`   ⚠️ DIFF: Qty SKU ${sku} berubah. DB=${oldQty}, CSV=${newQty}`);
      console.groupEnd();
      return true;
    }
  }

  console.log("   ✅ IDENTICAL: Data konten sama persis.");
  console.groupEnd();
  return false;
};

export const processImportData = async (parsedOrders, userId) => {
  const results = { processed: 0, new: 0, updated: 0, obsolete: 0, errors: [] };

  log(null, `🚀 Memulai proses import ${parsedOrders.size} order...`);

  // 1. Pre-fetch Data Produk
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
    // --------------------------------------------------------
    // 🔦 X-RAY LOG: Inspect Raw Data before processing
    // --------------------------------------------------------
    console.group(`[X-RAY] ${invoiceId}`);
    console.log(`Header Status: ${orderData.status}`);
    console.table(
      orderData.items.map((i) => ({
        sku: i.sku,
        qty: i.qty,
        returnedQty: i.returnedQty,
        isReturn: i.returnedQty > 0,
      }))
    );
    console.groupEnd();
    // --------------------------------------------------------

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const existingHeader = await pickingRepo.findActiveHeaderByInvoice(
        connection,
        safe(invoiceId)
      );

      let currentMpStatus = "UNKNOWN";
      if (existingHeader) {
        const [rows] = await connection.query(
          "SELECT marketplace_status FROM picking_lists WHERE id = ?",
          [existingHeader.id]
        );
        if (rows.length) currentMpStatus = rows[0].marketplace_status;
      }

      const mpStatus = safe(orderData.status) || MP_STATUS.NEW;

      // [LOGIC STATUS - UPDATED]
      const isMpCancel = mpStatus === MP_STATUS.CANCELLED;

      // Cek apakah ada item yang memiliki returnedQty > 0
      const hasReturnedItems = orderData.items.some((i) => i.returnedQty && i.returnedQty > 0);

      // Force status RETURNED jika status header RETURNED ATAU ada item yang diretur
      const isMpReturn = mpStatus === MP_STATUS.RETURNED || hasReturnedItems;

      if (hasReturnedItems) {
        log(invoiceId, `   ⚠️ Deteksi Partial Return dari Item Level (Header: ${mpStatus})`);
      } else if (isMpReturn) {
        log(invoiceId, `   ⚠️ Status Header RETURNED, tapi tidak ada item dengan returnedQty > 0.`);
      }

      let shouldCreateNew = false;

      // STEP A: Tentukan Action (New / Update / Obsolete)
      if (existingHeader) {
        // Cek Revisi Konten
        const oldItems = await pickingRepo.getItemsForComparison(connection, existingHeader.id);
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
          // Pengecualian Khusus: Jika statusnya RETURNED dan isinya sama, jangan buat baru
          if (existingHeader.status === "RETURNED" && isMpReturn && !isContentChanged) {
            shouldCreateNew = false;
          } else {
            log(invoiceId, `🔄 Revisi Detected. Archiving old ID ${existingHeader.id}...`);
            await pickingRepo.archiveHeader(connection, existingHeader.id);
            results.obsolete++;
            shouldCreateNew = true;
          }
        } else {
          shouldCreateNew = false; // Identik & Status Valid -> Masuk ke blok Update
        }
      } else {
        shouldCreateNew = true; // Data Baru
      }

      // STEP B: Eksekusi Action
      if (shouldCreateNew) {
        // Tentukan Status Awal WMS
        let initialWmsStatus = WMS_STATUS.PENDING;
        if (isMpCancel) initialWmsStatus = WMS_STATUS.CANCEL;
        else if (isMpReturn) initialWmsStatus = WMS_STATUS.RETURNED;

        log(invoiceId, `✨ Creating NEW Header. WMS Status: ${initialWmsStatus}`);

        const newPickingId = await pickingRepo.createHeader(connection, {
          userId: safe(userId),
          source: safe(orderData.source || "Tokopedia"),
          invoiceId: safe(invoiceId),
          customer: safe(orderData.customer),
          orderDate: safe(orderData.orderDate) || now(),
          status: safe(initialWmsStatus),
          mpStatus: safe(mpStatus),
          filename: orderData.originalFilename,
        });

        for (const item of orderData.items) {
          const productInfo = productInfoMap.get(item.sku);
          let itemsToInsert = [];

          if (productInfo && productInfo.is_package && productInfo.components.length > 0) {
            itemsToInsert = productInfo.components.map((comp) => ({
              productId: comp.id,
              sku: comp.sku,
              qty: item.qty * comp.qty_ratio,
            }));
          } else {
            itemsToInsert = [
              {
                productId: productInfo ? productInfo.id : null,
                sku: item.sku,
                qty: item.qty,
              },
            ];
          }

          for (const subItem of itemsToInsert) {
            let finalProductId = subItem.productId;
            if (!finalProductId) {
              finalProductId = await productRepo.getIdBySku(connection, subItem.sku);
              if (!finalProductId)
                throw new Error(`SKU '${subItem.sku}' tidak terdaftar di Master Produk.`);
            }

            // [LOGIC LOKASI]
            const suggestedLocId =
              isMpReturn || isMpCancel
                ? null
                : await locationRepo.findBestStock(connection, finalProductId, subItem.qty);

            let itemStatus = isMpReturn || isMpCancel ? initialWmsStatus : WMS_STATUS.PENDING;

            // Override item status jika spesifik item ini diretur
            if (item.returnedQty > 0 && item.returnedQty >= item.qty) {
              itemStatus = WMS_STATUS.RETURNED;
            }

            await pickingRepo.createItem(connection, {
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
      } else {
        // SKENARIO UPDATE (Data Identik)
        const currentId = existingHeader.id;

        // Kasus 1: Batal (CANCEL)
        if (isMpCancel) {
          if (existingHeader.status !== WMS_STATUS.CANCEL) {
            log(invoiceId, `🛑 Update Status: CANCEL (Prev: ${existingHeader.status})`);

            // [AUTO RESTOCK] Jika sebelumnya sudah dipotong (VALIDATED), kembalikan stok.
            if (existingHeader.status === WMS_STATUS.VALIDATED) {
              log(invoiceId, `   ♻️ Order sebelumnya VALIDATED. Mengembalikan stok...`);

              const [itemsToRestock] = await connection.query(
                `SELECT product_id, quantity, confirmed_location_id
                     FROM picking_list_items
                     WHERE picking_list_id = ? AND status = 'VALIDATED' AND confirmed_location_id IS NOT NULL`,
                [currentId]
              );

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
                  notes: `Auto Cancel Import Invoice ${invoiceId}`,
                });
              }
              log(invoiceId, `   ✅ Stok dikembalikan untuk ${itemsToRestock.length} item.`);
            }

            await pickingRepo.updateMarketplaceStatus(
              connection,
              currentId,
              safe(mpStatus),
              WMS_STATUS.CANCEL
            );
            await pickingRepo.cancelItemsByListId(connection, currentId);
          }
        }
        // Kasus 2: Retur (RETURNED) - [LOGIC PARTIAL RETURN]
        else if (isMpReturn) {
          // =========================================================
          // [GATEKEEPER LOGIC]
          // Cegah status RETURNED jika order masih PENDING (Belum Validated)
          // =========================================================
          if (existingHeader.status === WMS_STATUS.PENDING) {
            log(invoiceId, `🛑 ALERT: Order is PENDING but marked RETURNED. Converting to CANCEL.`);

            // Ubah header jadi CANCEL (karena barang belum keluar, jadi ini pembatalan biasa)
            await pickingRepo.updateMarketplaceStatus(
              connection,
              currentId,
              safe(mpStatus), // Tetap simpan status MP asli (misal: Refund)
              WMS_STATUS.CANCEL
            );

            // Batalkan semua item
            await pickingRepo.cancelItemsByListId(connection, currentId);

            // Tidak perlu restock stok karena PENDING berarti stok belum dipotong.
          }
          // Jika sudah VALIDATED atau sudah RETURNED, proses retur normal
          else {
            log(invoiceId, `↩️ Processing RETURN update...`);

            // Update header ke RETURNED (Flagging ada retur)
            await pickingRepo.updateMarketplaceStatus(
              connection,
              currentId,
              safe(mpStatus),
              WMS_STATUS.RETURNED
            );

            // Ambil item DB yang ada untuk invoice ini
            const [dbItems] = await connection.query(
              `SELECT id, original_sku, quantity, status, product_id, suggested_location_id, picked_from_location_id FROM picking_list_items WHERE picking_list_id = ?`,
              [currentId]
            );

            const normalize = (s) => String(s).trim().toUpperCase();
            const csvItemMap = new Map();
            orderData.items.forEach((i) => csvItemMap.set(normalize(i.sku), i));

            for (const dbItem of dbItems) {
              if (dbItem.status === WMS_STATUS.RETURNED || dbItem.status === "COMPLETED_RETURN")
                continue;

              const csvItem = csvItemMap.get(normalize(dbItem.original_sku));
              let qtyToReturn = 0;

              if (csvItem) {
                log(
                  invoiceId,
                  `   -> Checking Item: ${dbItem.original_sku} (DB Qty: ${dbItem.quantity})`
                );

                if (csvItem.returnedQty && csvItem.returnedQty > 0) {
                  qtyToReturn = Math.min(csvItem.returnedQty, dbItem.quantity);
                  log(invoiceId, `      Hit! Found ReturnedQty: ${qtyToReturn}`);
                } else if (!csvItem.hasOwnProperty("returnedQty")) {
                  qtyToReturn = dbItem.quantity; // Fallback jika kolom tidak ada
                } else {
                  log(invoiceId, `      No return detected (returnedQty is 0)`);
                }
              }

              if (qtyToReturn > 0) {
                if (qtyToReturn === dbItem.quantity) {
                  // Full Return Baris Ini
                  await connection.query(`UPDATE picking_list_items SET status = ? WHERE id = ?`, [
                    WMS_STATUS.RETURNED,
                    dbItem.id,
                  ]);
                  log(invoiceId, `      ACTION: Full Line Return Updated (${qtyToReturn})`);
                } else {
                  // Partial Split
                  // 1. Kurangi item lama (Sisa Sales)
                  const remainingQty = dbItem.quantity - qtyToReturn;
                  await connection.query(
                    `UPDATE picking_list_items SET quantity = ? WHERE id = ?`,
                    [remainingQty, dbItem.id]
                  );

                  // 2. Buat item baru (Retur)
                  await connection.query(
                    `
                    INSERT INTO picking_list_items (
                        picking_list_id, product_id, original_sku, quantity, status,
                        suggested_location_id, picked_from_location_id, confirmed_location_id
                    )
                    VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
                 `,
                    [
                      currentId,
                      dbItem.product_id,
                      dbItem.original_sku,
                      qtyToReturn,
                      WMS_STATUS.RETURNED,
                    ]
                  );

                  log(
                    invoiceId,
                    `      ACTION: Partial Split Executed (Sold: ${remainingQty}, Ret: ${qtyToReturn})`
                  );
                }
              }
            }
          }
        }
        // Kasus 3: Update Normal (SHIPPED / COMPLETED)
        else {
          if (currentMpStatus !== mpStatus) {
            log(invoiceId, `ℹ️ Update Marketplace Status: ${currentMpStatus} -> ${mpStatus}`);
            await pickingRepo.updateMarketplaceStatus(connection, currentId, safe(mpStatus));
          }
        }
        results.updated++;
      }

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
