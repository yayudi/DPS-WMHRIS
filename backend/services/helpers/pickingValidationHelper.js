// backend\services\helpers\pickingValidationHelper.js
import db from "../../config/db.js";

// ==============================================================================
// 🔍 DEBUGGER HELPER
// ==============================================================================
const DEBUG = true; // Set false jika sudah selesai investigasi
function logTrace(stage, message, data = null) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(`[${timestamp}][${stage}] ${message}`);
  if (data) console.dir(data, { depth: 2, colors: true });
}

/**
 * HELPER 1: Smart Upsert Logic
 */
export async function handleExistingInvoices(connection, items) {
  logTrace("UPSERT", `Menerima ${items.length} item untuk dicek.`);

  const invoiceIds = items.map((i) => i.invoiceId).filter((id) => id);

  if (!invoiceIds.length) {
    logTrace("UPSERT", "⚠️ Tidak ada Invoice ID yang terdeteksi di payload item.");
    return [...items];
  }

  // Cari invoice AKTIF
  logTrace("UPSERT", `Mencari invoice existing: ${invoiceIds.slice(0, 3).join(", ")}...`);
  const [existingLists] = await connection.query(
    `SELECT id, original_invoice_id, status FROM picking_lists WHERE original_invoice_id IN (?) AND is_active = 1`,
    [invoiceIds]
  );

  logTrace("UPSERT", `Ditemukan ${existingLists.length} invoice aktif di DB.`);

  const existingMap = new Map(existingLists.map((row) => [row.original_invoice_id, row]));
  const itemsToProcess = [];
  const updates = [];

  for (const item of items) {
    const existing = existingMap.get(item.invoiceId);

    // Logika Decision Making
    if (existing) {
      logTrace(
        "UPSERT",
        `Invoice ${item.invoiceId} SUDAH ADA. Status DB: ${existing.status} | Status File: ${
          item.status || "KOSONG"
        }`
      );

      if (item.status === "CANCELLED") {
        updates.push({ id: existing.id, status: "CANCELLED", active: null });
      } else if (["SHIPPED", "COMPLETED"].includes(item.status)) {
        updates.push({ id: existing.id, status: "COMPLETED", active: null });
      } else {
        // REVISI: Matikan lama, masukkan baru
        logTrace(
          "UPSERT",
          `👉 REVISI TERDETEKSI: ${item.invoiceId} akan di-soft-delete dan diproses ulang.`
        );
        updates.push({ id: existing.id, status: "CANCELLED", active: null });
        itemsToProcess.push(item);
      }
    } else {
      // BARU
      if (!item.status || ["PENDING", "SHIPPED", "COMPLETED"].includes(item.status)) {
        itemsToProcess.push(item);
      } else {
        logTrace("UPSERT", `⚠️ Item ${item.sku} diabaikan karena status file: ${item.status}`);
      }
    }
  }

  logTrace(
    "UPSERT",
    `Ringkasan: ${itemsToProcess.length} item diproses baru, ${updates.length} item update status lama.`
  );

  if (updates.length > 0) {
    await connection.beginTransaction();
    const processedIds = new Set();
    for (const u of updates) {
      if (processedIds.has(u.id)) continue;
      processedIds.add(u.id);
      await connection.query(`UPDATE picking_lists SET status = ?, is_active = ? WHERE id = ?`, [
        u.status,
        u.active,
        u.id,
      ]);
      await connection.query(`UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`, [
        u.status,
        u.id,
      ]);
    }
    await connection.commit();
  }

  return itemsToProcess;
}

/**
 * HELPER 2: Fetch Data Referensi
 */
export async function fetchReferenceData(connection, skus) {
  logTrace("FETCH_DATA", `Mengambil data untuk ${skus.length} SKU unik.`);

  if (!skus.length) skus.push("");

  // Products
  const [products] = await connection.query(
    `SELECT id, sku, name, is_package FROM products WHERE sku IN (?) AND is_active = 1`,
    [skus]
  );
  logTrace("FETCH_DATA", `Ditemukan ${products.length} produk di Master Produk.`);

  const validProductMap = new Map(products.map((p) => [p.sku, p]));

  const packageIds = products.filter((p) => p.is_package).map((p) => p.id);
  const singleIds = products.filter((p) => !p.is_package).map((p) => p.id);

  // Components
  let components = [];
  let componentLocs = [];
  if (packageIds.length > 0) {
    [components] = await connection.query(
      `SELECT pc.package_product_id, pc.quantity_per_package, pc.component_product_id,
              p.sku as component_sku, p.name as component_name,
              COALESCE(sl_sum.qty, 0) as component_stock_display
       FROM package_components pc
       JOIN products p ON pc.component_product_id = p.id
       LEFT JOIN (
         SELECT product_id, SUM(quantity) as qty FROM stock_locations sl JOIN locations l ON sl.location_id = l.id WHERE l.purpose = 'DISPLAY' GROUP BY product_id
       ) sl_sum ON p.id = sl_sum.product_id
       WHERE pc.package_product_id IN (?)`,
      [packageIds]
    );
    const compIds = [...new Set(components.map((c) => c.component_product_id))];
    if (compIds.length > 0) {
      [componentLocs] = await connection.query(
        `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
         FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY' ORDER BY sl.quantity ASC`,
        [compIds]
      );
    }
  }

  // Single Items Locations
  let singleLocs = [];
  if (singleIds.length > 0) {
    [singleLocs] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
       FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
       WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY' ORDER BY sl.quantity ASC`,
      [singleIds]
    );
  }

  logTrace(
    "FETCH_DATA",
    `Stok ditemukan: ${singleLocs.length} lokasi single, ${componentLocs.length} lokasi komponen.`
  );

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
          errorMessage = `${item.sku} (Paket Kosong - Tidak ada resep)`;
          logTrace("CALC_ERROR", errorMessage);
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
        // [LOGIC CHECK] Apakah stok cukup?
        const totalStock = locs.reduce((sum, l) => sum + l.quantity, 0);

        if (totalStock < qtyNeeded) {
          logTrace(
            "CALC_WARN",
            `Stok Kurang untuk ${item.sku}. Butuh: ${qtyNeeded}, Ada: ${totalStock}`
          );
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
      invalidSkus.push(`${item.sku} (SKU 404 - Tidak ada di Master Produk)`);
      logTrace("CALC_ERROR", `SKU ${item.sku} tidak ditemukan di DB.`);
    }
  }

  logTrace("CALC_RESULT", `Valid: ${validItems.length}, Invalid: ${invalidSkus.length}`);
  return { validItems, invalidSkus };
}

/**
 * HELPER 4: Insert Header Transaksi
 */
export async function insertPickingHeader(connection, meta) {
  logTrace("INSERT_HEADER", `Membuat header picking list untuk user ${meta.userId}`);
  const [res] = await connection.query(
    `INSERT INTO picking_lists (user_id, source, original_filename, status, original_invoice_id, customer_name, order_date, is_active)
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?, 1)`,
    [
      meta.userId,
      meta.source,
      meta.originalFilename,
      meta.originalInvoiceId,
      meta.customerName,
      meta.orderDate,
    ]
  );
  return res.insertId;
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
          c.suggestedLocationId,
        ]);
      });
    } else {
      const pid = productMap.get(item.sku).id;
      rows.push([pickingListId, pid, item.sku, item.qty, item.suggestedLocationId]);
    }
  }
  if (rows.length > 0) {
    await connection.query(
      `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, suggested_location_id) VALUES ?`,
      [rows]
    );
  }
}

/**
 * HELPER 6: Enrich Component Data (Untuk Detail View)
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
