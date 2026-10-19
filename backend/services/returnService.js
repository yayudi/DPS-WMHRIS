// backend/services/returnService.js
import * as returnRepo from "../repositories/returnRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";
import AppError from "../utils/AppError.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";
import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";
import { signals } from "./firebaseSignalService.js";

/**
 * Mengambil daftar item pending retur (status: 'RETURNED').
 *
 * @param {object} params - Filter dan pagination parameter
 * @param {number|string} [params.page=1]
 * @param {number|string} [params.limit=10]
 * @param {string} [params.search='']
 * @param {string|object} [params.source='']
 * @param {string} [params.startDate='']
 * @param {string} [params.endDate='']
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{
 *   rows: Array<object>,
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 * }>}
 */
export const getPendingReturnsService = async (params = {}, existingConnection = null) => {
  const { page, limit, offset } = normalizePagination(params, 10);
  const search = params.search || "";
  const source = params.source || "";
  const startDate = params.startDate || "";
  const endDate = params.endDate || "";

  return withConnection(async (connection) => {
    const { rows, total } = await returnRepo.getPendingReturns(connection, {
      limit,
      offset,
      search,
      source,
      startDate,
      endDate,
    });

    return {
      rows,
      pagination: formatPaginationMeta(total, page, limit),
    };
  }, existingConnection);
};

/**
 * Mengambil riwayat retur (marketplace dan manual).
 *
 * @param {object} params - Filter dan pagination parameter
 * @param {number|string} [params.page=1]
 * @param {number|string} [params.limit=10]
 * @param {string} [params.search='']
 * @param {string|object} [params.source='']
 * @param {string} [params.condition='']
 * @param {number|string} [params.locationId='']
 * @param {string} [params.startDate='']
 * @param {string} [params.endDate='']
 * @param {string} [params.sortOrder='desc']
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{
 *   rows: Array<object>,
 *   pagination: { page: number, limit: number, total: number, totalPages: number }
 * }>}
 */
export const getReturnHistoryService = async (params = {}, existingConnection = null) => {
  const { page, limit, offset } = normalizePagination(params, 10);
  const search = params.search || "";
  const source = params.source || "";
  const condition = params.condition || "";
  const locationId = params.locationId || "";
  const startDate = params.startDate || "";
  const endDate = params.endDate || "";
  const sortOrder = params.sortOrder || "desc";

  return withConnection(async (connection) => {
    const { rows, total } = await returnRepo.getReturnHistory(connection, {
      limit,
      offset,
      search,
      source,
      condition,
      locationId,
      sortOrder,
      startDate,
      endDate,
    });

    return {
      rows,
      pagination: formatPaginationMeta(total, page, limit),
    };
  }, existingConnection);
};

/**
 * Memvalidasi & menerima barang retur dari picking list (Full Return atau Partial Return).
 * Melakukan mutasi stok lokasi dan pencatatan riwayat secara atomik.
 *
 * @param {object} data
 * @param {number|string} data.itemId - ID item picking list yang diretur
 * @param {number|string} data.qtyAccepted - Kuantitas barang yang diterima
 * @param {number|string} data.locationId - ID lokasi gudang tujuan restock
 * @param {string} data.condition - Kondisi barang ('GOOD'|'BAD')
 * @param {string} [data.notes] - Catatan tambahan
 * @param {object|null} [userContext=null] - Konteks user { userId }
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, message: string, data: object }>}
 * @throws {AppError} Jika item tidak ditemukan atau kuantitas tidak valid
 */
export const approveReturnService = async (data, userContext = null, existingConnection = null) => {
  const { itemId, qtyAccepted, locationId, condition, notes } = data;
  const userId = userContext?.userId || 1;

  if (!itemId) {
    throw new AppError("Item ID wajib diisi.", 400, "VALIDATION_ERROR");
  }
  if (!locationId) {
    throw new AppError("Lokasi tujuan restock wajib diisi.", 400, "VALIDATION_ERROR");
  }

  return withTransaction(async (connection) => {
    // 1. Validasi Item Asli
    const item = await returnRepo.getItemById(connection, itemId);
    if (!item) {
      throw new AppError("Item picking tidak ditemukan.", 404, "NOT_FOUND");
    }

    if (item.status !== "RETURNED") {
      throw new AppError(
        `Item status bukan RETURNED (Status saat ini: ${item.status}). Tidak bisa divalidasi.`,
        400,
        "INVALID_STATUS",
      );
    }

    const qtyVal = parseInt(qtyAccepted, 10);
    if (isNaN(qtyVal) || qtyVal <= 0 || qtyVal > item.quantity) {
      throw new AppError(
        `Jumlah diterima (${qtyVal}) tidak valid. Maksimal: ${item.quantity}.`,
        400,
        "INVALID_QUANTITY",
      );
    }

    // 2. Proses Retur (Full vs Partial)
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

    // 3. Update Stok Fisik (Increment)
    await locationRepo.incrementStock(connection, item.product_id, locationId, qtyVal);

    // 4. Catat Log Pergerakan Stok
    await stockRepo.createLog(connection, {
      productId: item.product_id,
      quantity: qtyVal,
      toLocationId: locationId,
      type: "RETURN_INBOUND",
      userId,
      notes: `Validasi Retur #${itemId} (${condition}): ${notes || "-"}`,
    });

    // 5. Emit sinyal refresh stok non-blocking
    signals.refreshStock();

    return {
      success: true,
      message: `Retur berhasil diproses. Stok bertambah ${qtyVal} pcs.`,
      data: {
        itemId,
        productId: item.product_id,
        qtyAccepted: qtyVal,
        locationId,
        condition,
      },
    };
  }, existingConnection);
};

/**
 * Mencatat retur manual (barang nyasar / offline / tanpa picking list).
 * Melakukan penambahan stok fisik dan pencatatan log secara atomik.
 *
 * @param {object} data
 * @param {number|string} data.productId
 * @param {number|string} data.quantity
 * @param {string} data.condition - Kondisi barang ('GOOD'|'BAD')
 * @param {number|string} data.locationId - Lokasi fisik barang ditempatkan
 * @param {string} [data.reference] - Nomor resi / referensi retur
 * @param {string} [data.notes] - Catatan tambahan
 * @param {object|null} [userContext=null] - Konteks user { userId }
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, message: string, data: object }>}
 * @throws {AppError} Jika kuantitas atau parameter tidak valid
 */
export const createManualReturnService = async (
  data,
  userContext = null,
  existingConnection = null,
) => {
  const { productId, quantity, condition, locationId, reference, notes } = data;
  const userId = userContext?.userId || 1;

  if (!productId || !locationId) {
    throw new AppError("Produk dan lokasi tujuan wajib dipilih.", 400, "VALIDATION_ERROR");
  }

  const qtyVal = parseInt(quantity, 10);
  if (isNaN(qtyVal) || qtyVal <= 0) {
    throw new AppError("Jumlah kuantitas harus berupa angka lebih dari 0.", 400, "INVALID_QUANTITY");
  }

  return withTransaction(async (connection) => {
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

    // 3. Catat Log Pergerakan Stok
    await stockRepo.createLog(connection, {
      productId,
      quantity: qtyVal,
      toLocationId: locationId,
      type: "MANUAL_RETURN",
      userId,
      notes: `Manual Retur Ref: ${reference || "-"} (${condition})`,
    });

    // 4. Emit sinyal refresh stok non-blocking
    signals.refreshStock();

    return {
      success: true,
      message: "Retur manual berhasil dicatat.",
      data: {
        productId,
        quantity: qtyVal,
        locationId,
        condition,
        reference,
      },
    };
  }, existingConnection);
};
