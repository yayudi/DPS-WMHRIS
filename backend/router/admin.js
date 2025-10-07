// File: backend/router/admin.js
import express from "express";
import db from "../config/db.js";

const router = express.Router();

// GET /api/admin/users - Mendapatkan semua user
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, u.role_id, r.name AS role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.id ASC
    `;
    const [users] = await db.query(query);
    res.json({ success: true, users });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/admin/users/roles - Mendapatkan semua role yang tersedia
router.get("/roles", async (req, res) => {
  try {
    const [roles] = await db.query("SELECT id, name FROM roles ORDER BY id ASC");
    res.json({ success: true, roles });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/admin/users/:id - Mengupdate role user
router.put("/:id", async (req, res) => {
  const { role_id } = req.body;
  const { id } = req.params;

  if (!role_id || isNaN(parseInt(role_id))) {
    return res.status(400).json({ success: false, message: "Role tidak valid." });
  }

  try {
    await db.query("UPDATE users SET role_id = ? WHERE id = ?", [role_id, id]);
    res.json({ success: true, message: "Role user berhasil diupdate." });
  } catch (err) {
    // Penanganan error jika role_id yang dikirim tidak ada di tabel 'roles'
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({ success: false, message: "Role ID tidak ditemukan." });
    }
    console.error("Error updating user role:", err);
    res.status(500).json({ success: false, message: "Server error" });
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
    res.json({ success: true, message: "User berhasil dihapus." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
