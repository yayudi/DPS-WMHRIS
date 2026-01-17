// backend\router\roleRouter.js
import express from "express";
import db from "../config/db.js";
import { createLog } from "../repositories/systemLogRepository.js";

const router = express.Router();

/**
 * GET /api/roles
 * Mengambil daftar semua peran (roles) yang ada di sistem.
 */
router.get("/", async (req, res) => {
  try {
    const [roles] = await db.query(
      "SELECT id, name, description FROM roles ORDER BY name" // Tambahkan description
    );
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
      "SELECT id, name, description, `group` FROM permissions ORDER BY `group`, name" // Tambahkan `group` dan order by
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

    // Hapus semua izin lama untuk peran ini
    await connection.query("DELETE FROM role_permission WHERE role_id = ?", [id]);

    // Jika ada izin baru, masukkan semuanya
    if (permissionIds.length > 0) {
      const values = permissionIds.map((permissionId) => [id, permissionId]);
      await connection.query("INSERT INTO role_permission (role_id, permission_id) VALUES ?", [
        values,
      ]);
    }

    // LOGGING
    await createLog(connection, {
      userId: req.user.id,
      action: "UPDATE",
      targetType: "ROLE",
      targetId: String(id),
      changes: { note: "Updated Role Permissions", permissionCount: permissionIds.length },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

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

/**
 * POST /api/roles
 * Membuat peran baru.
 */
router.post("/", async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Nama peran wajib diisi." });
  }
  try {
    const [result] = await db.query("INSERT INTO roles (name, description) VALUES (?, ?)", [
      name,
      description || null,
    ]);
    res
      .status(201)
      .json({ success: true, message: "Peran berhasil dibuat.", roleId: result.insertId });

    // LOGGING
    await createLog(db, {
      userId: req.user.id,
      action: "CREATE",
      targetType: "ROLE",
      targetId: String(result.insertId),
      changes: { name, description },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Nama peran sudah ada." });
    }
    console.error("Error saat membuat peran:", error);
    res.status(500).json({ success: false, message: "Gagal membuat peran." });
  }
});

/**
 * PUT /api/roles/:id
 * Mengedit nama/deskripsi peran.
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Nama peran wajib diisi." });
  }
  try {
    const [result] = await db.query("UPDATE roles SET name = ?, description = ? WHERE id = ?", [
      name,
      description || null,
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Peran tidak ditemukan." });
    }
    res.json({ success: true, message: "Peran berhasil diperbarui." });

    // LOGGING
    await createLog(db, {
      userId: req.user.id,
      action: "UPDATE",
      targetType: "ROLE",
      targetId: String(id),
      changes: { name, description },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Nama peran sudah digunakan." });
    }
    console.error("Error saat mengedit peran:", error);
    res.status(500).json({ success: false, message: "Gagal mengedit peran." });
  }
});

/**
 * DELETE /api/roles/:id
 * Menghapus peran.
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM roles WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Peran tidak ditemukan." });
    }
    res.json({ success: true, message: "Peran berhasil dihapus." });

    // LOGGING
    await createLog(db, {
      userId: req.user.id,
      action: "DELETE",
      targetType: "ROLE",
      targetId: String(id),
      changes: { note: "Deleted Role" },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        success: false,
        message: "Gagal menghapus: Peran ini masih digunakan oleh satu atau lebih pengguna.",
      });
    }
    console.error("Error saat menghapus peran:", error);
    res.status(500).json({ success: false, message: "Gagal menghapus peran." });
  }
});

export default router;
