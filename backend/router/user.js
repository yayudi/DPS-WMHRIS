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
  const userId = req.user.id;

  if (!currentPassword) {
    return res.status(400).json({ success: false, message: "Password saat ini diperlukan." });
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
    if (newUsername && newUsername !== user.username) {
      updateFields.push("username = ?");
      updateValues.push(newUsername);
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

    // --- PEMBUATAN TOKEN BARU YANG SUDAH DIPERBAIKI ---
    let newToken = null;
    // Buat token baru jika username berubah ATAU jika tidak ada yang berubah (untuk konsistensi)
    // Ini memastikan frontend selalu bisa memperbarui data user.
    const [roleRows] = await db.query(
      `
            SELECT r.name as role, p.name as permission
            FROM roles r
            LEFT JOIN role_permission rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE r.id = ?
        `,
      [user.role_id]
    );

    const permissions = roleRows.map((row) => row.permission).filter((p) => p);
    const role = roleRows[0]?.role || "user";

    // Buat payload yang lengkap, sama seperti di auth.js
    const updatedPayload = {
      id: user.id,
      username: newUsername || user.username, // Gunakan username baru jika ada
      role: role,
      role_id: user.role_id,
      permissions: permissions,
    };

    newToken = jwt.sign(updatedPayload, process.env.JWT_SECRET, { expiresIn: "8h" });

    res.json({
      success: true,
      message: "Data akun berhasil diperbarui.",
      token: newToken,
      user: updatedPayload, // Kirim juga data user yang sudah diperbarui
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ success: false, message: "Username baru sudah digunakan." });
    console.error("Error saat update profil:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  }
});

export default router;
