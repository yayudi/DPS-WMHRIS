// backend/router/returnRouter.js
import express from "express";
import db from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

// GET List Barang yang "Minta" Diretur
router.get("/pending", canAccess("manage-stock-adjustment"), async (req, res) => {
  try {
    const query = `
      SELECT
        pli.id,
        pli.quantity,
        pli.original_sku,
        p.name as product_name,
        p.id as product_id,
        pl.original_invoice_id,
        pl.source,
        pli.status
      FROM picking_list_items pli
      JOIN picking_lists pl ON pli.picking_list_id = pl.id
      LEFT JOIN products p ON pli.product_id = p.id
      WHERE pli.status = 'RETURNED'
      ORDER BY pli.id DESC
    `;
    const [rows] = await db.query(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil data retur." });
  }
});

// POST Input Retur Manual
router.post("/manual-entry", canAccess("manage-stock-adjustment"), async (req, res) => {
  const { invoiceId, productId, quantity, notes } = req.body;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Cek apakah list untuk invoice ini sudah ada?
    const [existingList] = await connection.query(
      "SELECT id FROM picking_lists WHERE original_invoice_id = ?",
      [invoiceId]
    );

    let listId;
    if (existingList.length > 0) {
      listId = existingList[0].id;
    } else {
      const [newList] = await connection.query(
        "INSERT INTO picking_lists (user_id, source, original_invoice_id, original_filename) VALUES (?, 'Offline', ?, 'MANUAL_RETURN')",
        [req.user.id, invoiceId]
      );
      listId = newList.insertId;
    }

    const [prod] = await connection.query("SELECT sku FROM products WHERE id = ?", [productId]);
    if (prod.length === 0) throw new Error("Produk tidak ditemukan");

    // [CRITICAL FIX]: Simpan hasil query insert ke variabel 'result'
    const [result] = await connection.query(
      `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, status)
         VALUES (?, ?, ?, ?, 'RETURNED')`,
      [listId, productId, prod[0].sku, quantity]
    );

    await connection.commit();

    // [CRITICAL FIX]: Kembalikan ID item baru (result.insertId) agar frontend bisa auto-approve
    res.json({
      success: true,
      message: "Retur manual berhasil didaftarkan ke antrian.",
      data: {
        id: result.insertId, // INI KUNCI UTAMANYA
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST Approve Retur (Restock Barang)
router.post("/approve", canAccess("manage-stock-adjustment"), async (req, res) => {
  const { itemId, targetLocationId, condition, notes } = req.body;
  const userId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // A. Ambil Info Item BESERTA Invoice ID (JOIN ke picking_lists)
    const [items] = await connection.query(
      `SELECT pli.*, pl.original_invoice_id
         FROM picking_list_items pli
         JOIN picking_lists pl ON pli.picking_list_id = pl.id
         WHERE pli.id = ? AND pli.status = 'RETURNED'`,
      [itemId]
    );

    if (items.length === 0) throw new Error("Item tidak ditemukan atau status bukan RETURNED.");
    const item = items[0];

    // B. Tambah Stok ke Lokasi Tujuan
    const [stockLoc] = await connection.query(
      "SELECT id FROM stock_locations WHERE product_id = ? AND location_id = ?",
      [item.product_id, targetLocationId]
    );

    if (stockLoc.length > 0) {
      await connection.query("UPDATE stock_locations SET quantity = quantity + ? WHERE id = ?", [
        item.quantity,
        stockLoc[0].id,
      ]);
    } else {
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?)",
        [item.product_id, targetLocationId, item.quantity]
      );
    }

    // C. Catat Movement (UPDATE: Sertakan Invoice ID di Notes)
    // Format: "Retur [INV-123]: Alasan User (Kondisi: GOOD)"
    const userNotes = notes ? `: ${notes}` : "";
    const logNote = `Retur [${item.original_invoice_id}]${userNotes} (Kondisi: ${condition})`;

    await connection.query(
      `INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes)
         VALUES (?, ?, NULL, ?, 'RETURN', ?, ?)`,
      [item.product_id, item.quantity, targetLocationId, userId, logNote]
    );

    // D. Update Status Item jadi COMPLETED_RETURN
    await connection.query(
      "UPDATE picking_list_items SET status = 'COMPLETED_RETURN' WHERE id = ?",
      [itemId]
    );

    await connection.commit();
    res.json({ success: true, message: "Stok retur berhasil dikembalikan ke rak." });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
