import db from "../config/db.js";
import { broadcastStockUpdate } from "../router/realtimeRouter.js"; // Diperlukan untuk konfirmasi/void
import {
  processPickingListConfirmation,
  processPickingListVoid,
  getLatestStockForBroadcast,
} from "../services/pickingService.js"; // Diperlukan untuk konfirmasi/void

// =================================================================================
// FUNGSI INTERNAL BARU (HASIL REFACTOR)
// =================================================================================

/**
 * Fungsi inti yang menjalankan semua validasi, pencarian lokasi,
 * dan pembuatan picking list di database.
 * @param {object} data - Payload untuk validasi.
 * @param {Array<object>} data.items - Array item ( {sku, qty} )
 * @param {number} data.userId - ID pengguna
 * @param {string} data.source - Sumber ('Tokopedia', 'CSV_BATCH', dll)
 * @param {string} data.originalFilename - Nama file asli
 * @returns {Promise<object>} - Objek validationResults untuk frontend
 */
async function performPickingValidation({ items, userId, source, originalFilename }) {
  let connection;
  try {
    // --- 1. DAPATKAN KONEKSI (DI LUAR TRANSAKSI) ---
    connection = await db.getConnection();

    const skus = items.map((item) => item.sku);
    const qtyMap = new Map(items.map((item) => [item.sku, item.qty])); // --- 2. SEMUA OPERASI BACA (SELECT) DILAKUKAN DI SINI --- // 2a. Dapatkan info produk

    const [productRows] = await connection.query(
      `SELECT id, sku, name, is_package
         FROM products
         WHERE sku IN (?) AND is_active = TRUE`,
      [skus]
    );

    const validProductMap = new Map(productRows.map((p) => [p.sku, p]));
    const packageProductIds = productRows.filter((p) => p.is_package).map((p) => p.id);
    const singleProductIds = productRows.filter((p) => !p.is_package).map((p) => p.id); // 2b. Dapatkan lokasi untuk PRODUK TUNGGAL

    const [singleLocationRows] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
         FROM stock_locations sl
         JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY'
         ORDER BY sl.product_id, sl.quantity ASC`,
      [singleProductIds.length > 0 ? singleProductIds : [0]]
    ); // 2c. Dapatkan info KOMPONEN

    const [componentInfoRows] = await connection.query(
      `SELECT
            pc.package_product_id, pc.quantity_per_package, pc.component_product_id,
            p_comp.sku as component_sku, p_comp.name as component_name,
            COALESCE(sl_comp.quantity, 0) as component_stock_display
         FROM package_components pc
         JOIN products p_comp ON pc.component_product_id = p_comp.id
         LEFT JOIN (
           SELECT sl.product_id, SUM(sl.quantity) as quantity
           FROM stock_locations sl
           JOIN locations l ON sl.location_id = l.id
           WHERE l.purpose = 'DISPLAY'
           GROUP BY sl.product_id
         ) sl_comp ON p_comp.id = sl_comp.product_id
         WHERE pc.package_product_id IN (?)`,
      [packageProductIds.length > 0 ? packageProductIds : [0]]
    );

    const allComponentProductIds = [
      ...new Set(componentInfoRows.map((c) => c.component_product_id)),
    ]; // 2d. Dapatkan lokasi untuk KOMPONEN

    const [componentLocationRows] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
         FROM stock_locations sl
         JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY'
         ORDER BY sl.product_id, sl.quantity ASC`,
      [allComponentProductIds.length > 0 ? allComponentProductIds : [0]]
    ); // --- 3. PROSES DATA (MAP) ---

    const locationsByProductId = new Map();
    for (const loc of singleLocationRows) {
      if (!locationsByProductId.has(loc.product_id)) locationsByProductId.set(loc.product_id, []);
      locationsByProductId.get(loc.product_id).push(loc);
    }

    const componentsByPackageId = new Map();
    for (const comp of componentInfoRows) {
      if (!componentsByPackageId.has(comp.package_product_id))
        componentsByPackageId.set(comp.package_product_id, []);
      componentsByPackageId.get(comp.package_product_id).push(comp);
    }

    const locationsByComponentId = new Map();
    for (const loc of componentLocationRows) {
      if (!locationsByComponentId.has(loc.product_id))
        locationsByComponentId.set(loc.product_id, []);
      locationsByComponentId.get(loc.product_id).push(loc);
    } // --- 4. MULAI TRANSAKSI (OPERASI TULIS) --- // [PERBAIKAN] Dipindah setelah semua SELECT

    await connection.beginTransaction(); // 4a. Buat Picking List

    const [pickingListResult] = await connection.query(
      "INSERT INTO picking_lists (user_id, source, original_filename, status) VALUES (?, ?, ?, ?)",
      [userId, source, originalFilename, "PENDING_VALIDATION"]
    );
    const pickingListId = pickingListResult.insertId;

    const validationResults = { pickingListId, validItems: [], invalidSkus: [] }; // 4b. Loop & Bangun Respons

    for (const item of items) {
      const product = validProductMap.get(item.sku);
      const qtyNeeded = qtyMap.get(item.sku);

      if (product) {
        let allLocations = [];
        let suggestedLocationId = null;
        let isItemValid = true;
        let errorMessage = "";
        let enrichedComponents = null;

        if (product.is_package) {
          const componentsData = componentsByPackageId.get(product.id);
          if (!componentsData || componentsData.length === 0) {
            isItemValid = false;
            errorMessage = `${item.sku} (Paket tidak memiliki komponen)`;
          } else {
            enrichedComponents = [];
            for (const comp of componentsData) {
              const componentQtyNeeded = qtyNeeded * comp.quantity_per_package;
              const compLocations = locationsByComponentId.get(comp.component_product_id) || [];
              const availableCompLocations = compLocations.filter(
                (loc) => loc.quantity >= componentQtyNeeded
              );
              const suggestedCompLocId =
                availableCompLocations.length > 0 ? availableCompLocations[0].location_id : null;

              enrichedComponents.push({
                ...comp,
                availableLocations: compLocations,
                suggestedLocationId: suggestedCompLocId,
              });
            }
          }
        } else {
          // Item Tunggal
          allLocations = locationsByProductId.get(product.id) || [];
          const availableLocations = allLocations.filter((loc) => loc.quantity >= qtyNeeded);
          suggestedLocationId =
            availableLocations.length > 0 ? availableLocations[0].location_id : null;
        }

        if (!isItemValid) {
          validationResults.invalidSkus.push(errorMessage);
          continue;
        }

        validationResults.validItems.push({
          sku: item.sku,
          qty: qtyNeeded,
          name: product.name,
          is_package: product.is_package,
          components: enrichedComponents,
          availableLocations: allLocations,
          suggestedLocationId: suggestedLocationId,
        });
      } else {
        validationResults.invalidSkus.push(`${item.sku} (SKU tidak ditemukan di database)`);
      }
    } // --- 4c. Buat Payload 'itemsToInsert' (BARU) --- // [PERBAIKAN] Kita buat ini dari 'validationResults.validItems' agar SKU-nya "datar" (flat)

    const itemsToInsert = [];
    for (const item of validationResults.validItems) {
      if (item.is_package) {
        // Jika paket, masukkan komponen-komponennya
        if (item.components) {
          item.components.forEach((comp) => {
            itemsToInsert.push([
              pickingListId,
              comp.component_product_id, // ID Produk Komponen
              comp.component_sku, // SKU Komponen
              item.qty * comp.quantity_per_package, // Qty Komponen
              comp.suggestedLocationId, // Saran Lokasi Komponen
            ]);
          });
        }
      } else {
        // Jika item tunggal, masukkan seperti biasa
        const product = validProductMap.get(item.sku); // Ambil ID produk dari map
        if (product) {
          itemsToInsert.push([
            pickingListId,
            product.id, // ID Produk
            item.sku, // SKU
            item.qty, // Qty
            item.suggestedLocationId, // Saran Lokasi
          ]);
        }
      }
    } // 4d. Bulk Insert Item

    if (itemsToInsert.length > 0) {
      await connection.query(
        "INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, suggested_location_id) VALUES ?",
        [itemsToInsert]
      );
    } // --- 5. SELESAI TRANSAKSI ---

    await connection.commit();
    return validationResults;
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error selama performPickingValidation:", error); // Lempar error agar bisa ditangkap oleh (req, res) handler
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// =================================================================================
// CONTROLLERS (YANG SUDAH DI-REFACTOR)
// =================================================================================

/**
 * [HYBRID CSV] Menerima data JSON 'Tagihan (CSV)' yang sudah di-parse.
 * ✅ REFAKTOR: Sekarang hanya bertugas agregasi data dan memanggil performPickingValidation.
 */
export const uploadJsonInvoices = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { invoices, filename } = req.body;
  if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ success: false, message: "Data invoice tidak valid." });
  }

  try {
    // --- START: Agregasi Item (Menggabungkan semua invoice) ---
    const aggregatedItemsMap = new Map();
    let source = "CSV_BATCH"; // Default source
    if (invoices.length > 0 && invoices[0].source) {
      source = invoices[0].source;
    }

    for (const invoiceData of invoices) {
      for (const item of invoiceData.items) {
        const qty = Number(item.quantity);
        if (isNaN(qty) || qty <= 0) continue;

        const existingQty = aggregatedItemsMap.get(item.sku) || 0; // [PERBAIKAN BUG] Logika agregasi diperbaiki
        aggregatedItemsMap.set(item.sku, existingQty + qty);
      }
    }

    const items = Array.from(aggregatedItemsMap, ([sku, qty]) => ({ sku, qty }));
    if (items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Tidak ada item valid untuk diproses." });
    } // --- END: Agregasi Item --- // --- Panggil Fungsi Inti ---
    const originalFilename =
      filename || `Batch ${source} - ${new Date().toLocaleDateString("id-ID")}`;

    const validationResults = await performPickingValidation({
      items,
      userId,
      source,
      originalFilename,
    }); // --- Kirim respons validasi ---

    res.status(200).json({ success: true, data: validationResults });
  } catch (error) {
    // Error sudah di-log oleh performPickingValidation
    res.status(500).json({
      success: false,
      message: error.message || "Gagal memproses data invoice.",
    });
  }
};

/**
 * [HYBRID PDF] Menerima hasil parsing PDF (Tokopedia/Shopee) dari client-side.
 * ✅ REFAKTOR: Sekarang hanya memanggil performPickingValidation.
 */
export const validateParsedData = async (req, res) => {
  const { source, items, filename } = req.body;
  const userId = req.user.id;

  if (!source || !["Tokopedia", "Shopee"].includes(source)) {
    return res.status(400).json({ success: false, message: "Sumber tidak valid." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Daftar item tidak boleh kosong." });
  }

  try {
    const originalFilename = filename || `parsed_${source}_${Date.now()}`; // --- Panggil Fungsi Inti ---

    const validationResults = await performPickingValidation({
      items,
      userId,
      source,
      originalFilename,
    });

    res.status(200).json({ success: true, data: validationResults });
  } catch (error) {
    // Error sudah di-log oleh performPickingValidation
    res.status(500).json({
      success: false,
      message: error.message || "Gagal validasi data picking list di server.",
    });
  }
};

// =================================================================================
// CONTROLLER LAINNYA
// =================================================================================

/**
 * Konfirmasi picking list dan kurangi stok dari lokasi 'DISPLAY'.
 */
export const confirmPickingList = async (req, res) => {
  const { id } = req.params;
  const items = req.body.items;
  const userId = req.user.id;
  const SOURCE_LOCATION_PURPOSE = "DISPLAY";

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Tidak ada item untuk diproses." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [sourceLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ?`,
      [SOURCE_LOCATION_PURPOSE]
    );
    if (sourceLocationRows.length === 0) {
      throw new Error(`Lokasi sumber '${SOURCE_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const allDisplayLocationIds = sourceLocationRows.map((loc) => loc.id);

    const affectedProductIds = await processPickingListConfirmation(connection, items, userId, id);

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["COMPLETED", id]);
    await connection.commit();

    const affectedProductIdsArray = [...affectedProductIds];
    if (affectedProductIdsArray.length > 0) {
      for (const locId of allDisplayLocationIds) {
        const finalUpdates = await getLatestStockForBroadcast(affectedProductIdsArray, locId);
        if (finalUpdates.length > 0) {
          broadcastStockUpdate(finalUpdates);
        }
      }
    }
    res.status(200).json({
      success: true,
      message: `Berhasil memproses ${items.length} item. Stok telah diperbarui.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat konfirmasi picking list:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal mengonfirmasi picking list." });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Membatalkan (void) picking list yang sudah 'COMPLETED' dan kembalikan stok.
 */
export const voidPickingList = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const TARGET_LOCATION_PURPOSE = "DISPLAY";

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [listRows] = await connection.query(
      "SELECT status FROM picking_lists WHERE id = ? FOR UPDATE",
      [id]
    );
    if (listRows.length === 0) throw new Error(`Picking list ID ${id} tidak ditemukan.`);
    if (listRows[0].status !== "COMPLETED")
      throw new Error("Hanya picking list 'COMPLETED' yang bisa di-void.");

    const [targetLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ?`,
      [TARGET_LOCATION_PURPOSE]
    );
    if (targetLocationRows.length === 0) {
      throw new Error(`Lokasi target '${TARGET_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const allDisplayLocationIds = targetLocationRows.map((loc) => loc.id);

    const affectedProductIdsVoid = await processPickingListVoid(connection, id, userId);
    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);
    await connection.commit();

    const affectedProductIdsVoidArray = [...affectedProductIdsVoid];
    if (affectedProductIdsVoidArray.length > 0) {
      for (const locId of allDisplayLocationIds) {
        const finalUpdatesVoid = await getLatestStockForBroadcast(
          affectedProductIdsVoidArray,
          locId
        );
        if (finalUpdatesVoid.length > 0) {
          broadcastStockUpdate(finalUpdatesVoid);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Transaksi picking list berhasil di-void dan stok telah dikembalikan.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat void picking list:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan transaksi." });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * [BARU] Menambahkan kembali endpoint 'cancel' yang hilang
 */
export const cancelPendingPickingList = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [listRows] = await connection.query(
      "SELECT status FROM picking_lists WHERE id = ? FOR UPDATE",
      [id]
    );
    if (listRows.length === 0) {
      throw new Error(`Picking list ID ${id} tidak ditemukan.`);
    }

    const currentStatus = listRows[0].status;
    if (currentStatus !== "PENDING" && currentStatus !== "PENDING_VALIDATION") {
      throw new Error(
        `Hanya list dengan status 'PENDING' atau 'PENDING_VALIDATION' yang bisa dibatalkan.`
      );
    }

    await connection.query(
      `INSERT INTO audit_logs (user_id, action_type, target_table, target_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        "CANCEL_PICKING_LIST",
        "picking_lists",
        id,
        `Membatalkan picking list #${id} (status: ${currentStatus})`,
      ]
    );

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);
    await connection.commit();

    res.status(200).json({
      success: true,
      message: `Picking list #${id} berhasil dibatalkan.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`Error saat membatalkan picking list pending #${id}:`, error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan picking list." });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Mengambil riwayat picking list.
 */
export const getPickingHistory = async (req, res) => {
  try {
    const query = `
        SELECT pl.id, pl.source, pl.status, pl.created_at, u.username, pl.original_filename
        FROM picking_lists pl
        JOIN users u ON pl.user_id = u.id
        ORDER BY pl.created_at DESC
        LIMIT 100;
      `;
    const [history] = await db.query(query.trim()); // [PERBAIKAN] Memanggil .trim()
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error saat mengambil riwayat picking list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat." });
  }
};

/**
 * Mengambil detail item dari sebuah picking list.
 * ✅ REFAKTOR: Bug 'component_product_id: undefined' dan 'NaN' telah diperbaiki.
 */
export const getPickingListDetails = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection(); // 1. Dapatkan item dari list // [PERBAIKAN] Ambil SKU fisik (product_id) BUKAN original_sku

    const [items] = await connection.query(
      `SELECT pli.original_sku, pli.quantity, p.id as product_id, p.is_package
        FROM picking_list_items pli
        JOIN products p ON pli.product_id = p.id
        WHERE pli.picking_list_id = ?`,
      [id]
    );
    if (items.length === 0) return res.json({ success: true, data: [] }); // Buat Peta SKU -> Qty (Berdasarkan original_sku untuk item paket)

    const qtyMap = new Map();
    for (const item of items) {
      const key = item.original_sku;
      const currentQty = qtyMap.get(key) || 0; // Jika ini item paket, kita ambil qty dari item pertama (karena semua komponen akan memiliki qty paket yang sama)
      if (!qtyMap.has(key)) {
        qtyMap.set(key, item.quantity);
      }
    }

    const skus = [...new Set(items.map((item) => item.original_sku))]; // 2. Dapatkan info produk (berdasarkan original_sku)

    const [productRows] = await connection.query(
      `SELECT id, sku, name, is_package
        FROM products
        WHERE sku IN (?) AND is_active = TRUE`,
      [skus]
    );

    const validProductMap = new Map(productRows.map((p) => [p.sku, p]));
    const packageProductIdsInList = productRows.filter((p) => p.is_package).map((p) => p.id); // Dapatkan SEMUA ID produk fisik (termasuk komponen) dari list
    const allPhysicalProductIds = [...new Set(items.map((item) => item.product_id))]; // 3. Dapatkan lokasi untuk ITEM TUNGGAL (dan Komponen) // [PERBAIKAN] Ambil lokasi untuk SEMUA produk fisik yang terlibat

    const [locationRows] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
        FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY' AND sl.quantity > 0
        ORDER BY sl.product_id, sl.quantity ASC`,
      [allPhysicalProductIds.length > 0 ? allPhysicalProductIds : [0]]
    ); // 4. Dapatkan info KOMPONEN // [PERBAIKAN BUG] Tambahkan 'pc.component_product_id AS component_id'

    const [componentRows] = await connection.query(
      `SELECT
           pc.package_product_id, pc.quantity_per_package,
           pc.component_product_id AS component_id,
           p_comp.sku as component_sku, p_comp.name as component_name,
           COALESCE(sl_comp.quantity, 0) as component_stock_display
         FROM package_components pc
         JOIN products p_comp ON pc.component_product_id = p_comp.id
         LEFT JOIN (
           SELECT sl.product_id, SUM(sl.quantity) as quantity
           FROM stock_locations sl
           JOIN locations l ON sl.location_id = l.id
           WHERE l.purpose = 'DISPLAY'
           GROUP BY sl.product_id
         ) sl_comp ON p_comp.id = sl_comp.product_id
         WHERE pc.package_product_id IN (?)`,
      [packageProductIdsInList.length > 0 ? packageProductIdsInList : [0]]
    ); // 5. Dapatkan ID & Lokasi untuk SEMUA KOMPONEN (Sudah diambil di Langkah 3)

    // const allComponentProductIds = [...new Set(componentRows.map((row) => row.component_id))]; // const [componentLocationRows] = ... (TIDAK PERLU LAGI) // --- 6. Proses Pemetaan Data --- // Map Lokasi (untuk Item Tunggal dan Komponen)
    const locationsByProductId = new Map();
    for (const loc of locationRows) {
      if (!locationsByProductId.has(loc.product_id)) locationsByProductId.set(loc.product_id, []);
      locationsByProductId.get(loc.product_id).push(loc);
    } // Map Info Komponen

    const componentsByProductId = new Map();
    for (const comp of componentRows) {
      if (!componentsByProductId.has(comp.package_product_id))
        componentsByProductId.set(comp.package_product_id, []);
      componentsByProductId.get(comp.package_product_id).push(comp);
    } // --- 7. Loop Terakhir (Membangun Respons) ---

    const detailedItems = []; // Gunakan 'skus' (daftar unik original_sku) untuk membangun respons
    for (const sku of skus) {
      const product = validProductMap.get(sku);
      const qtyNeeded = qtyMap.get(sku); // Ini adalah Qty Paket (jika paket) atau Qty Item

      if (product) {
        let finalComponents = componentsByProductId.get(product.id) || null;
        let allLocations = [];
        let suggestedLocationId = null;

        if (product.is_package && finalComponents) {
          // Enrichment untuk Komponen Paket
          finalComponents = finalComponents.map((comp) => {
            const componentId = comp.component_id || comp.component_product_id; // [PERBAIKAN BUG NaN] Gunakan 'qtyNeeded' (Qty paket)
            const componentQtyNeeded = qtyNeeded * comp.quantity_per_package;
            const compLocations = locationsByProductId.get(componentId) || [];

            const availableCompLocations = compLocations.filter(
              (loc) => loc.quantity >= componentQtyNeeded
            );
            const suggestedCompLocId =
              availableCompLocations.length > 0 ? availableCompLocations[0].location_id : null;

            return {
              ...comp,
              availableLocations: compLocations,
              suggestedLocationId: suggestedCompLocId,
            };
          });
        } else if (!product.is_package) {
          // Info Lokasi Item Tunggal
          allLocations = locationsByProductId.get(product.id) || [];
          const availableLocations = allLocations.filter((loc) => loc.quantity >= qtyNeeded);
          suggestedLocationId =
            availableLocations.length > 0 ? availableLocations[0].location_id : null;
        }

        detailedItems.push({
          sku: product.sku, // Gunakan original_sku (product.sku)
          name: product.name,
          qty: qtyNeeded,
          is_package: product.is_package,
          components: finalComponents,
          availableLocations: allLocations,
          suggestedLocationId: suggestedLocationId,
        });
      }
    }

    res.json({ success: true, data: detailedItems });
  } catch (error) {
    console.error(`Error saat mengambil detail picking list #${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail item." });
  } finally {
    if (connection) connection.release();
  }
};
