// File: backend/router/auth.js

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username dan password diperlukan" });
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Username atau password salah" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (isMatch) {
      const payload = {
        id: user.id,
        username: user.username,
        role_id: user.role_id,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

      return res.json({ success: true, message: "Login berhasil", token: token });
    } else {
      return res.status(401).json({ success: false, message: "Username atau password salah" });
    }
  } catch (err) {
    console.error("Database error saat login:", err);
    // Kirim detail error ke frontend HANYA UNTUK DEBUGGING
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server (lihat detail error)",
      // Kita tambahkan detail error di sini
      error: {
        message: err.message,
        stack: err.stack,
        code: err.code, // Jika ada kode error spesifik
      },
    });
  }
});

router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username dan password diperlukan" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
      username,
      hashedPassword,
    ]);
    res.status(201).json({ success: true, message: "User berhasil dibuat" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Username sudah digunakan" });
    }
    console.error("Database error saat register:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  }
});

export default router;
