// backend\services\pickingService.js
import db from "../config/db.js"; // Impor db jika perlu query mandiri (tapi sebaiknya connection dari router)

/**
 * Memvalidasi ketersediaan stok untuk semua item dalam picking list.
 * Melemparkan error jika stok tidak mencukupi.
 * @param {object} connection - Koneksi database yang aktif (dalam transaksi).
 * @param {Array<object>} items - Array item dari req.body ({ sku, qty }).
 * @param {number} fromLocationId - ID lokasi sumber pengambilan.
 * @throws {Error} Jika stok tidak cukup atau SKU tidak ditemukan.
 */
export const validatePickingListItems = async (connection, items, fromLocationId) => {
  console.log("--- [Service] Memulai Validasi Stok ---");
  for (const item of items) {
    const [productRows] = await connection.query(
      "SELECT id, sku, is_package, name FROM products WHERE sku = ?",
      [item.sku]
    );
    if (productRows.length === 0) {
      throw new Error(`[Validasi] SKU '${item.sku}' tidak ditemukan.`);
    }
    const product = productRows[0];
    const productId = product.id;
    const isPackage = product.is_package;
    const quantityToPick = item.qty;

    if (isPackage) {
      console.log(`📦 [Validasi] PAKET SKU ${item.sku}...`);
      const [components] = await connection.query(
        `SELECT pc.component_product_id, pc.quantity_per_package, p_comp.sku as component_sku, p_comp.name as component_name
         FROM package_components pc
         JOIN products p_comp ON pc.component_product_id = p_comp.id
         WHERE pc.package_product_id = ?`,
        [productId]
      );
      if (components.length === 0) {
        console.warn(`⚠️ [Validasi] Paket SKU ${item.sku} tidak memiliki komponen. Dilewati.`);
        continue; // Atau throw error jika paket tanpa komponen tidak valid
      }

      for (const component of components) {
        const componentId = component.component_product_id;
        const componentQtyNeeded = quantityToPick * component.quantity_per_package;
        const [stockRows] = await connection.query(
          "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
          [componentId, fromLocationId]
        );
        const currentStock = stockRows[0]?.quantity || 0;
        console.log(
          `  [Validasi] Komponen: ${component.component_sku}, Stok: ${currentStock}, Butuh: ${componentQtyNeeded}`
        );
        if (currentStock < componentQtyNeeded) {
          throw new Error(
            `Stok tidak cukup untuk komponen '${component.component_sku}' dari paket '${item.sku}'. Stok: ${currentStock}, Butuh: ${componentQtyNeeded}`
          );
        }
      }
    } else {
      console.log(`🧱 [Validasi] SINGLE SKU ${item.sku}...`);
      const [stockRows] = await connection.query(
        "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
        [productId, fromLocationId]
      );
      const currentStock = stockRows[0]?.quantity || 0;
      console.log(
        `  [Validasi] Single: ${item.sku}, Stok: ${currentStock}, Butuh: ${quantityToPick}`
      );
      if (currentStock < quantityToPick) {
        throw new Error(
          `Stok tidak cukup untuk produk '${item.sku}'. Stok: ${currentStock}, Butuh: ${quantityToPick}`
        );
      }
    }
  }
  console.log("--- [Service] Validasi Stok Selesai ---");
};

/**
 * Memproses pengurangan stok untuk item picking list yang sudah divalidasi.
 * @param {object} connection - Koneksi database yang aktif (dalam transaksi).
 * @param {Array<object>} items - Array item dari req.body ({ sku, qty }).
 * @param {number} fromLocationId - ID lokasi sumber pengambilan.
 * @param {number} userId - ID pengguna yang melakukan aksi.
 * @param {number} pickingListId - ID picking list yang sedang diproses.
 * @returns {Set<number>} Set berisi ID produk yang stoknya terpengaruh.
 */
export const processPickingListConfirmation = async (
  connection,
  items,
  fromLocationId,
  userId,
  pickingListId
) => {
  console.log("--- [Service] Memulai Pengurangan Stok ---");
  const affectedProductIds = new Set();

  for (const item of items) {
    // Ambil info produk lagi
    const [productRows] = await connection.query(
      "SELECT id, is_package FROM products WHERE sku = ?",
      [item.sku]
    );
    const product = productRows[0]; // Kita tahu produknya ada dari validasi
    const productId = product.id;
    const isPackage = product.is_package;
    const quantityToPick = item.qty;
    const movementNote = `Sale from picking list #${pickingListId} (SKU: ${item.sku})`;

    if (isPackage) {
      console.log(`📦 [Proses] Mengurangi komponen PAKET SKU ${item.sku}...`);
      const [components] = await connection.query(
        `SELECT component_product_id, quantity_per_package
         FROM package_components
         WHERE package_product_id = ?`,
        [productId]
      );

      for (const component of components) {
        const componentId = component.component_product_id;
        const componentQtyNeeded = quantityToPick * component.quantity_per_package;
        console.log(`  -> [Proses] Komponen ID ${componentId}, Jumlah: ${componentQtyNeeded}`);

        // Kurangi stok komponen
        await connection.query(
          "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
          [componentQtyNeeded, componentId, fromLocationId]
        );

        // Catat pergerakan
        await connection.query(
          "INSERT INTO stock_movements (product_id, quantity, from_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
          [componentId, componentQtyNeeded, fromLocationId, "SALE_COMPONENT", userId, movementNote]
        );
        affectedProductIds.add(componentId);
      }
    } else {
      console.log(`🧱 [Proses] Mengurangi SINGLE SKU ${item.sku}...`);
      // Kurangi stok single
      await connection.query(
        "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
        [quantityToPick, productId, fromLocationId]
      );
      // Catat pergerakan
      await connection.query(
        "INSERT INTO stock_movements (product_id, quantity, from_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [productId, quantityToPick, fromLocationId, "SALE", userId, movementNote]
      );
      affectedProductIds.add(productId);
    }
  }
  console.log("--- [Service] Pengurangan Stok Selesai ---");
  return affectedProductIds;
};

/**
 * Memproses pengembalian stok (void) untuk item picking list.
 * @param {object} connection - Koneksi database yang aktif (dalam transaksi).
 * @param {number} pickingListId - ID picking list yang akan dibatalkan.
 * @param {number} locationId - ID lokasi tujuan pengembalian stok (misal Lokasi Display).
 * @param {number} userId - ID pengguna yang melakukan aksi.
 * @returns {Set<number>} Set berisi ID produk yang stoknya terpengaruh.
 */
export const processPickingListVoid = async (connection, pickingListId, locationId, userId) => {
  console.log("--- [Service] Memulai Pengembalian Stok (Void) ---");
  const affectedProductIdsVoid = new Set();

  // Ambil item asli dari picking list
  const [itemsToVoid] = await connection.query(
    `SELECT pli.product_id, pli.quantity, p.is_package, pli.original_sku
     FROM picking_list_items pli
     JOIN products p ON pli.product_id = p.id
     WHERE pli.picking_list_id = ?`,
    [pickingListId]
  );

  if (itemsToVoid.length === 0) {
    console.warn(`⚠️ [Void] Tidak ada item ditemukan untuk picking list ID ${pickingListId}.`);
    return affectedProductIdsVoid; // Kembalikan set kosong
  }

  for (const item of itemsToVoid) {
    const productId = item.product_id;
    const quantityToReturn = item.quantity;
    const isPackage = item.is_package;
    const originalSku = item.original_sku;
    const voidNote = `Void sale from picking list #${pickingListId} (SKU: ${originalSku})`;

    if (isPackage) {
      console.log(`📦 [Void] PAKET SKU ${originalSku}...`);
      const [components] = await connection.query(
        `SELECT component_product_id, quantity_per_package
         FROM package_components
         WHERE package_product_id = ?`,
        [productId]
      );

      for (const component of components) {
        const componentId = component.component_product_id;
        const componentQtyToReturn = quantityToReturn * component.quantity_per_package;
        console.log(`  -> [Void] Komponen ID ${componentId}, Jumlah: ${componentQtyToReturn}`);

        // Tambah stok komponen
        await connection.query(
          "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
          [componentId, locationId, componentQtyToReturn, componentQtyToReturn]
        );
        // Catat pergerakan
        await connection.query(
          "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
          [componentId, componentQtyToReturn, locationId, "VOID_SALE_COMPONENT", userId, voidNote]
        );
        affectedProductIdsVoid.add(componentId);
      }
    } else {
      console.log(`🧱 [Void] SINGLE SKU ${originalSku}...`);
      // Tambah stok single
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
        [productId, locationId, quantityToReturn, quantityToReturn]
      );
      // Catat pergerakan
      await connection.query(
        "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [productId, quantityToReturn, locationId, "VOID_SALE", userId, voidNote]
      );
      affectedProductIdsVoid.add(productId);
    }
  }
  console.log("--- [Service] Pengembalian Stok (Void) Selesai ---");
  return affectedProductIdsVoid;
};

/**
 * Helper function untuk mengambil data stok terbaru dan memformatnya untuk broadcast.
 * @param {Array<number>} productIds - Array ID produk yang stoknya berubah.
 * @param {number} [relevantLocationId] - (Opsional) ID lokasi spesifik yang relevan (misal fromLocationId).
 * @returns {Promise<Array<object>>} - Array objek untuk broadcastStockUpdate.
 */
export const getLatestStockForBroadcast = async (productIds, relevantLocationId = null) => {
  if (!productIds || productIds.length === 0) return [];

  const finalUpdates = [];
  for (const prodId of productIds) {
    const [updatedStock] = await db.query(
      // Gunakan db.query karena ini di luar transaksi utama
      `SELECT sl.product_id, l.code as location_code, sl.quantity
           FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
           WHERE sl.product_id = ?`,
      [prodId]
    );

    if (updatedStock.length > 0) {
      finalUpdates.push({ productId: prodId, newStock: updatedStock });
    } else if (relevantLocationId) {
      // Jika stok jadi 0, kirim info stok 0 HANYA untuk lokasi relevan
      const [locCodeRows] = await db.query("SELECT code FROM locations WHERE id = ?", [
        relevantLocationId,
      ]);
      const locCode = locCodeRows.length > 0 ? locCodeRows[0].code : `ID ${relevantLocationId}`;
      finalUpdates.push({
        productId: prodId,
        newStock: [{ product_id: prodId, location_code: locCode, quantity: 0 }],
      });
    } else {
      // Jika tidak ada lokasi relevan, kirim array kosong (atau format lain sesuai kebutuhan frontend)
      finalUpdates.push({ productId: prodId, newStock: [] });
    }
  }
  return finalUpdates;
};
