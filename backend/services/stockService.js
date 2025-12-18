// backend/services/stockService.js
import db from "../config/db.js";
import ExcelJS from "exceljs";

// REPOSITORIES
import * as productRepo from "../repositories/productRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

// ==============================================================================
// INTERNAL HELPER: SMART ITEM RESOLVER (The "Brain")
// ==============================================================================

/**
 * Menerima array pergerakan stok (SKU & Qty), lalu:
 * Validasi SKU ke DB.
 * Cek apakah Paket? Jika ya, pecah jadi komponen.
 * Kembalikan array item FISIK yang siap diproses stoknya.
 */
const resolveInventoryItems = async (connection, movements) => {
  const resolvedItems = [];
  const skuSet = new Set(movements.map((m) => m.sku));

  // Bulk Fetch Info Produk & Komponen
  const productMap = await productRepo.getProductMapWithComponents(connection, Array.from(skuSet));

  for (const mov of movements) {
    const product = productMap.get(mov.sku);

    if (!product) {
      throw new Error(`SKU '${mov.sku}' tidak ditemukan di database.`);
    }

    // Logic Pecah Paket
    if (product.is_package) {
      if (!product.components || product.components.length === 0) {
        throw new Error(
          `Produk Paket "${product.name}" (${product.sku}) tidak memiliki komponen terdaftar.`
        );
      }

      // Breakdown komponen
      product.components.forEach((comp) => {
        resolvedItems.push({
          productId: comp.id,
          sku: comp.sku,
          name: comp.name || comp.sku,
          quantity: mov.quantity * comp.qty_ratio,
          fromLocationId: mov.fromLocationId,
          toLocationId: mov.toLocationId,
          isComponent: true,
          parentSku: product.sku,
        });
      });
    } else {
      // Produk Biasa
      resolvedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: mov.quantity,
        fromLocationId: mov.fromLocationId,
        toLocationId: mov.toLocationId,
        isComponent: false,
      });
    }
  }

  return resolvedItems;
};

// ==============================================================================
// CORE SERVICES (Transfer & Adjust)
// ==============================================================================

/**
 * Service: Transfer Stok (Single)
 */
export const transferStockService = async ({
  productId,
  fromLocationId,
  toLocationId,
  quantity,
  userId,
  notes,
}) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query("SELECT sku, name FROM products WHERE id = ?", [
      productId,
    ]);
    if (rows.length === 0) throw new Error("Produk tidak ditemukan.");
    const sku = rows[0].sku;

    const itemsToMove = await resolveInventoryItems(connection, [
      { sku, quantity, fromLocationId, toLocationId },
    ]);

    for (const item of itemsToMove) {
      // Validasi Stok
      const currentStock = await locationRepo.getStockAtLocation(
        connection,
        item.productId,
        fromLocationId,
        true
      );
      if (currentStock < item.quantity) {
        throw new Error(
          `Stok tidak cukup untuk ${item.sku}. Butuh: ${item.quantity}, Ada: ${currentStock}.` +
            (item.isComponent ? ` (Komponen dari paket ${item.parentSku})` : "")
        );
      }

      // Eksekusi
      await locationRepo.deductStock(connection, item.productId, fromLocationId, item.quantity);
      await locationRepo.incrementStock(connection, item.productId, toLocationId, item.quantity);

      // Log
      const finalNote = item.isComponent ? `${notes} [Komponen Paket ${item.parentSku}]` : notes;
      await stockRepo.createLog(connection, {
        productId: item.productId,
        quantity: item.quantity,
        fromLocationId,
        toLocationId,
        type: "TRANSFER",
        userId,
        notes: finalNote,
      });
    }

    await connection.commit();
    return { success: true, message: "Transfer berhasil." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Service: Adjust Stock (Single)
 */
export const adjustStockService = async ({ productId, locationId, quantity, userId, notes }) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query("SELECT sku FROM products WHERE id = ?", [productId]);
    if (rows.length === 0) throw new Error("Produk tidak ditemukan.");

    // Helper Resolver (Juga memecah paket saat opname jika user opname paket!)
    const itemsToAdjust = await resolveInventoryItems(connection, [
      { sku: rows[0].sku, quantity: Math.abs(quantity) },
    ]);

    for (const item of itemsToAdjust) {
      // Balikkan tanda negatif jika quantity awal negatif
      const realQty = quantity < 0 ? -item.quantity : item.quantity;

      if (realQty < 0) {
        const currentStock = await locationRepo.getStockAtLocation(
          connection,
          item.productId,
          locationId,
          true
        );
        if (currentStock + realQty < 0) {
          throw new Error(`Stok ${item.sku} tidak cukup untuk dikurangi.`);
        }
      }

      await locationRepo.incrementStock(connection, item.productId, locationId, realQty);

      const finalNote = item.isComponent ? `${notes} [Adj Paket ${item.parentSku}]` : notes;
      await stockRepo.createLog(connection, {
        productId: item.productId,
        quantity: Math.abs(realQty),
        toLocationId: locationId,
        type: "ADJUSTMENT",
        userId,
        notes: finalNote,
      });
    }

    await connection.commit();
    return { success: true, message: "Penyesuaian stok berhasil." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Service: Process Batch Movements (INBOUND, RETURN, TRANSFER, etc)
 */
export const processBatchMovementsService = async ({
  type,
  fromLocationId,
  toLocationId,
  notes,
  movements,
  userId,
  userRoleId,
}) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Permission Check
    if (type === "TRANSFER" || type === "ADJUSTMENT") {
      if (userRoleId !== 1) {
        const locationToCheck = type === "TRANSFER" ? fromLocationId : toLocationId;
        if (!locationToCheck) throw new Error("Lokasi wajib diisi untuk operasi ini.");

        const [permissionRows] = await connection.query(
          "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
          [userId, locationToCheck]
        );
        if (permissionRows.length === 0)
          throw new Error("Akses ditolak. Anda tidak memiliki izin untuk lokasi ini.");
      }
    }

    // Resolve Items
    const mappedMovements = movements.map((m) => ({
      sku: m.sku,
      quantity: m.quantity,
      fromLocationId: type === "TRANSFER_MULTI" ? m.fromLocationId : fromLocationId,
      toLocationId: type === "TRANSFER_MULTI" ? m.toLocationId : toLocationId,
    }));

    const resolvedItems = await resolveInventoryItems(connection, mappedMovements);

    // Process Physical Items
    for (const item of resolvedItems) {
      const {
        productId,
        quantity,
        fromLocationId: srcLoc,
        toLocationId: destLoc,
        isComponent,
        parentSku,
      } = item;
      const itemNote = isComponent ? `${notes} [Via ${parentSku}]` : notes;

      switch (type) {
        case "TRANSFER":
        case "TRANSFER_MULTI":
          if (!srcLoc || !destLoc)
            throw new Error(`Lokasi asal/tujuan tidak valid untuk ${item.sku}`);

          if (type === "TRANSFER_MULTI" && userRoleId !== 1) {
            const [perm] = await connection.query(
              "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
              [userId, srcLoc]
            );
            if (perm.length === 0)
              throw new Error(`Akses ditolak untuk lokasi asal SKU '${item.sku}'.`);
          }

          const currentStock = await locationRepo.getStockAtLocation(
            connection,
            productId,
            srcLoc,
            true
          );
          if (currentStock < quantity)
            throw new Error(
              `Stok SKU '${item.sku}' kurang. Ada: ${currentStock}, Butuh: ${quantity}.`
            );

          await locationRepo.deductStock(connection, productId, srcLoc, quantity);
          await locationRepo.incrementStock(connection, productId, destLoc, quantity);
          await stockRepo.createLog(connection, {
            productId,
            quantity,
            fromLocationId: srcLoc,
            toLocationId: destLoc,
            type: "TRANSFER",
            userId,
            notes: itemNote,
          });
          break;

        case "INBOUND":
        case "RETURN":
          if (!destLoc) throw new Error("Lokasi tujuan wajib diisi.");
          await locationRepo.incrementStock(connection, productId, destLoc, quantity);
          await stockRepo.createLog(connection, {
            productId,
            quantity,
            fromLocationId: null,
            toLocationId: destLoc,
            type,
            userId,
            notes: itemNote,
          });
          break;

        case "ADJUSTMENT":
          if (!destLoc) throw new Error("Lokasi wajib diisi.");
          const originalMov = movements.find((m) => m.sku === (item.parentSku || item.sku));
          const isNegative = originalMov && originalMov.quantity < 0;
          const finalQty = isNegative ? -quantity : quantity;

          await locationRepo.incrementStock(connection, productId, destLoc, finalQty);
          await stockRepo.createLog(connection, {
            productId,
            quantity: Math.abs(finalQty),
            toLocationId: destLoc,
            type: "ADJUSTMENT",
            userId,
            notes: itemNote,
          });
          break;

        default:
          throw new Error(`Tipe pergerakan '${type}' tidak dikenal.`);
      }
    }

    await connection.commit();
    return { success: true, count: resolvedItems.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Service: Batch Stock Transfer
 */
export const batchTransferService = async ({
  fromLocationId,
  toLocationId,
  movements,
  userId,
  userRoleId,
}) => {
  return processBatchMovementsService({
    type: "TRANSFER",
    fromLocationId,
    toLocationId,
    notes: "Batch Transfer",
    movements,
    userId,
    userRoleId,
  });
};

// ==============================================================================
// READ SERVICES (Legacy Logic Refactored)
// ==============================================================================

export const generateAdjustmentTemplateService = async () => {
  const connection = await db.getConnection();
  try {
    const locationCodes = await locationRepo.getAllLocationCodes(connection);

    const workbook = new ExcelJS.Workbook();
    const mainSheet = workbook.addWorksheet("Input Stok");
    const validationSheet = workbook.addWorksheet("DataValidasi");

    validationSheet.state = "hidden";
    validationSheet.getColumn("A").values = locationCodes;

    mainSheet.columns = [
      { header: "SKU", key: "sku", width: 25 },
      { header: "LT (Lokasi)", key: "location", width: 20 },
      { header: "ACTUAL", key: "actual", width: 10 },
      { header: "NOTES", key: "notes", width: 35 },
    ];
    mainSheet.getRow(1).font = { bold: true };

    const validationFormula = `DataValidasi!$A$1:$A$${locationCodes.length}`;

    for (let i = 2; i <= 1002; i++) {
      mainSheet.getCell(`B${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [validationFormula],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Lokasi Tidak Valid",
        error: "Silakan pilih lokasi yang valid dari daftar dropdown.",
      };
    }
    return workbook;
  } finally {
    connection.release();
  }
};

export const getStockHistoryService = async (productId, page = 1, limit = 15) => {
  const offset = (page - 1) * limit;
  const connection = await db.getConnection();
  try {
    const countQuery = "SELECT COUNT(*) as total FROM stock_movements WHERE product_id = ?";
    const [totalRows] = await connection.query(countQuery, [productId]);

    const historyQuery = `
    SELECT
      sm.id,
      sm.quantity,
      sm.movement_type,
      sm.notes,
      sm.created_at,
      u.username as user,
      from_loc.code as from_location,
      to_loc.code as to_location
    FROM stock_movements sm
    JOIN users u ON sm.user_id = u.id
    LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
    LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
    WHERE sm.product_id = ?
    ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`;

    const [history] = await connection.query(historyQuery, [productId, limit, offset]);
    return { data: history, pagination: { total: totalRows[0].total, page, limit } };
  } finally {
    connection.release();
  }
};

export const getBatchLogsService = async (startDate, endDate) => {
  const connection = await db.getConnection();
  try {
    const query = `
    SELECT sm.id,
      p.sku,
      p.name as product_name,
      sm.quantity,
      sm.movement_type,
      sm.notes,
      sm.created_at,
      u.username as user,
      from_loc.code as from_location,
      to_loc.code as to_location
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    JOIN users u ON sm.user_id = u.id
    LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
    LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
    WHERE sm.created_at BETWEEN ? AND ?
    ORDER BY sm.created_at DESC`;

    const [logs] = await connection.query(query, [startDate, `${endDate} 23:59:59`]);
    return logs;
  } finally {
    connection.release();
  }
};

export const validateReturnService = async ({ pickingListItemId, returnToLocationId, userId }) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [itemRows] = await connection.query(
      `SELECT product_id, quantity FROM picking_list_items WHERE id = ? AND status = 'RETURNED' FOR UPDATE`,
      [pickingListItemId]
    );

    if (itemRows.length === 0) throw new Error("Item retur tidak ditemukan atau sudah diproses.");
    const { product_id, quantity } = itemRows[0];

    await locationRepo.incrementStock(connection, product_id, returnToLocationId, quantity);
    await stockRepo.createLog(connection, {
      productId: product_id,
      quantity,
      toLocationId: returnToLocationId,
      type: "RETURN",
      userId,
      notes: `Validasi Retur Item ID: ${pickingListItemId}`,
    });
    await connection.query(
      "UPDATE picking_list_items SET status = 'COMPLETED_RETURN' WHERE id = ?",
      [pickingListItemId]
    );

    await connection.commit();
    return { success: true, message: `Item (ID: ${pickingListItemId}) berhasil divalidasi.` };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
