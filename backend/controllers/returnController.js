// backend/controllers/returnController.js
import db from "../config/db.js";
import * as returnRepo from "../repositories/returnRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

/**
 * GET: Ambil daftar barang yang statusnya RETURNED
 * (Barang retur dari marketplace yang sudah sampai gudang tapi belum divalidasi)
 */
export const getPendingReturns = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const items = await returnRepo.getPendingReturns(connection);

    res.json({ success: true, data: items });
  } catch (error) {
    console.error("[Return] Get Pending Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil antrian retur." });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * GET: Ambil Riwayat Retur
 * Menggabungkan data retur marketplace dan retur manual
 */
export const getReturnHistory = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    // Validasi & Default Limit
    const limit = Math.max(1, parseInt(req.query.limit) || 1000);

    const items = await returnRepo.getReturnHistory(connection, limit);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error("[Return] Get History Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat retur." });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * POST: Validasi & Terima Barang Retur (Picking Item)
 * Menangani Full Return maupun Partial Return (Split)
 */
export const approveReturn = async (req, res) => {
  const { itemId, qtyAccepted, condition, locationId, notes } = req.body;
  const userId = req.user?.id || 1;

  // 1. Validasi Input Dasar
  if (!itemId || !qtyAccepted || !locationId || !condition) {
    return res.status(400).json({
      success: false,
      message: "Data tidak lengkap. ID, Qty, Lokasi, dan Kondisi wajib diisi.",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 2. Validasi Item Asli
    const item = await returnRepo.getItemById(connection, itemId);
    if (!item) {
      throw new Error("Item picking tidak ditemukan.");
    }

    if (item.status !== "RETURNED") {
      throw new Error(
        `Item status bukan RETURNED (Status saat ini: ${item.status}). Tidak bisa divalidasi.`
      );
    }

    const qtyVal = parseInt(qtyAccepted, 10);
    if (qtyVal <= 0 || qtyVal > item.quantity) {
      throw new Error(`Jumlah diterima (${qtyVal}) tidak valid. Maksimal: ${item.quantity}.`);
    }

    // 3. Proses Retur (Full vs Partial)
    if (qtyVal === item.quantity) {
      // CASE A: Full Return -> Update item eksisting langsung
      await returnRepo.completeReturnItem(connection, itemId, {
        condition,
        notes,
        locationId,
      });
    } else {
      // CASE B: Partial Return -> Split Item

      // a. Kurangi qty item lama (sisa yang belum diproses)
      await returnRepo.decreaseItemQty(connection, itemId, qtyVal);

      // b. Buat item baru untuk bagian yang SUKSES diretur (COMPLETED_RETURN)
      await returnRepo.createSplitReturnItem(connection, item, {
        qtyReturn: qtyVal,
        condition,
        notes,
        locationId,
      });
    }

    // 4. Update Stok Fisik (Increment)
    // Barang masuk kembali ke lokasi yang dipilih (baik kondisi Bagus atau Rusak, tetap masuk lokasi fisik)
    await locationRepo.incrementStock(connection, item.product_id, locationId, qtyVal);

    // 5. Catat Log Pergerakan Stok
    await stockRepo.createLog(connection, {
      productId: item.product_id,
      quantity: qtyVal,
      toLocationId: locationId,
      type: "RETURN_INBOUND",
      userId: userId,
      notes: `Validasi Retur #${itemId} (${condition}): ${notes || "-"}`,
    });

    await connection.commit();

    res.json({
      success: true,
      message: `Retur berhasil diproses. Stok bertambah ${qtyVal} pcs.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("[Return] Approve Error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * POST: Retur Manual (Barang Nyasar / Offline / Tanpa Picking List)
 */
export const createManualReturn = async (req, res) => {
  const { productId, quantity, condition, locationId, reference, notes } = req.body;
  const userId = req.user?.id || 1;

  if (!productId || !quantity || !locationId) {
    return res.status(400).json({
      success: false,
      message: "Produk, Qty, dan Lokasi Tujuan wajib diisi.",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const qtyVal = parseInt(quantity, 10);

    // 1. Insert ke Tabel Manual Returns
    await returnRepo.createManualReturn(connection, {
      userId,
      productId,
      quantity: qtyVal,
      condition,
      reference,
      notes,
    });

    // 2. Tambah Stok Fisik
    await locationRepo.incrementStock(connection, productId, locationId, qtyVal);

    // 3. Catat Log Pergerakan
    await stockRepo.createLog(connection, {
      productId: productId,
      quantity: qtyVal,
      toLocationId: locationId,
      type: "MANUAL_RETURN",
      userId: userId,
      notes: `Manual Retur Ref: ${reference || "-"} (${condition})`,
    });

    await connection.commit();
    res.json({ success: true, message: "Retur manual berhasil dicatat." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("[Return] Manual Create Error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
};
