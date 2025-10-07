// backend/router/user.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

const router = express.Router();

console.log("--- MEMUAT FILE router/user.js VERSI TERBARU ---");

// Rute yang sudah ada: GET /api/user/profile
router.get("/profile", (req, res) => {
  res.json({
    success: true,
    message: `Data profil untuk ${req.user.username} berhasil diambil.`,
    user: req.user,
  });
});

// --- RUTE BARU: PUT /api/user/profile ---
// Untuk mengupdate data user (username atau password)
router.put("/profile", async (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const userId = req.user.id; // Ambil ID user dari token yang sudah diverifikasi

  // 1. Validasi: Password saat ini wajib ada untuk perubahan apapun
  if (!currentPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Password saat ini diperlukan untuk melakukan perubahan." });
  }

  try {
    const [rows] = await db.query("SELECT password_hash FROM users WHERE id = ?", [userId]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "User tidak ditemukan." });
    const user = rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch)
      return res.status(403).json({ success: false, message: "Password saat ini salah." });

    let updateFields = [],
      updateValues = [];
    if (newUsername && newUsername !== req.user.username) {
      updateFields.push("username = ?");
      updateValues.push(newUsername);
    }
    if (newPassword) {
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push("password_hash = ?");
      updateValues.push(hashedNewPassword);
    }
    if (updateFields.length === 0)
      return res.json({ success: true, message: "Tidak ada data yang diubah." });

    const query = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;
    updateValues.push(userId);
    await db.query(query, updateValues);

    let newToken = null;
    if (newUsername) {
      const payload = { id: userId, username: newUsername };
      newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
    }
    res.json({ success: true, message: "Data akun berhasil diperbarui.", token: newToken });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ success: false, message: "Username baru sudah digunakan." });
    console.error("Error saat update profil:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  }
});

export default router;
