// backend\services\pickingService.js
import db from "../config/db.js"; // Impor db jika perlu query mandiri

/**
 * ✅ REFAKTOR FASE 3 (MULTI-LOKASI):
 * Logika ini sekarang DISEDERHANAKAN.
 * 'items' adalah payload "datar" (flat) yang HANYA berisi SKU single
 * atau SKU komponen. Logika 'if (isPackage)' DIHAPUS.
 *
 * @param {object} connection - Koneksi database yang aktif (dalam transaksi).
 * @param {Array<object>} items - Array item "datar" ({ sku, qty, fromLocationId }).
 * @param {number} userId - ID pengguna yang melakukan aksi.
 * @param {number} pickingListId - ID picking list yang sedang diproses.
 * @returns {Set<number>} Set berisi ID produk yang stoknya terpengaruh.
 */
export const processPickingListConfirmation = async (connection, items, userId, pickingListId) => {
  const affectedProductIds = new Set();

  const [listRows] = await connection.query(
    "SELECT original_filename FROM picking_lists WHERE id = ?",
    [pickingListId]
  );
  const filenameForNote = listRows[0]?.original_filename || `#${pickingListId}`;
  for (const item of items) {
    const { sku, qty, fromLocationId, invoiceNos, customerNames } = item;
    // Validasi payload (wajib ada)
    if (!fromLocationId) {
      throw new Error(
        `[Service] Lokasi pengambilan (fromLocationId) tidak ditentukan untuk SKU: ${sku}.`
      );
    }
    if (!sku || !qty) {
      throw new Error(`[Service] Data item tidak lengkap (SKU/Qty kosong).`);
    }

    // Dapatkan product_id dari SKU.
    const [productRows] = await connection.query("SELECT id, name FROM products WHERE sku = ?", [
      sku,
    ]);
    if (productRows.length === 0) {
      throw new Error(`[Validasi Service] SKU '${sku}' tidak ditemukan.`);
    }
    const product = productRows[0];
    const productId = product.id;

    // const [itemRow] = await connection.query(
    //   "SELECT id FROM picking_list_items WHERE picking_list_id = ? AND product_id = ?",
    //   [pickingListId, productId]
    // );
    // if (itemRow.length === 0) {
    //   throw new Error(
    //     `[Service] Baris item tidak ditemukan di picking_list_items untuk SKU: ${sku}.`
    //   );
    // }
    // const pickingListItemId = itemRow[0].id;

    let pickingListItemId = null;
    let isNewListStructure = false; // Flag untuk melacak versi list

    // Coba cari baris item (Struktur BARU, flat payload)
    let [itemRow] = await connection.query(
      "SELECT id FROM picking_list_items WHERE picking_list_id = ? AND product_id = ?",
      [pickingListId, productId] // (misal: 417, 325)
    );

    if (itemRow.length > 0) {
      // --- LOGIKA LIST BARU (BENAR) ---
      pickingListItemId = itemRow[0].id;
      isNewListStructure = true;
    } else {
      // --- FALLBACK LOGIC (List Lama) ---
      console.warn(
        `[Fallback] SKU ${sku} (ID ${productId}) tidak ditemukan. Mencoba mencari data Paket...`
      );

      // A. Cari semua Paket Induk untuk komponen ini
      const [parentPackageRows] = await connection.query(
        `SELECT package_product_id
          FROM package_components
          WHERE component_product_id = ?`,
        [productId] // (misal: 325)
      );

      if (parentPackageRows.length > 0) {
        const parentPackageIds = parentPackageRows.map((p) => p.package_product_id); // (misal: [289])

        // B. Cek apakah salah satu Paket Induk itu ada di picking_list_items
        [itemRow] = await connection.query(
          `SELECT id FROM picking_list_items
					  WHERE picking_list_id = ? AND product_id IN (?)`,
          [pickingListId, parentPackageIds] // (misal: 417, [289])
        );
      }
      // Jika itemRow masih kosong (fallback gagal), lempar error
      if (itemRow.length === 0) {
        throw new Error(
          `[Service] Baris item (SKU: ${sku}) tidak ditemukan di list ${pickingListId}. (Sudah Cek Fallback)`
        );
      }
    }

    // Kunci baris stok & Validasi (Ini adalah logika 'else' yg lama)
    const [stockRows] = await connection.query(
      "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
      [productId, fromLocationId]
    );
    const currentStock = stockRows[0]?.quantity || 0;

    if (currentStock < qty) {
      throw new Error(
        `Stok tidak cukup untuk produk '${sku}' di lokasi ${fromLocationId}. Stok: ${currentStock}, Butuh: ${qty}`
      );
    }

    // Kurangi stok
    await connection.query(
      "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
      [qty, productId, fromLocationId]
    );

    // await connection.query("UPDATE picking_list_items SET confirmed_location_id = ? WHERE id = ?", [
    //   fromLocationId,
    //   pickingListItemId,
    // ]);

    // Update 'picking_list_items' HANYA JIKA INI STRUKTUR BARU
    if (isNewListStructure) {
      await connection.query(
        "UPDATE picking_list_items SET confirmed_location_id = ? WHERE id = ?",
        [
          fromLocationId,
          pickingListItemId, // ID dari baris komponen
        ]
      );
    } else {
      console.warn(
        `[Fallback] Melewatkan update confirmed_location_id untuk SKU ${sku} (List Lama).`
      );
    }

    // Catat pergerakan
    const invoiceNote =
      invoiceNos && invoiceNos.length > 0 ? `(Inv: ${invoiceNos.join(", ")})` : "";
    const customerNote =
      customerNames && customerNames.length > 0 ? `(Cust: ${customerNames.join(", ")})` : "";
    const movementNote = `Sale from picking list ${filenameForNote} (SKU: ${sku}) ${invoiceNote} - ${customerNote}`;
    await connection.query(
      "INSERT INTO stock_movements (product_id, quantity, from_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, qty, fromLocationId, "SALE", userId, movementNote]
    );

    affectedProductIds.add(productId);
  }
  return affectedProductIds;
};

/**
 * ✅ REFAKTOR FASE 3 (MULTI-LOKASI):
 * Logika void disederhanakan untuk HANYA mencari movement_type = 'SALE'
 * karena 'SALE_COMPONENT' tidak lagi dibuat.
 *
 * @param {object} connection - Koneksi database yang aktif (dalam transaksi).
 * @param {number} pickingListId - ID picking list yang akan dibatalkan.
 * @param {number} userId - ID pengguna yang melakukan aksi.
 * @returns {Set<number>} Set berisi ID produk yang stoknya terpengaruh.
 */
export const processPickingListVoid = async (connection, pickingListId, userId) => {
  const affectedProductIdsVoid = new Set();

  const [listRows] = await connection.query(
    "SELECT original_filename FROM picking_lists WHERE id = ?",
    [pickingListId]
  );
  const filenameForNote = listRows[0]?.original_filename || `#${pickingListId}`;

  // Ambil SEMUA pergerakan stok 'SALE' yang terkait
  // ✅ PERUBAHAN: 'SALE_COMPONENT' dihapus dari klausa IN()
  const [movements] = await connection.query(
    `SELECT product_id, quantity, from_location_id
      FROM stock_movements
      WHERE movement_type = 'SALE'
       AND notes LIKE ?`, // Cari berdasarkan catatan
    [`Sale from picking list ${filenameForNote}%`]
  );

  if (movements.length === 0) {
    console.warn(
      `⚠️ [Void] Tidak ada pergerakan 'SALE' ditemukan untuk picking list ID ${pickingListId}.`
    );
    return affectedProductIdsVoid;
  }

  // Sisa logika (dari baris 160 dst) 100% SAMA dan sudah benar
  for (const move of movements) {
    const productId = move.product_id;
    const qtyToReturn = move.quantity;
    const returnToLocationId = move.from_location_id;
    const voidNote = `Void Sale from picking list pilsener ${filenameForNote}`;

    if (!returnToLocationId) {
      console.error(
        `❌ [Void] Gagal mengembalikan ${qtyToReturn} stok untuk Product ID ${productId}, 'from_location_id' adalah NULL.`
      );
      continue;
    }

    // Kunci baris sebelum mengembalikan
    await connection.query(
      "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
      [productId, returnToLocationId]
    );

    // Tambah stok kembali
    await connection.query(
      "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
      [productId, returnToLocationId, qtyToReturn, qtyToReturn]
    );

    // Catat pergerakan 'void' (pengembalian)
    await connection.query(
      "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, qtyToReturn, returnToLocationId, "VOID_SALE", userId, voidNote]
    );

    affectedProductIdsVoid.add(productId);
  }
  return affectedProductIdsVoid;
};

/**
 * Helper function untuk mengambil data stok terbaru dan memformatnya untuk broadcast.
 * (Fungsi ini tidak perlu diubah)
 *
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
      // Jika tidak ada lokasi relevan, kirim array kosong
      finalUpdates.push({ productId: prodId, newStock: [] });
    }
  }
  return finalUpdates;
};

/**
 * Mengambil semua komponen untuk daftar Package ID yang diberikan.
 * Digunakan oleh controller untuk memecah item paket.
 * @param {object} connection Koneksi database yang sedang aktif
 * @param {number[]} packageIds Array of product IDs (package)
 * @returns {Promise<Map<number, object[]>>} Map: package_product_id -> [{ sku, qty, component_product_id }]
 */
export const fetchPackageComponents = async (connection, packageIds) => {
  if (packageIds.length === 0) {
    return new Map();
  }

  const [rows] = await connection.query(
    `SELECT
      pc.package_product_id,
      pc.quantity_per_package as qty,
      p_comp.sku as sku,
      p_comp.id as component_product_id
    FROM package_components pc
    JOIN products p_comp ON pc.component_product_id = p_comp.id
    WHERE pc.package_product_id IN (?)`,
    [packageIds]
  );

  const componentsByProductId = new Map();
  for (const row of rows) {
    if (!componentsByProductId.has(row.package_product_id)) {
      componentsByProductId.set(row.package_product_id, []);
    }
    componentsByProductId.get(row.package_product_id).push(row);
  }

  return componentsByProductId;
};
