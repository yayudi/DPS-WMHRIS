// File: backend/router/admin.js
import express from "express";
import bcrypt from "bcryptjs";
import db from "../config/db.js";
import { createLog } from "../repositories/systemLogRepository.js";

const router = express.Router();

// GET /api/admin/users - Mendapatkan semua user
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, u.nickname, u.role_id, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.username ASC
    `; // FIX: Menggunakan LEFT JOIN agar lebih defensif terhadap data role yang tidak sinkron
    const [users] = await db.query(query);
    res.json({ success: true, users });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/", async (req, res) => {
  console.log("[ADMIN ROUTER] Menerima request POST untuk membuat pengguna baru...");
  const { username, password, role_id, nickname } = req.body;

  // Validasi input
  if (!username || !password || !role_id) {
    return res
      .status(400)
      .json({ success: false, message: "Semua field (username, password, role) wajib diisi." });
  }

  try {
    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan ke database
    const [result] = await db.query(
      "INSERT INTO users (username, password_hash, role_id, nickname) VALUES (?, ?, ?, ?)",
      [username, hashedPassword, role_id, nickname || null]
    );

    const newUser = {
      id: result.insertId,
      username,
      nickname,
      role_id,
    };

    // LOGGING
    const adminId = req.user.id;
    await createLog(db, {
      userId: adminId,
      action: "CREATE",
      targetType: "USER",
      targetId: String(result.insertId),
      changes: { username, role_id, nickname },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({ success: true, message: "Pengguna berhasil dibuat.", data: newUser });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Username sudah digunakan." });
    }
    console.error("Error creating user:", error);
    res.status(500).json({ success: false, message: "Gagal membuat pengguna." });
  }
});

// GET /api/admin/users/roles - Mendapatkan semua role yang tersedia
router.get("/roles", async (req, res) => {
  try {
    const [roles] = await db.query("SELECT id, name FROM roles ORDER BY name ASC");
    res.json({ success: true, roles });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/admin/users/:id - Mengupdate role user
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { username, nickname, newPassword, role_id } = req.body;

  // Validasi dasar
  if (!username || !role_id) {
    return res.status(400).json({ success: false, message: "Username dan role wajib diisi." });
  }

  try {
    const updateFields = [];
    const updateValues = [];

    // Bangun query secara dinamis
    updateFields.push("username = ?");
    updateValues.push(username);

    updateFields.push("nickname = ?");
    updateValues.push(nickname || null);

    updateFields.push("role_id = ?");
    updateValues.push(role_id);

    // Hanya update password jika diisi
    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push("password_hash = ?");
      updateValues.push(hashedPassword);
    }

    const query = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;
    updateValues.push(id);

    await db.query(query, updateValues);

    // LOGGING
    const adminId = req.user.id;
    await createLog(db, {
      userId: adminId,
      action: "UPDATE",
      targetType: "USER",
      targetId: String(id),
      changes: {
        note: "Updated User Profile",
        updates: { username, nickname, role_id, passwordChanged: !!newPassword }
      },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ success: true, message: "Data pengguna berhasil diperbarui." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ success: false, message: `Username '${username}' sudah digunakan.` });
    }
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Gagal memperbarui data pengguna." });
  }
});

// DELETE /api/admin/users/:id - Menghapus user
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Pencegahan agar admin tidak bisa menghapus dirinya sendiri
  if (parseInt(id, 10) === req.user.id) {
    return res
      .status(400)
      .json({ success: false, message: "Anda tidak bisa menghapus akun Anda sendiri." });
  }

  try {
    await db.query("DELETE FROM users WHERE id = ?", [id]);

    // LOGGING
    await createLog(db, {
      userId: req.user.id,
      action: "DELETE",
      targetType: "USER",
      targetId: String(id),
      changes: { note: "Deleted User" },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ success: true, message: "User berhasil dihapus." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * --- ENDPOINT BARU ---
 * GET /api/admin/users/:id/locations
 * Mengambil ID lokasi yang diizinkan untuk pengguna tertentu.
 */
router.get("/:id/locations", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query("SELECT location_id FROM user_locations WHERE user_id = ?", [id]);
    const locationIds = rows.map((row) => row.location_id);
    res.json({ success: true, data: locationIds });
  } catch (error) {
    console.error("Error fetching user locations:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * --- ENDPOINT BARU ---
 * PUT /api/admin/users/:id/locations
 * Mengatur atau memperbarui izin lokasi untuk pengguna tertentu.
 */
router.put("/:id/locations", async (req, res) => {
  const { id } = req.params;
  const { locationIds } = req.body; // Harapkan sebuah array ID lokasi, e.g., [1, 5, 12]

  if (!Array.isArray(locationIds)) {
    return res.status(400).json({ success: false, message: "Input harus berupa array ID lokasi." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query("DELETE FROM user_locations WHERE user_id = ?", [id]);

    if (locationIds.length > 0) {
      const values = locationIds.map((locationId) => [id, locationId]);
      await connection.query("INSERT INTO user_locations (user_id, location_id) VALUES ?", [
        values,
      ]);
    }

    // LOGGING
    await createLog(connection, {
      userId: req.user.id,
      action: "UPDATE",
      targetType: "USER",
      targetId: String(id),
      changes: { note: "Updated User Locations", locationIds },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await connection.commit();
    res.json({ success: true, message: "Izin lokasi pengguna berhasil diperbarui." });
  } catch (error) {
    if (connection) await connection.rollback();
    // Tangani jika location_id tidak valid
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res
        .status(400)
        .json({ success: false, message: "Satu atau lebih ID lokasi tidak valid." });
    }
    console.error("Error updating user locations:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
