// backend/router/stockRouter.js
import express from "express";
import db from "../config/db.js";
import cache from "../config/cache.js";
import { broadcastStockUpdate } from "./realtimeRouter.js";

const router = express.Router();

/**
 * POST /api/stock/transfer
 * Memindahkan sejumlah stok dari satu lokasi ke lokasi lain.
 */
router.post("/transfer", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { productId, fromLocationId, toLocationId, quantity } = req.body;
  const userId = req.user.id;

  if (!productId || !fromLocationId || !toLocationId || !quantity || parseInt(quantity) <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Input tidak lengkap atau kuantitas tidak valid." });
  }
  if (fromLocationId === toLocationId) {
    return res
      .status(400)
      .json({ success: false, message: "Lokasi asal dan tujuan tidak boleh sama." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [currentStockRows] = await connection.query(
      "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
      [productId, fromLocationId]
    );

    const currentStock = currentStockRows[0]?.quantity || 0;
    if (currentStock < quantity) {
      await connection.rollback();
      return res
        .status(400)
        .json({ success: false, message: `Stok tidak mencukupi. Stok saat ini: ${currentStock}` });
    }

    await connection.query(
      "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        productId,
        quantity,
        fromLocationId,
        toLocationId,
        "TRANSFER",
        userId,
        `Transfer from loc ${fromLocationId} to ${toLocationId}`,
      ]
    );

    await connection.query(
      "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
      [quantity, productId, fromLocationId]
    );

    await connection.query(
      "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
      [productId, toLocationId, quantity, quantity]
    );

    await connection.commit();
    cache.flushAll();

    const [updatedStock] = await db.query(
      `SELECT sl.product_id, l.code as location_code, sl.quantity
             FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
             WHERE sl.product_id = ?`,
      [productId]
    );
    broadcastStockUpdate([{ productId, newStock: updatedStock }]);

    res.status(200).json({ success: true, message: "Transfer stok berhasil." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat transfer stok:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/stock/adjust
 * Menyesuaikan (menambah atau mengurangi) stok di satu lokasi.
 */
router.post("/adjust", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { productId, locationId, quantity, notes } = req.body;
  const userId = req.user.id;

  if (!productId || !locationId || quantity === 0 || !notes) {
    return res.status(400).json({
      success: false,
      message: "Produk, lokasi, kuantitas (bukan nol), dan catatan wajib diisi.",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    if (quantity < 0) {
      const [currentStockRows] = await connection.query(
        "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
        [productId, locationId]
      );
      const currentStock = currentStockRows[0]?.quantity || 0;
      if (currentStock + quantity < 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Stok tidak mencukupi. Stok saat ini: ${currentStock}, ingin dikurangi: ${Math.abs(
            quantity
          )}.`,
        });
      }
    }

    await connection.query(
      "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, Math.abs(quantity), locationId, "ADJUSTMENT", userId, notes]
    );

    await connection.query(
      "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
      [productId, locationId, quantity, quantity]
    );

    await connection.commit();
    cache.flushAll();

    const [updatedStock] = await db.query(
      `SELECT sl.product_id, l.code as location_code, sl.quantity
             FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
             WHERE sl.product_id = ?`,
      [productId]
    );
    broadcastStockUpdate([{ productId, newStock: updatedStock }]);

    res.status(200).json({ success: true, message: "Penyesuaian stok berhasil." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat penyesuaian stok:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

router.post("/batch-process", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { type, fromLocationId, toLocationId, notes, movements } = req.body;
  const userId = req.user.id;
  const userRoleId = req.user.role_id;

  // Validasi input dasar
  if (!type || !Array.isArray(movements) || movements.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Tipe pergerakan dan daftar item wajib diisi." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // --- PERBAIKAN LOGIKA KEAMANAN RBAC ---
    // Keamanan RBAC: Periksa izin untuk lokasi asal jika relevan
    if (type === "TRANSFER" || type === "ADJUSTMENT") {
      // Tipe yang mengurangi stok
      if (userRoleId !== 1) {
        // Admin (role_id 1) dilewati
        // 'ADJUSTMENT' menggunakan toLocationId, 'TRANSFER' menggunakan fromLocationId
        const locationToCheck = type === "TRANSFER" ? fromLocationId : toLocationId;
        if (!locationToCheck) {
          throw new Error("Lokasi (asal atau tujuan) wajib diisi untuk operasi ini.");
        }

        const [permissionRows] = await connection.query(
          "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
          [userId, locationToCheck]
        );
        if (permissionRows.length === 0) {
          throw new Error("Akses ditolak. Anda tidak memiliki izin untuk lokasi ini.");
        }
      }
    }
    // (Pengecekan untuk TRANSFER_MULTI akan dilakukan di dalam loop)
    // --- AKHIR PERBAIKAN LOGIKA KEAMANAN ---

    const updatedProductIds = new Set();

    for (const movement of movements) {
      const { sku, quantity } = movement;
      const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      if (productRows.length === 0) throw new Error(`SKU '${sku}' tidak ditemukan.`);

      const productId = productRows[0].id;
      updatedProductIds.add(productId);

      // Logika berbeda untuk setiap tipe pergerakan
      switch (type) {
        case "TRANSFER":
          if (!fromLocationId || !toLocationId)
            throw new Error("Lokasi asal dan tujuan wajib diisi untuk transfer.");
          // Kurangi dari asal
          await connection.query(
            "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
            [quantity, productId, fromLocationId]
          );
          // Tambah ke tujuan
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, toLocationId, quantity, quantity]
          );
          // Catat di buku besar
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [productId, quantity, fromLocationId, toLocationId, "TRANSFER", userId, notes]
          );
          break;

        // --- BLOK BARU UNTUK MENANGANI "TRANSFER RINCI" ---
        case "TRANSFER_MULTI":
          // Ambil ID lokasi dari dalam item movement
          const { fromLocationId: itemFromLocId, toLocationId: itemToLocId } = movement;

          if (!itemFromLocId || !itemToLocId) {
            throw new Error(
              `SKU '${sku}' tidak memiliki lokasi asal atau tujuan di dalam payload.`
            );
          }

          // Keamanan RBAC (di dalam loop)
          if (userRoleId !== 1) {
            const [permissionRows] = await connection.query(
              "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
              [userId, itemFromLocId]
            );
            if (permissionRows.length === 0) {
              throw new Error(`Akses ditolak. Anda tidak punya izin untuk lokasi SKU '${sku}'.`);
            }
          }

          // Kurangi dari asal (itemFromLocId)
          await connection.query(
            "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
            [quantity, productId, itemFromLocId]
          );
          // Tambah ke tujuan (itemToLocId)
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, itemToLocId, quantity, quantity]
          );
          // Catat di buku besar (tipe di DB tetap 'TRANSFER')
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [productId, quantity, itemFromLocId, itemToLocId, "TRANSFER", userId, notes]
          );
          break;
        // --- AKHIR BLOK BARU ---

        case "INBOUND":
        case "SALE_RETURN":
          if (!toLocationId) throw new Error("Lokasi tujuan wajib diisi untuk inbound/return.");
          // Tambah ke tujuan
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, toLocationId, quantity, quantity]
          );
          // Catat di buku besar
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, NULL, ?, ?, ?, ?)",
            [productId, quantity, toLocationId, type, userId, notes]
          );
          break;

        case "ADJUSTMENT":
          if (!toLocationId || !notes)
            throw new Error("Lokasi dan catatan wajib diisi untuk penyesuaian.");
          // Tambah atau kurangi stok di satu lokasi
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, toLocationId, quantity, quantity]
          );
          // Catat di buku besar
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
            [productId, Math.abs(quantity), toLocationId, "ADJUSTMENT", userId, notes]
          );
          break;

        default:
          throw new Error(`Tipe pergerakan '${type}' tidak dikenal.`);
      }
    }

    await connection.commit();
    cache.flushAll();

    // Siarkan pembaruan stok untuk semua produk yang terpengaruh
    const finalUpdates = [];
    for (const productId of updatedProductIds) {
      const [updatedStock] = await db.query(
        `SELECT sl.product_id, l.code as location_code, sl.quantity
   FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
   WHERE sl.product_id = ?`,
        [productId]
      );
      finalUpdates.push({ productId, newStock: updatedStock });
    }
    broadcastStockUpdate(finalUpdates);

    res
      .status(200)
      .json({ success: true, message: `Batch ${type} untuk ${movements.length} item berhasil.` });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`Error saat proses batch ${type}:`, error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/stock/history/:productId
 * Mengambil riwayat pergerakan stok untuk satu produk.
 */
router.get("/history/:productId", async (req, res) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 15;
  const offset = (page - 1) * limit;

  try {
    const countQuery = "SELECT COUNT(*) as total FROM stock_movements WHERE product_id = ?";
    const [totalRows] = await db.query(countQuery, [productId]);
    const total = totalRows[0].total;

    const historyQuery = `
            SELECT
                sm.id, sm.quantity, sm.movement_type, sm.notes, sm.created_at,
                u.username as user,
                from_loc.code as from_location,
                to_loc.code as to_location
            FROM stock_movements sm
            JOIN users u ON sm.user_id = u.id
            LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
            LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
            WHERE sm.product_id = ?
            ORDER BY sm.created_at DESC
            LIMIT ? OFFSET ?
        `;
    const [history] = await db.query(historyQuery, [productId, limit, offset]);

    res.json({
      success: true,
      data: history,
      pagination: { total, page, limit },
    });
  } catch (error) {
    console.error(`Error saat mengambil riwayat stok untuk produk ID ${productId}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat stok." });
  }
});

/**
 * POST /api/stock/batch-transfer
 * Memindahkan stok untuk beberapa produk sekaligus dari satu lokasi ke lokasi lain.
 */
router.post("/batch-transfer", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { fromLocationId, toLocationId, movements } = req.body;
  const userId = req.user.id;
  const userRoleId = req.user.role_id; // Ambil role_id dari token

  if (!fromLocationId || !toLocationId || !Array.isArray(movements) || movements.length === 0) {
    return res.status(400).json({ success: false, message: "Input tidak valid." });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // --- LANGKAH KEAMANAN BARU ---
    // Periksa apakah pengguna adalah admin (role_id 1)
    if (userRoleId !== 1) {
      // Jika bukan admin, periksa izin lokasi
      const [permissionRows] = await connection.query(
        "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
        [userId, fromLocationId]
      );
      if (permissionRows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak. Anda tidak memiliki izin untuk lokasi asal ini.",
        });
      }
    }
    // --- AKHIR LANGKAH KEAMANAN ---

    await connection.beginTransaction();
    const updatedProductIds = new Set();

    for (const movement of movements) {
      const { sku, quantity } = movement;
      const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      if (productRows.length === 0) {
        throw new Error(`SKU '${sku}' tidak ditemukan.`);
      }
      const productId = productRows[0].id;
      updatedProductIds.add(productId);

      const [stockRows] = await connection.query(
        "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
        [productId, fromLocationId]
      );
      const currentStock = stockRows[0]?.quantity || 0;
      if (currentStock < quantity) {
        throw new Error(
          `Stok untuk SKU '${sku}' tidak mencukupi (stok: ${currentStock}, butuh: ${quantity}).`
        );
      }

      await connection.query(
        "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
        [quantity, productId, fromLocationId]
      );
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
        [productId, toLocationId, quantity, quantity]
      );
      await connection.query(
        "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [productId, quantity, fromLocationId, toLocationId, "TRANSFER", userId, `Batch transfer`]
      );
    }

    await connection.commit();
    cache.flushAll();

    const finalUpdates = [];
    for (const productId of updatedProductIds) {
      const [updatedStock] = await db.query(
        `SELECT sl.product_id, l.code as location_code, sl.quantity
                 FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
                 WHERE sl.product_id = ?`,
        [productId]
      );
      finalUpdates.push({ productId, newStock: updatedStock });
    }
    broadcastStockUpdate(finalUpdates);

    res
      .status(200)
      .json({ success: true, message: `Batch transfer untuk ${movements.length} item berhasil.` });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat batch transfer stok:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/stock/batch-log
 * Mengambil semua log pergerakan stok dalam rentang tanggal tertentu.
 */
router.get("/batch-log", async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ success: false, message: "Tanggal mulai dan tanggal selesai wajib diisi." });
  }

  try {
    const query = `
      SELECT
        sm.id,
        p.sku,
        p.name as product_name,
        sm.quantity,
        sm.movement_type,
        sm.notes,
        sm.created_at,
        u.username as user,
        from_loc.code as from_location,
        to_loc.code as to_location
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN users u ON sm.user_id = u.id
      LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
      WHERE sm.created_at BETWEEN ? AND ?
      ORDER BY sm.created_at DESC;
    `;
    const [logs] = await db.query(query, [startDate, `${endDate} 23:59:59`]);

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error(`Error saat mengambil log batch:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil log batch." });
  }
});

export default router;
