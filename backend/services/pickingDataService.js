// backend\services\pickingDataService.js
import db from "../config/db.js";

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
export async function performPickingValidation({
  items,
  userId,
  source,
  originalFilename,
  originalInvoiceId,
  customerName,
}) {
  let connection;
  try {
    // 1. Dapatkan Koneksi (Di Luar Transaksi)
    connection = await db.getConnection();

    const skus = items.map((item) => item.sku);
    const qtyMap = new Map(items.map((item) => [item.sku, item.qty])); // 2. Operasi Baca (SELECT)

    const [productRows] = await connection.query(
      `SELECT id, sku, name, is_package
         FROM products
         WHERE sku IN (?) AND is_active = TRUE`,
      [skus]
    );

    const validProductMap = new Map(productRows.map((p) => [p.sku, p]));
    const packageProductIds = productRows.filter((p) => p.is_package).map((p) => p.id);
    const singleProductIds = productRows.filter((p) => !p.is_package).map((p) => p.id);

    const [singleLocationRows] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
         FROM stock_locations sl
         JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY'
         ORDER BY sl.product_id, sl.quantity ASC`,
      [singleProductIds.length > 0 ? singleProductIds : [0]]
    );

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
    ];

    console.log("--- TES RESTART SERVER v2 --- MEMBACA FILE BARU ---");
    // Pancing nodemon v3
    const [componentLocationRows] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
         FROM stock_locations sl
         JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY'
         ORDER BY sl.product_id, sl.quantity ASC`,
      [allComponentProductIds.length > 0 ? allComponentProductIds : [0]]
    ); // 3. Proses Data (Map)

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
    } // 4. Mulai Transaksi (Operasi Tulis)

    await connection.beginTransaction(); // 4a. Buat Picking List

    const [pickingListResult] = await connection.query(
      "INSERT INTO picking_lists (user_id, source, original_filename, status) VALUES (?, ?, ?, ?)",
      [userId, source, originalFilename, "PENDING_VALIDATION", originalInvoiceId, customerName]
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
          invoiceNos: item.invoiceNos || null,
          customerNames: item.customerNames || null,
        });
      } else {
        validationResults.invalidSkus.push(`${item.sku} (SKU tidak ditemukan di database)`);
      }
    } // 4c. Buat Payload 'itemsToInsert' (Flat Payload)

    const itemsToInsert = [];
    for (const item of validationResults.validItems) {
      if (item.is_package) {
        // Jika paket, masukkan komponen-komponennya
        if (item.components) {
          item.components.forEach((comp) => {
            itemsToInsert.push([
              pickingListId,
              comp.component_product_id, // ID Produk Komponen
              item.sku, // original_sku (SKU Paket)
              item.qty * comp.quantity_per_package, // quantity (Qty Komponen)
              comp.suggestedLocationId, // suggested_location_id
            ]);
          });
        }
      } else {
        // Jika item tunggal, masukkan seperti biasa
        const product = validProductMap.get(item.sku);
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
    } // 5. SELESAI TRANSAKSI

    await connection.commit();
    return validationResults;
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error selama performPickingValidation:", error);
    throw error; // Lempar error agar bisa ditangkap oleh (req, res) handler
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Mengambil detail item dari sebuah picking list untuk fungsi Resume/View.
 * @param {number} pickingListId - ID dari picking list.
 * @returns {Promise<Array>} - Array 'detailedItems'
 */
export async function fetchPickingListDetails(pickingListId) {
  let connection;
  try {
    connection = await db.getConnection(); // 1. Dapatkan item dari list (SKU Fisik yang disimpan)

    const [items] = await connection.query(
      `SELECT pli.original_sku, pli.quantity, p.id as product_id, p.is_package
        FROM picking_list_items pli
        JOIN products p ON pli.product_id = p.id
        WHERE pli.picking_list_id = ?`,
      [pickingListId]
    );
    if (items.length === 0) return []; // Daftar unik original_sku (untuk grouping)

    const skus = [...new Set(items.map((item) => item.original_sku))]; // 2. Dapatkan info produk (berdasarkan original_sku/SKU Paket)

    const [productRows] = await connection.query(
      `SELECT id, sku, name, is_package
        FROM products
        WHERE sku IN (?) AND is_active = TRUE`,
      [skus]
    );

    const validProductMap = new Map(productRows.map((p) => [p.sku, p]));
    const packageProductIdsInList = productRows.filter((p) => p.is_package).map((p) => p.id); // 3. Dapatkan info KOMPONEN (Resep)
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
    ); // 4. Dapatkan SEMUA ID produk fisik (termasuk komponen) dari list

    // const allPhysicalProductIds = [...new Set(items.map((item) => item.product_id))]; // 5. Dapatkan lokasi untuk SEMUA produk fisik yang terlibat

    const singleProductIds = items
      .filter((item) => !item.is_package)
      .map((item) => item.product_id);

    const allComponentIds = componentRows.map((comp) => comp.component_id);

    const allPhysicalProductIds = [...new Set([...singleProductIds, ...allComponentIds])];
    console.log("--- TES RESTART v3 --- MENJALANKAN fetchPickingListDetails ---");

    const [locationRows] = await connection.query(
      `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
        FROM stock_locations sl
        JOIN locations l ON sl.location_id = l.id
        WHERE sl.product_id IN (?) AND l.purpose = 'DISPLAY'
        ORDER BY sl.product_id, sl.quantity ASC`,
      [allPhysicalProductIds.length > 0 ? allPhysicalProductIds : [0]]
    ); // 6. Proses Pemetaan Data // Map Lokasi (untuk Item Tunggal dan Komponen)

    const locationsByProductId = new Map();
    for (const loc of locationRows) {
      if (!locationsByProductId.has(loc.product_id)) locationsByProductId.set(loc.product_id, []);
      locationsByProductId.get(loc.product_id).push(loc);
    } // Map Info Komponen (Resep)

    const componentsByProductId = new Map();
    for (const comp of componentRows) {
      if (!componentsByProductId.has(comp.package_product_id))
        componentsByProductId.set(comp.package_product_id, []);
      componentsByProductId.get(comp.package_product_id).push(comp);
    } // 7. Loop Terakhir (Membangun Respons)

    const detailedItems = []; // Gunakan 'skus' (daftar unik original_sku) untuk membangun respons
    for (const sku of skus) {
      const product = validProductMap.get(sku);
      if (!product) continue; // Lewati jika SKU paket/induk tidak ditemukan

      let finalComponents = componentsByProductId.get(product.id) || null;
      let allLocations = [];
      let suggestedLocationId = null;
      let qtyNeeded = 0; // Akan dihitung

      if (product.is_package && finalComponents) {
        // Enrichment untuk Komponen Paket
        finalComponents = finalComponents.map((comp) => {
          const componentId = comp.component_id || comp.component_product_id; // Ambil qty komponen yang TEPAT dari 'items'
          let itemRow = items.find(
            (i) => i.product_id === componentId && i.original_sku === product.sku
          );
          // const componentQtyNeeded = itemRow ? itemRow.quantity : 0;
          const compLocations = locationsByProductId.get(componentId) || [];

          let componentQtyNeeded = 0;
          if (itemRow) {
            // --- LOGIKA LIST BARU (BENAR) ---
            componentQtyNeeded = itemRow.quantity;
          } else {
            // --- FALLBACK LIST LAMA (RUSAK) ---
            // Jika itemRow tidak ada, kemungkinan ini list lama yg menyimpan ID Paket.
            const oldPackageRow = items.find((i) => i.original_sku === product.sku && i.is_package);
            if (oldPackageRow) {
              // Hitung qty komponen berdasarkan qty paket yg lama
              componentQtyNeeded = oldPackageRow.quantity * comp.quantity_per_package;
            }
          }

          const availableCompLocations = compLocations.filter(
            (loc) => loc.quantity >= componentQtyNeeded
          );
          const suggestedCompLocId =
            availableCompLocations.length > 0 ? availableCompLocations[0].location_id : null;

          return {
            ...comp,
            qty_needed: componentQtyNeeded, // Kirim qty komponen yg sebenarnya
            availableLocations: compLocations,
            suggestedLocationId: suggestedCompLocId,
          };
        }); // Hitung Qty Paket (dibutuhkan untuk header)
        if (finalComponents.length > 0) {
          // Cek dulu apakah ini list lama
          const oldPackageRow = items.find((i) => i.original_sku === product.sku && i.is_package);
          if (oldPackageRow) {
            qtyNeeded = oldPackageRow.quantity;
          } else {
            // Jika bukan, hitung dari komponen (logika list BARU)
            const firstComp = finalComponents[0];
            if (firstComp.quantity_per_package > 0) {
              qtyNeeded = firstComp.qty_needed / firstComp.quantity_per_package;
            }
          }
        }
      } else if (!product.is_package) {
        // Info Lokasi Item Tunggal
        const itemRow = items.find((i) => i.product_id === product.id);
        qtyNeeded = itemRow ? itemRow.quantity : 0;
        allLocations = locationsByProductId.get(product.id) || [];
        const availableLocations = allLocations.filter((loc) => loc.quantity >= qtyNeeded);
        suggestedLocationId =
          availableLocations.length > 0 ? availableLocations[0].location_id : null;
      }

      detailedItems.push({
        sku: product.sku, // Gunakan original_sku (product.sku)
        name: product.name,
        qty: qtyNeeded, // Qty Paket atau Qty Item Tunggal
        is_package: product.is_package,
        components: finalComponents,
        availableLocations: allLocations,
        suggestedLocationId: suggestedLocationId,
      });
    }

    return detailedItems;
  } catch (error) {
    console.error(`Error saat mengambil detail picking list #${pickingListId}:`, error);
    throw error; // Lempar error agar bisa ditangkap oleh (req, res) handler
  } finally {
    if (connection) connection.release();
  }
}
