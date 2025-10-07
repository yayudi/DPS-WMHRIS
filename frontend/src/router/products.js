import express from "express";
import db from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ambil produk (butuh login)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM products");
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal ambil produk" });
  }
});

export default router;
