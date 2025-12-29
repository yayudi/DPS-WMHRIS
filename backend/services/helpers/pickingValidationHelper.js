// backend/services/helpers/pickingValidationHelper.js
import * as locationRepo from "../../repositories/locationRepository.js";
import * as productRepo from "../../repositories/productRepository.js";
import * as pickingRepo from "../../repositories/pickingRepository.js";
import { WMS_STATUS, MP_STATUS } from "../../config/wmsConstants.js";

// ==============================================================================
// 🔍 DEBUGGER HELPER
// ==============================================================================
const DEBUG = true;
function logTrace(stage, message, data = null) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(`[${timestamp}][${stage}] ${message}`);
  if (data) console.dir(data, { depth: 2, colors: true });
}

/**
 * HELPER 1: Smart Upsert Logic (Sync Status & Revisions)
 * Menangani update status marketplace, retur (Partial/Full), pembatalan, dan revisi.
 */
export async function handleExistingInvoices(connection, items) {
  logTrace("UPSERT", `Menerima ${items.length} item untuk dicek.`);

  const normalize = (str) =>
    String(str || "")
      .trim()
      .toUpperCase();
  const invoiceIds = items.map((i) => normalize(i.invoiceId)).filter((id) => id);

  if (!invoiceIds.length) {
    logTrace("UPSERT", "⚠️ Tidak ada Invoice ID yang terdeteksi di payload item.");
    return [...items];
  }

  // Gunakan getAllHeadersByInvoiceIds untuk mendeteksi order aktif maupun cancel/inactive
  const existingLists = await pickingRepo.getAllHeadersByInvoiceIds(connection, invoiceIds);
  const existingMap = new Map(existingLists.map((row) => [row.original_invoice_id, row]));
  const itemsToProcess = [];

  // Batch Action Containers
  const updates = []; // Update marketplace status
  const headerReturns = []; // Update header to RETURNED
  const itemReturns = []; // Update items to RETURNED (Bulk or Micro)
  const cancels = []; // Cancel orders
  const archives = []; // Archive old orders (Revisions)

  for (const item of items) {
    const existing = existingMap.get(item.invoiceId);
    const status = item.status || MP_STATUS.NEW;

    if (existing) {
      const listId = existing.id;

      // [A] Conflict Handling: ID ada tapi Inactive/Cancel -> Archive & Re-Insert
      if (
        !existing.is_active ||
        existing.status === WMS_STATUS.CANCEL ||
        existing.status === "OBSOLETE"
      ) {
        logTrace("UPSERT", `👻 Order ${item.invoiceId} inactive/cancel. Archive & Re-insert.`);
        archives.push(listId);
        itemsToProcess.push(item);
        continue;
      }

      // [B] Sync Logic (Active Orders)

      // Handle RETURNED (Full or Partial)
      if (status === MP_STATUS.RETURNED || status.includes("RETURN")) {
        // [CRITICAL GUARD] Cegah Stok Hantu
        // Jika barang belum keluar (masih PENDING/NEW), jangan set RETURNED.
        // Langsung CANCEL saja agar tidak terjadi double counting stok saat restock.
        if ([WMS_STATUS.PENDING, "NEW", "DRAFT"].includes(existing.status)) {
          logTrace(
            "UPSERT",
            `🛡️ Order ${item.invoiceId} Retur saat PENDING. Dialihkan ke CANCEL (Void).`
          );
          if (existing.status !== WMS_STATUS.CANCEL) {
            cancels.push(listId);
          }
        } else {
          // Status sudah SHIPPED/VALIDATED/COMPLETED -> Valid untuk Retur Fisik

          // Tandai Header untuk update status (jika belum)
          if (existing.status !== WMS_STATUS.RETURNED) {
            headerReturns.push(listId);
          }

          // [MICRO RETURN LOGIC]
          // Cek apakah ada detail item yang diretur (returnedQty > 0)
          let hasDetailReturn = false;
          if (item.items && item.items.length > 0) {
            for (const lineItem of item.items) {
              if (lineItem.returnedQty > 0) {
                itemReturns.push({
                  listId,
                  sku: lineItem.sku,
                  returnedQty: lineItem.returnedQty,
                  isBulk: false,
                });
                hasDetailReturn = true;
              }
            }
          }

          // Jika tidak ada detail (misal data CSV minim), fallback ke Full Return semua item
          if (!hasDetailReturn && existing.status !== WMS_STATUS.RETURNED) {
            itemReturns.push({ listId, isBulk: true });
          }
        }
      }
      // 2. Handle CANCELLED
      else if (
        status === MP_STATUS.CANCELLED ||
        status === "CANCELLED" ||
        status.includes("BATAL")
      ) {
        if (existing.status !== WMS_STATUS.CANCEL) {
          logTrace("UPSERT", `🚫 Order ${item.invoiceId} batal.`);
          cancels.push(listId);
        }
      }
      // 3. Handle SHIPPED / COMPLETED (Update MP Status Only)
      else if ([MP_STATUS.SHIPPED, MP_STATUS.COMPLETED].includes(status)) {
        // [SCENARIO: REVERSAL OF RETURN / DISPUTE WON]
        // Jika sebelumnya sudah ditandai RETURNED, tapi status MP balik ke COMPLETED (Dispute Menang/Batal Retur)
        if (existing.status === WMS_STATUS.RETURNED) {
          logTrace(
            "UPSERT",
            `⚖️ Order ${item.invoiceId} batal retur (Dispute Menang?). Revert ke VALIDATED.`
          );
          // Kembalikan status WMS ke VALIDATED (anggap barang laku/tidak jadi balik)
          updates.push({ id: listId, mpStatus: status, wmsStatus: WMS_STATUS.VALIDATED });
        }
        // Update Normal (Update MP status saja)
        else if (![WMS_STATUS.CANCEL, "OBSOLETE"].includes(existing.status)) {
          updates.push({ id: listId, mpStatus: status, wmsStatus: null });
        }
      }
      // 4. Handle REVISION (Hanya jika status WMS masih awal)
      else {
        if ([WMS_STATUS.PENDING, WMS_STATUS.VALIDATED].includes(existing.status)) {
          archives.push(existing.id);
          itemsToProcess.push(item);
        }
      }
    } else {
      // New Order
      if (![MP_STATUS.CANCELLED, MP_STATUS.RETURNED, "CANCELLED", "RETURNED"].includes(status)) {
        itemsToProcess.push(item);
      }
    }
  }

  // --- EKSEKUSI BATCH ACTIONS ---

  // Archives
  const uniqueArchiveIds = [...new Set(archives)];
  for (const id of uniqueArchiveIds) {
    await pickingRepo.archiveHeader(connection, id);
    await pickingRepo.cancelItemsByListId(connection, id);
  }

  // 2. Returns
  const uniqueHeaderIds = [...new Set(headerReturns)];
  for (const id of uniqueHeaderIds) {
    await pickingRepo.updateHeaderStatus(connection, id, WMS_STATUS.RETURNED, 1);
    await pickingRepo.updateMarketplaceStatus(connection, id, MP_STATUS.RETURNED);
  }

  // Update Items (Bulk vs Micro)
  const bulkReturnIds = [...new Set(itemReturns.filter((i) => i.isBulk).map((i) => i.listId))];
  for (const id of bulkReturnIds) {
    await pickingRepo.updateItemsStatusByListId(connection, id, WMS_STATUS.RETURNED);
  }

  const microReturns = itemReturns.filter((i) => !i.isBulk);
  for (const mr of microReturns) {
    // Cari item di DB berdasarkan ListID + SKU
    // Note: Kita query manual karena repo belum support spesifik by SKU+ListID update
    const [rows] = await connection.query(
      "SELECT id, quantity, status FROM picking_list_items WHERE picking_list_id = ? AND original_sku = ?",
      [mr.listId, mr.sku]
    );
    if (rows.length > 0) {
      const dbItem = rows[0];
      if (dbItem.status !== WMS_STATUS.RETURNED) {
        // Jika partial, kita beri catatan di notes agar Admin Gudang yang melakukan split/approve
        // Kita tidak melakukan split otomatis disini untuk keamanan data sync
        const note = `Partial Return Sync: ${mr.returnedQty} dari ${dbItem.quantity} pcs`;
        await pickingRepo.markItemAsReturned(connection, dbItem.id, "UNKNOWN", note);
      }
    }
  }

  // 3. Cancels
  const uniqueCancelIds = [...new Set(cancels)];
  for (const id of uniqueCancelIds) {
    await pickingRepo.cancelHeader(connection, id);
    await pickingRepo.cancelItemsByListId(connection, id);
    await pickingRepo.updateMarketplaceStatus(connection, id, MP_STATUS.CANCELLED);
  }

  // 4. Updates
  const processedIds = new Set();
  for (const u of updates) {
    if (processedIds.has(u.id)) continue;
    processedIds.add(u.id);
    // Support update status WMS jika ada (untuk kasus Revert Return)
    await pickingRepo.updateMarketplaceStatus(connection, u.id, u.mpStatus, u.wmsStatus);
  }

  return itemsToProcess;
}

/**
 * HELPER 2: Fetch Data Referensi
 */
export async function fetchReferenceData(connection, skus) {
  logTrace("FETCH_DATA", `Mengambil data untuk ${skus.length} SKU unik.`);
  if (!skus.length) skus.push("");

  const products = await productRepo.getProductsBySkus(connection, skus);
  const validProductMap = new Map(products.map((p) => [p.sku, p]));
  const packageIds = products.filter((p) => p.is_package).map((p) => p.id);
  const singleIds = products.filter((p) => !p.is_package).map((p) => p.id);
  let components = [];
  let componentLocs = [];
  if (packageIds.length > 0) {
    components = await productRepo.getBulkPackageComponents(connection, packageIds);
    const compIds = [...new Set(components.map((c) => c.component_product_id))];
    if (compIds.length > 0) {
      const stockSums = await locationRepo.getTotalStockByProductIds(
        connection,
        compIds,
        "DISPLAY"
      );
      const stockSumMap = new Map(stockSums.map((s) => [s.product_id, Number(s.qty)]));
      components = components.map((c) => ({
        ...c,
        component_stock_display: stockSumMap.get(c.component_product_id) || 0,
      }));
      componentLocs = await locationRepo.getLocationsByProductIds(connection, compIds, "DISPLAY");
    }
  }
  let singleLocs = [];
  if (singleIds.length > 0) {
    singleLocs = await locationRepo.getLocationsByProductIds(connection, singleIds, "DISPLAY");
  }
  const groupBy = (arr, key) => {
    const map = new Map();
    arr.forEach((i) => {
      if (!map.has(i[key])) map.set(i[key], []);
      map.get(i[key]).push(i);
    });
    return map;
  };
  return {
    validProductMap,
    locationsByProductId: groupBy(singleLocs, "product_id"),
    componentsByPackageId: groupBy(components, "package_product_id"),
    locationsByComponentId: groupBy(componentLocs, "product_id"),
  };
}

/**
 * HELPER 3: Logika Perhitungan Validasi
 */
export function calculateValidations(itemsToProcess, dbData) {
  logTrace("CALC", `Mulai kalkulasi validasi untuk ${itemsToProcess.length} item.`);
  const { validProductMap, componentsByPackageId, locationsByProductId, locationsByComponentId } =
    dbData;
  const validItems = [];
  const invalidSkus = [];

  // [CRITICAL] Agregasi Qty per SKU
  // Kita harus menjumlahkan total kebutuhan per SKU dari seluruh batch file upload.
  // Jika ada 3 order berbeda untuk "Produk A", stok harus dicek terhadap Total (3 pcs), bukan parsial.
  const qtyMap = new Map();
  itemsToProcess.forEach((item) => {
    const current = qtyMap.get(item.sku) || 0;
    qtyMap.set(item.sku, current + item.qty);
  });

  for (const item of itemsToProcess) {
    const product = validProductMap.get(item.sku);
    const qtyNeeded = qtyMap.get(item.sku);

    if (product) {
      let isItemValid = true;
      let errorMessage = "";
      let resultData = {};

      if (product.is_package) {
        const comps = componentsByPackageId.get(product.id);
        if (!comps?.length) {
          isItemValid = false;
          errorMessage = `${item.sku} (Paket Kosong)`;
        } else {
          const enrichedComponents = comps.map((c) => {
            const needed = qtyNeeded * c.quantity_per_package;
            const locs = locationsByComponentId.get(c.component_product_id) || [];
            const validLocs = locs.filter((l) => l.quantity >= needed);
            const suggestedLoc = validLocs[0]?.location_id || null;
            return {
              ...c,
              availableLocations: locs,
              suggestedLocationId: suggestedLoc,
              initialStatus: suggestedLoc ? WMS_STATUS.PENDING : "BACKORDER", // TODO: Review frontend handling
              qty_needed: needed,
            };
          });
          resultData = { components: enrichedComponents, availableLocations: [] };
        }
      } else {
        const locs = locationsByProductId.get(product.id) || [];
        const validLocs = locs.filter((l) => l.quantity >= qtyNeeded);
        const suggestedLoc = validLocs[0]?.location_id || null;
        resultData = {
          availableLocations: locs,
          suggestedLocationId: suggestedLoc,
          initialStatus: suggestedLoc ? WMS_STATUS.PENDING : "BACKORDER",
          components: null,
        };

        if (!suggestedLoc) {
          logTrace("CALC_INFO", `Item ${item.sku} stok kurang -> Status BACKORDER`);
        }
      }

      if (!isItemValid) {
        invalidSkus.push(errorMessage);
        continue;
      }

      validItems.push({
        sku: item.sku,
        qty: item.qty, // [CORRECT] Insert data per invoice, gunakan qty spesifik item tersebut
        name: product.name,
        is_package: !!product.is_package,
        invoiceNos: item.invoiceId ? [item.invoiceId] : [],
        customerNames: item.customer ? [item.customer] : [],
        ...resultData,
      });
    } else {
      invalidSkus.push(`${item.sku} (SKU 404)`);
    }
  }
  return { validItems, invalidSkus };
}

/**
 * HELPER 4: Insert Header Transaksi
 */
export async function insertPickingHeader(connection, meta) {
  return await pickingRepo.createHeader(connection, {
    userId: meta.userId,
    source: meta.source,
    invoiceId: meta.originalInvoiceId,
    customer: meta.customerName,
    orderDate: meta.orderDate,
    status: WMS_STATUS.PENDING,
    mpStatus: meta.status || MP_STATUS.NEW,
    filename: meta.originalFilename,
  });
}

/**
 * HELPER 5: Insert Item Transaksi
 */
export async function insertPickingItems(connection, pickingListId, validItems, productMap) {
  logTrace("INSERT_ITEMS", `Menyimpan ${validItems.length} item ke DB...`);
  const rows = [];
  for (const item of validItems) {
    if (item.is_package) {
      item.components.forEach((c) => {
        rows.push([
          pickingListId,
          c.component_product_id,
          item.sku,
          item.qty * c.quantity_per_package,
          c.initialStatus || WMS_STATUS.PENDING,
          c.suggestedLocationId,
        ]);
      });
    } else {
      const pid = productMap.get(item.sku).id;
      rows.push([
        pickingListId,
        pid,
        item.sku,
        item.qty,
        item.initialStatus || WMS_STATUS.PENDING,
        item.suggestedLocationId,
      ]);
    }
  }
  if (rows.length > 0) {
    await pickingRepo.createItemsBulk(connection, rows);
  }
}

/**
 * HELPER 6: Enrich Component Data
 */
export function enrichComponentWithStock(comp, packageQty, dbData) {
  const needed = packageQty * comp.quantity_per_package;
  const locs = dbData.locationsByComponentId.get(comp.component_product_id) || [];
  const validLocs = locs.filter((l) => l.quantity >= needed);
  return {
    ...comp,
    qty_needed: needed,
    availableLocations: locs,
    suggestedLocationId: validLocs[0]?.location_id || null,
  };
}
