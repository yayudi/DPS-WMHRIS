import db from "../config/db.js";

/**
 * ID Pengguna yang akan dicatat di 'stock_movements'.
 * Ganti ini dengan ID pengguna "Admin" atau "Sistem" Anda.
 */
const ADMIN_USER_ID = 2147483651; // <-- GANTI INI (Contoh: ID admin Anda yang valid)

/**
 * Catatan yang akan muncul di 'stock_movements'.
 */
const NOTES = "Stock Opname - Set Display to 0";
const MOVEMENT_TYPE = "ADJUSTMENT";
const LOCATION_PURPOSE = "DISPLAY"; // <-- GANTI INI jika tujuannya beda

/**
 * Skrip sekali pakai untuk mengatur ulang stok lokasi (berdasarkan 'purpose') menjadi 0.
 * Ini akan mencatat setiap perubahan di 'stock_movements' dengan benar.
 *
 * CARA MENJALANKAN (dari folder 'backend'):
 * node scripts/run_opname_display_to_zero.js
 */
async function runStockOpname() {
  let connection;

  try {
    connection = await db.getConnection();

    // Mulai Transaksi
    await connection.beginTransaction();

    // Dapatkan semua ID lokasi yang ditargetkan
    const [locations] = await connection.query("SELECT id FROM locations WHERE purpose = ?", [
      LOCATION_PURPOSE,
    ]);

    if (locations.length === 0) {
      await connection.rollback();
      return;
    }

    const locationIds = locations.map((loc) => loc.id);

    // Dapatkan SEMUA item di lokasi tersebut yang stoknya TIDAK 0
    const [stocksToAdjust] = await connection.query(
      `SELECT product_id, location_id, quantity
       FROM stock_locations
       WHERE location_id IN (?) AND quantity != 0`,
      [locationIds]
    );

    if (stocksToAdjust.length === 0) {
      await connection.rollback();
      return;
    }

    let movementInserts = [];
    let locationUpdates = [];

    // Siapkan semua query (INSERT movement dan UPDATE location)
    for (const stock of stocksToAdjust) {
      const currentQty = stock.quantity;
      const movementQty = -Math.abs(currentQty); // Kuantitas yang dicatat adalah selisihnya

      // Siapkan query untuk stock_movements
      movementInserts.push(
        connection.query(
          `INSERT INTO stock_movements (product_id, to_location_id, quantity, movement_type, notes, user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [stock.product_id, stock.location_id, movementQty, MOVEMENT_TYPE, NOTES, ADMIN_USER_ID]
        )
      );

      // Siapkan query untuk stock_locations
      locationUpdates.push(
        connection.query(
          "UPDATE stock_locations SET quantity = 0 WHERE product_id = ? AND location_id = ?",
          [stock.product_id, stock.location_id]
        )
      );
    }

    // Eksekusi semua query
    console.log("[OPNAME] Mencatat `stock_movements`...");
    await Promise.all(movementInserts);

    console.log("[OPNAME] Mengatur `stock_locations` menjadi 0...");
    await Promise.all(locationUpdates);

    // Jika semua berhasil, commit transaksi
    await connection.commit();
    console.log(
      `[OPNAME] SUKSES! Transaksi di-commit. ${stocksToAdjust.length} item diatur menjadi 0.`
    );
  } catch (error) {
    console.error("[OPNAME] ERROR TERJADI:", error.message);
    if (connection) {
      await connection.rollback();
      console.error("[OPNAME] Transaksi di-rollback. Tidak ada data yang diubah.");
    }
  } finally {
    if (connection) {
      connection.release();
      console.log("[OPNAME] Koneksi DB dilepaskan.");
    }
    // Hentikan pool agar skrip bisa exit
    if (db.pool) {
      db.pool.end();
    }
  }
}

runStockOpname();
