// router/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

const router = express.Router();

// LOGIN
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Username dan password tidak boleh kosong." });
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "User tidak ditemukan" });
    }

    const user = rows[0];

    if (!user.password_hash) {
      console.error(`[AUTH ERROR] User '${username}' tidak memiliki hash password di database.`);
      return res
        .status(500)
        .json({ success: false, message: "Konfigurasi akun error. Hubungi administrator." });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ success: false, message: "Password salah" });
    }

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

    const payload = {
      id: user.id,
      username: user.username,
      role: role,
      role_id: user.role_id,
      permissions: permissions,
    };

    // JWT_SECRET dari .env
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "8h" });

    res.json({
      success: true,
      token,
      user: payload,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOGOUT (opsional, cukup hapus token di frontend)
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

export default router;
