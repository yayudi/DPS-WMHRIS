// backend/services/productService.js
import db from "../config/db.js";
import * as productRepo from "../repositories/productRepository.js";

// Helper Internal: Mencatat Log Audit hanya jika ada perubahan
const logChange = async (connection, productId, userId, action, field, oldVal, newVal) => {
  if (oldVal !== newVal) {
    await productRepo.insertAuditLog(connection, {
      productId,
      userId,
      action,
      field,
      oldVal,
      newVal,
    });
  }
};

export const createProductService = async (data, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 1. Business Logic: Cek Duplikasi SKU
    const existingId = await productRepo.getIdBySku(connection, data.sku);
    if (existingId) {
      const error = new Error("SKU sudah terdaftar.");
      error.code = "DUPLICATE_SKU";
      throw error;
    }

    // 2. Insert Product
    const newId = await productRepo.createProduct(connection, data);

    // 3. Log Creation
    await logChange(connection, newId, userId, "CREATE", "all", null, data.sku);

    // 4. Handle Package Components
    if (data.is_package && data.components?.length > 0) {
      await productRepo.insertComponents(connection, newId, data.components);
    }

    await connection.commit();
    return newId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateProductService = async (id, data, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 1. Ambil Data Lama untuk Audit Log
    const oldData = await productRepo.getProductById(connection, id);
    if (!oldData) {
      const error = new Error("Produk tidak ditemukan.");
      error.code = "PRODUCT_NOT_FOUND";
      throw error;
    }

    // 2. Update Product Core Data
    await productRepo.updateProduct(connection, id, data);

    // 3. Audit Log Logic (Compare fields)
    const fieldsToCheck = [
      { key: "name", label: "Nama Produk" },
      { key: "price", label: "Harga", type: "number" },
      { key: "weight", label: "Berat", type: "number" },
      { key: "is_package", label: "Tipe Paket", type: "bool" },
    ];

    for (const field of fieldsToCheck) {
      let oldVal = oldData[field.key];
      let newVal = data[field.key];

      // Normalisasi tipe data untuk perbandingan akurat
      if (field.type === "number") {
        oldVal = parseFloat(oldVal || 0);
        newVal = parseFloat(newVal || 0);
      } else if (field.type === "bool") {
        oldVal = !!oldVal; // force boolean
        newVal = !!newVal;
      }

      await logChange(connection, id, userId, "UPDATE", field.key, oldVal, newVal);
    }

    // 4. Handle Package Components (Selalu replace logic untuk konsistensi)
    // Hapus komponen lama (baik tipe tetap paket atau berubah jadi satuan)
    await productRepo.deleteComponents(connection, id);

    if (data.is_package && data.components?.length > 0) {
      await productRepo.insertComponents(connection, id, data.components);

      // Generic log untuk perubahan struktur komponen
      // (Kita tidak log detail per item komponen untuk menghemat baris log)
      await logChange(
        connection,
        id,
        userId,
        "UPDATE",
        "components",
        "Old Components",
        `${data.components.length} Items`
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const softDeleteProductService = async (id, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    await productRepo.updateProductStatus(connection, id, false); // Active = false
    await logChange(connection, id, userId, "DELETE", "status", "Active", "Archived");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const restoreProductService = async (id, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    await productRepo.updateProductStatus(connection, id, true); // Active = true
    await logChange(connection, id, userId, "RESTORE", "status", "Archived", "Active");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Wrapper untuk Read operations agar Controller tetap bisa akses via Service layer jika diinginkan
// (Saat ini controller akan bypass langsung ke Repo untuk Read demi efisiensi)
