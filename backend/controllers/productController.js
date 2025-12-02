// backend\controllers\productController.js
import db from "../config/db.js";

export const createProduct = async (req, res) => {
  const { sku, name, price, is_package } = req.body;

  // Basic validation
  if (!sku || !name) {
    return res.status(400).json({
      success: false,
      message: "SKU dan Nama Produk wajib diisi.",
    });
  }

  try {
    // Check if SKU already exists
    const [existing] = await db.query("SELECT id FROM products WHERE sku = ?", [sku]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "SKU ini sudah terdaftar.",
      });
    }

    // Insert new product
    const [result] = await db.query(
      `INSERT INTO products (sku, name, price, is_package, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [sku, name, price || 0, is_package ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      message: "Produk berhasil ditambahkan.",
      productId: result.insertId,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan produk.",
      error: error.message,
    });
  }
};

// You can add getAllProducts, updateProduct, deleteProduct here later
