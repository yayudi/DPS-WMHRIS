// backend\router\user.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

const router = express.Router();

// GET /user/profile
router.get("/profile", async (req, res) => {
  try {
    // Ambil data dasar dari token (req.user)
    const tokenUser = req.user;
    const [userRows] = await db.query("SELECT nickname FROM users WHERE id = ?", [tokenUser.id]);
    const dbUser = userRows[0] || {}; // Default ke objek kosong jika tidak ditemukan
    const completeUser = {
      ...tokenUser, // (id, username, role_id, permissions, dll.)
      nickname: dbUser.nickname, // (nickname terbaru dari DB)
    };

    res.json({
      success: true,
      message: `Data profil untuk ${completeUser.username} berhasil diambil.`,
      user: completeUser, // Kirim data yang sudah digabung
    });
  } catch (error) {
    console.error("Error saat mengambil profil lengkap user:", error);
    res.status(500).json({ success: false, message: "Server error saat mengambil profil." });
  }
});

// PUT /user/profile
router.put("/profile", async (req, res) => {
  const { currentPassword, nickname, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Password saat ini diperlukan untuk menyimpan perubahan." });
  }

  try {
    const [userRows] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0)
      return res.status(404).json({ success: false, message: "User tidak ditemukan." });

    const user = userRows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch)
      return res.status(403).json({ success: false, message: "Password saat ini salah." });

    let updateFields = [],
      updateValues = [];

    if (nickname !== undefined && nickname !== user.nickname) {
      updateFields.push("nickname = ?");
      updateValues.push(nickname);
    }

    if (newPassword) {
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push("password_hash = ?");
      updateValues.push(hashedNewPassword);
    }

    if (updateFields.length > 0) {
      const query = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;
      updateValues.push(userId);
      await db.query(query, updateValues);
    }

    // ✅ PERBAIKAN: Ambil juga 'nickname' dari database setelah update
    const [updatedUserRows] = await db.query(
      "SELECT id, username, nickname, role_id FROM users WHERE id = ?",
      [userId]
    );
    const updatedUser = updatedUserRows[0];

    // Log untuk memastikan versi ini yang berjalan
    console.log("[DEBUG] Mengirim kembali data user yang sudah diupdate:", updatedUser);

    res.json({
      success: true,
      message: "Data akun berhasil diperbarui.",
      user: updatedUser, // Kirim data user yang sudah lengkap dan diperbarui
    });
  } catch (err) {
    console.error("Error saat update profil:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  }
});

/**
 * GET /api/user/my-locations
 * Mengambil semua lokasi yang diizinkan untuk pengguna yang sedang login.
 */
router.get("/my-locations", async (req, res) => {
  const userId = req.user.id;
  try {
    const query = `
        SELECT l.id, l.code, l.building, l.floor, l.name
        FROM locations l
        JOIN user_locations ul ON l.id = ul.location_id
        WHERE ul.user_id = ?
        ORDER BY l.code
    `;
    const [locations] = await db.query(query, [userId]);
    res.json({ success: true, data: locations });
  } catch (error) {
    console.error(`Error saat mengambil lokasi untuk user ID ${userId}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil data lokasi." });
  }
});

export default router;
