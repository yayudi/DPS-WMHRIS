import express from "express";
import db from "../config/db.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

/**
 * GET /api/locations
 * Mengambil daftar semua lokasi. Endpoint ini bisa diakses oleh pengguna biasa (untuk dropdown).
 */
router.get("/", async (req, res) => {
  try {
    const [locations] = await db.query(
      "SELECT id, code, building, floor, name FROM locations ORDER BY building, code"
    );
    res.json({ success: true, data: locations });
  } catch (error) {
    console.error("Error saat mengambil data lokasi:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil data lokasi." });
  }
});

/**
 * POST /api/locations
 * Membuat lokasi baru. Hanya untuk admin dengan izin 'manage-locations'.
 */
router.post("/", canAccess("manage-locations"), async (req, res) => {
  const { code, building, floor, name } = req.body;
  if (!code || !building) {
    return res.status(400).json({ success: false, message: "Kode dan Gedung wajib diisi." });
  }
  try {
    const [result] = await db.query(
      "INSERT INTO locations (code, building, floor, name) VALUES (?, ?, ?, ?)",
      [code, building, floor || null, name || null]
    );
    res
      .status(201)
      .json({ success: true, message: "Lokasi berhasil dibuat.", locationId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Kode lokasi sudah ada." });
    }
    console.error("Error saat membuat lokasi:", error);
    res.status(500).json({ success: false, message: "Gagal membuat lokasi." });
  }
});

/**
 * PUT /api/locations/:id
 * Mengedit lokasi yang ada. Hanya untuk admin dengan izin 'manage-locations'.
 */
router.put("/:id", canAccess("manage-locations"), async (req, res) => {
  const { id } = req.params;
  const { code, building, floor, name } = req.body;
  if (!code || !building) {
    return res.status(400).json({ success: false, message: "Kode dan Gedung wajib diisi." });
  }
  try {
    const [result] = await db.query(
      "UPDATE locations SET code = ?, building = ?, floor = ?, name = ? WHERE id = ?",
      [code, building, floor || null, name || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Lokasi tidak ditemukan." });
    }
    res.json({ success: true, message: "Lokasi berhasil diperbarui." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Kode lokasi sudah digunakan." });
    }
    console.error("Error saat mengedit lokasi:", error);
    res.status(500).json({ success: false, message: "Gagal mengedit lokasi." });
  }
});

/**
 * DELETE /api/locations/:id
 * Menghapus lokasi. Hanya untuk admin dengan izin 'manage-locations'.
 */
router.delete("/:id", canAccess("manage-locations"), async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM locations WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Lokasi tidak ditemukan." });
    }
    res.json({ success: true, message: "Lokasi berhasil dihapus." });
  } catch (error) {
    // Jika lokasi masih digunakan di tabel lain, akan error
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        success: false,
        message:
          "Gagal menghapus: Lokasi ini masih digunakan oleh data stok. Kosongkan stok di lokasi ini terlebih dahulu.",
      });
    }
    console.error("Error saat menghapus lokasi:", error);
    res.status(500).json({ success: false, message: "Gagal menghapus lokasi." });
  }
});

/*
 * [INVESTIGASI] GET /api/locations/:id/stock-sample
 * Mengambil sampel 10 produk pertama yang memiliki stok di lokasi ini.
 */
router.get("/:id/stock-sample", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT p.sku, p.name, sl.quantity
      FROM stock_locations sl
      JOIN products p ON sl.product_id = p.id
      WHERE sl.location_id = ? AND sl.quantity > 0
      LIMIT 10
    `;
    const [results] = await db.query(query, [id]);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Error fetching stock sample:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
