// backend/services/helpers/pickingValidationHelper.js
import * as locationRepo from "../../repositories/locationRepository.js";
import * as productRepo from "../../repositories/productRepository.js";
import * as pickingRepo from "../../repositories/pickingRepository.js";

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
 * HELPER 1: Smart Upsert Logic
 * Mengecek invoice yang sudah ada di DB untuk menentukan apakah perlu Update/Cancel/Revisi.
 * [REFACTORED] Menggunakan Repository sepenuhnya.
 */
export async function handleExistingInvoices(connection, items) {
  logTrace("UPSERT", `Menerima ${items.length} item untuk dicek.`);

  const invoiceIds = items.map((i) => i.invoiceId).filter((id) => id);

  if (!invoiceIds.length) {
    logTrace("UPSERT", "⚠️ Tidak ada Invoice ID yang terdeteksi di payload item.");
    return [...items];
  }

  // Gunakan Repo untuk batch select
  const existingLists = await pickingRepo.getActiveHeadersByInvoiceIds(connection, invoiceIds);

  const existingMap = new Map(existingLists.map((row) => [row.original_invoice_id, row]));
  const itemsToProcess = [];
  const updates = [];

  for (const item of items) {
    const existing = existingMap.get(item.invoiceId);
    if (existing) {
      if (item.status === "CANCELLED") {
        updates.push({ id: existing.id, status: "CANCELLED", active: null });
      } else if (["SHIPPED", "COMPLETED"].includes(item.status)) {
        updates.push({ id: existing.id, status: "COMPLETED", active: null });
      } else {
        // Revisi: Matikan yang lama, proses yang baru
        updates.push({ id: existing.id, status: "CANCELLED", active: null });
        itemsToProcess.push(item);
      }
    } else {
      if (!item.status || ["PENDING", "SHIPPED", "COMPLETED"].includes(item.status)) {
        itemsToProcess.push(item);
      }
    }
  }

  // Eksekusi Update Batch via Repo
  if (updates.length > 0) {
    await connection.beginTransaction();
    const processedIds = new Set();
    for (const u of updates) {
      if (processedIds.has(u.id)) continue;
      processedIds.add(u.id);

      // Update Header & Items via Repo
      await pickingRepo.updateHeaderStatus(connection, u.id, u.status, u.active);
      await pickingRepo.updateItemsStatusByListId(connection, u.id, u.status);
    }
    await connection.commit();
  }

  return itemsToProcess;
}

/**
 * HELPER 2: Fetch Data Referensi
 * Menggunakan ProductRepository & LocationRepository
 */
export async function fetchReferenceData(connection, skus) {
  logTrace("FETCH_DATA", `Mengambil data untuk ${skus.length} SKU unik.`);

  if (!skus.length) skus.push("");

  // Ambil Data Produk (via Repo)
  const products = await productRepo.getProductsBySkus(connection, skus);

  const validProductMap = new Map(products.map((p) => [p.sku, p]));
  const packageIds = products.filter((p) => p.is_package).map((p) => p.id);
  const singleIds = products.filter((p) => !p.is_package).map((p) => p.id);

  let components = [];
  let componentLocs = [];

  if (packageIds.length > 0) {
    // Ambil struktur paket
    components = await productRepo.getBulkPackageComponents(connection, packageIds);

    const compIds = [...new Set(components.map((c) => c.component_product_id))];
    if (compIds.length > 0) {
      // Ambil Total Stok Display untuk Validasi Cepat (via Repo)
      const stockSums = await locationRepo.getTotalStockByProductIds(
        connection,
        compIds,
        "DISPLAY"
      );
      const stockSumMap = new Map(stockSums.map((s) => [s.product_id, Number(s.qty)]));

      // Map stok ke object component
      components = components.map((c) => ({
        ...c,
        component_stock_display: stockSumMap.get(c.component_product_id) || 0,
      }));

      // Ambil Detail Lokasi Komponen (Strict Display via Repo)
      componentLocs = await locationRepo.getLocationsByProductIds(connection, compIds, "DISPLAY");
    }
  }

  // Single Items Locations
  let singleLocs = [];
  if (singleIds.length > 0) {
    // Strict Display Only
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

  const qtyMap = new Map(itemsToProcess.map((item) => [item.sku, item.qty]));

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
            return {
              ...c,
              availableLocations: locs,
              suggestedLocationId: validLocs[0]?.location_id || null,
            };
          });
          resultData = { components: enrichedComponents, availableLocations: [] };
        }
      } else {
        const locs = locationsByProductId.get(product.id) || [];
        const totalStock = locs.reduce((sum, l) => sum + l.quantity, 0);

        if (totalStock < qtyNeeded) {
          logTrace("CALC_WARN", `Stok Display Kurang untuk ${item.sku}.`);
        }

        const validLocs = locs.filter((l) => l.quantity >= qtyNeeded);
        resultData = {
          availableLocations: locs,
          suggestedLocationId: validLocs[0]?.location_id || null,
          components: null,
        };
      }

      if (!isItemValid) {
        invalidSkus.push(errorMessage);
        continue;
      }

      validItems.push({
        sku: item.sku,
        qty: qtyNeeded,
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
    status: "PENDING",
    mpStatus: meta.status,
    filename: meta.originalFilename,
  });
}

/**
 * HELPER 5: Insert Item Transaksi
 * [REFACTORED] Menggunakan pickingRepo.createItemsBulk
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
          "PENDING",
          c.suggestedLocationId,
        ]);
      });
    } else {
      const pid = productMap.get(item.sku).id;
      rows.push([pickingListId, pid, item.sku, item.qty, "PENDING", item.suggestedLocationId]);
    }
  }

  if (rows.length > 0) {
    // Gunakan fungsi bulk insert di Repository
    await pickingRepo.createItemsBulk(connection, rows);
  }
}
