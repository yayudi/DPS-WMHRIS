// backend\router\roleRouter.js
import express from "express";
import db from "../config/db.js";

const router = express.Router();

/**
 * GET /api/roles
 * Mengambil daftar semua peran (roles) yang ada di sistem.
 */
router.get("/", async (req, res) => {
  try {
    const [roles] = await db.query("SELECT id, name FROM roles ORDER BY name");
    res.json({ success: true, data: roles });
  } catch (error) {
    console.error("Error saat mengambil data peran:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /api/roles/permissions
 * Mengambil daftar semua izin (permissions) yang tersedia di sistem.
 */
router.get("/permissions", async (req, res) => {
  try {
    const [permissions] = await db.query(
      "SELECT id, name, description FROM permissions ORDER BY name"
    );
    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error("Error saat mengambil data izin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /api/roles/:id/permissions
 * Mengambil ID izin yang dimiliki oleh sebuah peran spesifik.
 */
router.get("/:id/permissions", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query("SELECT permission_id FROM role_permission WHERE role_id = ?", [
      id,
    ]);
    const permissionIds = rows.map((row) => row.permission_id);
    res.json({ success: true, data: permissionIds });
  } catch (error) {
    console.error("Error saat mengambil izin peran:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * PUT /api/roles/:id/permissions
 * Memperbarui semua izin untuk sebuah peran spesifik.
 */
router.put("/:id/permissions", async (req, res) => {
  const { id } = req.params;
  const { permissionIds } = req.body;

  if (!Array.isArray(permissionIds)) {
    return res.status(400).json({ success: false, message: "Input harus berupa array ID izin." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Hapus semua izin lama untuk peran ini
    await connection.query("DELETE FROM role_permission WHERE role_id = ?", [id]);

    // 2. Jika ada izin baru, masukkan semuanya
    if (permissionIds.length > 0) {
      const values = permissionIds.map((permissionId) => [id, permissionId]);
      await connection.query("INSERT INTO role_permission (role_id, permission_id) VALUES ?", [
        values,
      ]);
    }

    await connection.commit();
    res.json({ success: true, message: "Izin untuk peran berhasil diperbarui." });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res
        .status(400)
        .json({ success: false, message: "Satu atau lebih ID izin atau peran tidak valid." });
    }
    console.error("Error saat memperbarui izin peran:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
