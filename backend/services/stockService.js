import { withTransaction, withConnection } from "../utils/dbUtils.js";
import { buildTriStateWhere } from "../utils/sqlUtils.js";
import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";
import Logger from "../utils/logger.js";
import ExcelJS from "exceljs";

// REPOSITORIES
import * as productRepo from "../repositories/productRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";
import * as userRepo from "../repositories/userRepository.js";
import * as pickingRepo from "../repositories/pickingRepository.js";

// SERVICES
import * as notificationService from "./notificationService.js";
import { signals } from "./firebaseSignalService.js";

// ==============================================================================
// INTERNAL HELPER: SMART ITEM RESOLVER (The "Brain")
// ==============================================================================

/**
 * Menerima array pergerakan stok (SKU & Qty), lalu:
 * - Validasi SKU ke DB
 * - Cek apakah Paket? Jika ya, pecah jadi komponen
 * - Kembalikan array item FISIK yang siap diproses stoknya
 * @param {import('mysql2/promise').Connection} connection
 * @param {Array<{ sku: string, quantity: number, [key: string]: any }>} movements
 * @returns {Promise<Array<{ productId: number, sku: string, quantity: number, isComponent?: boolean, parentSku?: string, [key: string]: any }>>}
 */
const resolveInventoryItems = async (connection, movements) => {
  const resolvedItems = [];
  const skuSet = new Set(movements.map((m) => m.sku));

  // Bulk Fetch Info Produk & Komponen
  const productMap = await productRepo.getProductMapWithComponents(connection, Array.from(skuSet));

  for (const mov of movements) {
    const product = productMap.get(mov.sku.toUpperCase());

    if (!product) {
      throw new Error(`SKU '${mov.sku}' tidak ditemukan di database.`);
    }

    // Logic Pecah Paket
    if (product.is_package) {
      if (!product.components || product.components.length === 0) {
        throw new Error(
          `Produk Paket "${product.name}" (${product.sku}) tidak memiliki komponen terdaftar.`,
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
          notes: mov.notes,
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
        notes: mov.notes,
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
export const transferStockService = async (
  { productId, fromLocationId, toLocationId, quantity, userId, notes },
  existingConnection = null,
) => {
  return withTransaction(async (connection) => {
    const product = await productRepo.getProductById(connection, productId);
    if (!product) throw new Error("Produk tidak ditemukan.");
    const sku = product.sku;

    const itemsToMove = await resolveInventoryItems(connection, [
      { sku, quantity, fromLocationId, toLocationId },
    ]);

    for (const item of itemsToMove) {
      // Validasi Stok
      const currentStock = await locationRepo.getStockAtLocation(
        connection,
        item.productId,
        fromLocationId,
        true,
      );
      if (currentStock < item.quantity) {
        throw new Error(
          `Stok tidak cukup untuk ${item.sku}. Butuh: ${item.quantity}, Ada: ${currentStock}.` +
            (item.isComponent ? ` (Komponen dari paket ${item.parentSku})` : ""),
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

    // Kirim Notifikasi
    try {
      const title = "Transfer Stok";
      const itemsCount = itemsToMove.length;
      const msg = `Transfer stok untuk ${itemsCount} item (SKU: ${sku}) telah berhasil dilakukan.`;
      const actionPayload = { productId, fromLocationId, toLocationId, quantity };

      // Background process untuk notifikasi
      notificationService
        .notifyUsersByPermission(
          "manage-stock-batch",
          "WMS",
          title,
          msg,
          actionPayload,
          userId,
          true,
        )
        .catch((e) => Logger.error("Failed to send notification", e, "STOCK_SERVICE"));
    } catch (e) {
      Logger.error("Failed to prepare notification", e, "STOCK_SERVICE");
    }

    signals.refreshStock();

    return { success: true, message: "Transfer berhasil." };
  }, existingConnection);
};

/**
 * Service: Adjust Stock (Single)
 */
export const adjustStockService = async (
  { productId, locationId, quantity, userId, notes },
  existingConnection = null,
) => {
  return withTransaction(async (connection) => {
    const product = await productRepo.getProductById(connection, productId);
    if (!product) throw new Error("Produk tidak ditemukan.");

    // Helper Resolver (Juga memecah paket saat opname jika user opname paket!)
    const itemsToAdjust = await resolveInventoryItems(connection, [
      { sku: product.sku, quantity: Math.abs(quantity) },
    ]);

    for (const item of itemsToAdjust) {
      // Balikkan tanda negatif jika quantity awal negatif
      const realQty = quantity < 0 ? -item.quantity : item.quantity;

      if (realQty < 0) {
        const currentStock = await locationRepo.getStockAtLocation(
          connection,
          item.productId,
          locationId,
          true,
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

    signals.refreshStock();

    return { success: true, message: "Penyesuaian stok berhasil." };
  }, existingConnection);
};

/**
 * Service: Process Batch Movements (INBOUND, RETURN, TRANSFER, etc)
 */
export const processBatchMovementsService = async (
  { type, fromLocationId, toLocationId, notes, movements, userId, userRoleId },
  existingConnection = null,
) => {
  return withTransaction(async (connection) => {
    // Permission Check
    if (type === "TRANSFER" || type === "ADJUSTMENT") {
      if (userRoleId !== 1) {
        const locationToCheck = type === "TRANSFER" ? fromLocationId : toLocationId;
        if (!locationToCheck) throw new Error("Lokasi wajib diisi untuk operasi ini.");

        const hasAccess = await userRepo.hasLocationAccess(connection, userId, locationToCheck);
        if (!hasAccess)
          throw new Error("Akses ditolak. Anda tidak memiliki izin untuk lokasi ini.");
      }
    }

    // Resolve Items
    const mappedMovements = movements.map((m) => ({
      sku: m.sku,
      quantity: m.quantity,
      fromLocationId: m.fromLocationId || fromLocationId,
      toLocationId: m.toLocationId || toLocationId,
      notes: m.notes, // Pass per-item notes
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

      // Determine Note: Item-specific note > Global note
      const baseNote = item.notes || notes;
      const itemNote = isComponent ? `${baseNote} [Via ${parentSku}]` : baseNote;

      switch (type) {
        case "TRANSFER":
        case "TRANSFER_MULTI": {
          if (!srcLoc || !destLoc)
            throw new Error(`Lokasi asal/tujuan tidak valid untuk ${item.sku}`);

          if (type === "TRANSFER_MULTI" && userRoleId !== 1) {
            const hasAccess = await userRepo.hasLocationAccess(connection, userId, srcLoc);
            if (!hasAccess) throw new Error(`Akses ditolak untuk lokasi asal SKU '${item.sku}'.`);
          }

          const currentStock = await locationRepo.getStockAtLocation(
            connection,
            productId,
            srcLoc,
            true,
          );
          if (currentStock < quantity)
            throw new Error(
              `Stok SKU '${item.sku}' kurang. Ada: ${currentStock}, Butuh: ${quantity}.`,
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
        }

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

        case "TRANSFER_OUT":
        case "OUTBOUND": {
          if (!srcLoc) throw new Error("Lokasi asal wajib diisi.");
          const currentStockOut = await locationRepo.getStockAtLocation(
            connection,
            productId,
            srcLoc,
            true,
          );
          if (currentStockOut < quantity)
            throw new Error(
              `Stok SKU '${item.sku}' kurang. Ada: ${currentStockOut}, Butuh: ${quantity}.`,
            );

          await locationRepo.deductStock(connection, productId, srcLoc, quantity);
          await stockRepo.createLog(connection, {
            productId,
            quantity,
            fromLocationId: srcLoc,
            toLocationId: null,
            type: type === "OUTBOUND" ? "OUTBOUND" : "TRANSFER_OUT",
            userId,
            notes: itemNote,
          });
          break;
        }

        case "TRANSFER_IN":
          if (!destLoc) throw new Error("Lokasi tujuan wajib diisi.");
          await locationRepo.incrementStock(connection, productId, destLoc, quantity);
          await stockRepo.createLog(connection, {
            productId,
            quantity,
            fromLocationId: null,
            toLocationId: destLoc,
            type: "TRANSFER_IN",
            userId,
            notes: itemNote,
          });
          break;

        case "ADJUSTMENT": {
          if (!destLoc) throw new Error("Lokasi wajib diisi.");
          const originalMov = movements.find((m) => m.sku === (item.parentSku || item.sku));
          const isNegative = originalMov && originalMov.quantity < 0;
          const finalQty = isNegative ? -quantity : quantity;

          await locationRepo.incrementStock(connection, productId, destLoc, finalQty);
          await stockRepo.createLog(connection, {
            productId,
            quantity: Math.abs(finalQty),
            fromLocationId: null,
            toLocationId: destLoc,
            type: "ADJUSTMENT",
            userId,
            notes: itemNote,
          });
          break;
        }

        default:
          throw new Error(`Tipe pergerakan '${type}' tidak dikenal.`);
      }
    }

    await connection.commit();

    // Kirim Notifikasi untuk Transfer
    if (type === "TRANSFER" || type === "TRANSFER_MULTI") {
      try {
        const title = `Batch Transfer Stok (${type})`;
        const msg = `Transfer stok massal untuk ${resolvedItems.length} item telah berhasil dilakukan.`;
        const actionPayload = { type, fromLocationId, toLocationId, count: resolvedItems.length };

        // Background process untuk notifikasi
        notificationService
          .notifyUsersByPermission(
            "manage-stock-batch",
            "WMS",
            title,
            msg,
            actionPayload,
            userId,
            true,
          )
          .catch((e) => Logger.error("Failed to send notification", e, "STOCK_SERVICE"));
      } catch (e) {
        Logger.error("Failed to prepare batch notification", e, "STOCK_SERVICE");
      }
    }

    signals.refreshStock();

    return { success: true, count: resolvedItems.length };
  }, existingConnection);
};

/**
 * Service: Process Batch Stock Opname (Pure Override)
 * Bypass component breakdown. Fails if package SKU included.
 */
export const processBatchOpnameService = async (
  { movements, userId, userRoleId },
  existingConnection = null,
) => {
  return withTransaction(async (connection) => {
    // 1. Resolve Items using getProductMap (to check if product exists and if it's package)
    const skuSet = new Set(movements.map((m) => m.sku));
    const productMap = await productRepo.getProductMapWithComponents(
      connection,
      Array.from(skuSet),
    );

    let processedCount = 0;

    for (const mov of movements) {
      const product = productMap.get(mov.sku.toUpperCase());
      if (!product) {
        throw new Error(`SKU '${mov.sku}' tidak ditemukan di database.`);
      }

      // Block packages
      if (product.is_package) {
        throw new Error(
          `SKU Paket '${mov.sku}' tidak dapat di-opname secara langsung. Opname hanya berlaku untuk barang fisik (komponen).`,
        );
      }

      if (!mov.toLocationId) {
        throw new Error(`Lokasi tujuan wajib diisi untuk opname SKU '${mov.sku}'.`);
      }

      // Ensure user has location permission if not superadmin
      if (userRoleId !== 1) {
        const hasAccess = await userRepo.hasLocationAccess(connection, userId, mov.toLocationId);
        if (!hasAccess) {
          throw new Error(`Akses ditolak untuk mencatat stok pada lokasi SKU '${mov.sku}'.`);
        }
      }

      const actualQty = mov.quantity; // Quantity passed is ACTUAL stock counted

      const currentStock = await locationRepo.getStockAtLocation(
        connection,
        product.id,
        mov.toLocationId,
        true, // lock for update
      );

      const difference = actualQty - currentStock;

      if (difference !== 0) {
        // Override directly
        await locationRepo.upsertStock(connection, product.id, mov.toLocationId, actualQty);

        // Log absolute difference in ledger
        await stockRepo.createLog(connection, {
          productId: product.id,
          quantity: Math.abs(difference),
          toLocationId: mov.toLocationId,
          type: "OPNAME",
          userId,
          notes: mov.notes || "Stock Opname Override",
        });

        processedCount++;
      }
    }

    signals.refreshStock();

    // Return processedCount (how many actual updates happened)
    return { success: true, count: processedCount };
  }, existingConnection);
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
// READ SERVICES
// ==============================================================================

/**
 * @returns {Promise<any>}
 */
export const generateAdjustmentTemplateService = async () => {
  return withConnection(async (connection) => {
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
  });
};

/**
 * @returns {Promise<any>}
 */
export const generateInboundTemplateService = async () => {
  return withConnection(async (connection) => {
    const locationCodes = await locationRepo.getAllLocationCodes(connection);

    const workbook = new ExcelJS.Workbook();
    const mainSheet = workbook.addWorksheet("Inbound Stok");
    const validationSheet = workbook.addWorksheet("DataValidasi");

    validationSheet.state = "hidden";
    validationSheet.getColumn("A").values = locationCodes;

    mainSheet.columns = [
      { header: "SKU", key: "sku", width: 25 },
      { header: "Lokasi Tujuan", key: "location", width: 20 },
      { header: "Quantity", key: "quantity", width: 15 },
      { header: "Notes", key: "notes", width: 35 },
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
  });
};

/**
 * @param {number|string} productId
 * @param {any} page
 * @param {number} limit
 * @param {any} movementType
 * @param {any} startDate
 * @param {any} endDate
 * @param {number|string} locationId
 * @param {any} user
 * @returns {Promise<any>}
 */
export const getStockHistoryService = async (
  productId,
  page = 1,
  limit = 15,
  movementType = null,
  startDate = null,
  endDate = null,
  locationId = null,
  user = null,
) => {
  const { page: safePage, limit: safeLimit, offset } = normalizePagination({ page, limit }, 15);
  return withConnection(async (connection) => {
    let countQuery =
      "SELECT COUNT(*) as total FROM stock_movements sm JOIN users u ON sm.user_id = u.id WHERE sm.product_id = ?";
    const countParams = [productId];

    let historyQuery = `
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
    WHERE sm.product_id = ?`;
    const historyParams = [productId];

    if (movementType && movementType !== "all") {
      countQuery += " AND sm.movement_type = ?";
      countParams.push(movementType);

      historyQuery += " AND sm.movement_type = ?";
      historyParams.push(movementType);
    }

    if (startDate && endDate) {
      countQuery += " AND DATE(sm.created_at) BETWEEN ? AND ?";
      countParams.push(startDate, endDate);
      historyQuery += " AND DATE(sm.created_at) BETWEEN ? AND ?";
      historyParams.push(startDate, endDate);
    } else if (startDate) {
      countQuery += " AND DATE(sm.created_at) >= ?";
      countParams.push(startDate);
      historyQuery += " AND DATE(sm.created_at) >= ?";
      historyParams.push(startDate);
    } else if (endDate) {
      countQuery += " AND DATE(sm.created_at) <= ?";
      countParams.push(endDate);
      historyQuery += " AND DATE(sm.created_at) <= ?";
      historyParams.push(endDate);
    }

    if (locationId && locationId !== "all") {
      countQuery += " AND (sm.from_location_id = ? OR sm.to_location_id = ?)";
      countParams.push(locationId, locationId);

      historyQuery += " AND (sm.from_location_id = ? OR sm.to_location_id = ?)";
      historyParams.push(locationId, locationId);
    }

    if (user) {
      countQuery += " AND u.username LIKE ?";
      countParams.push(`%${user}%`);

      historyQuery += " AND u.username LIKE ?";
      historyParams.push(`%${user}%`);
    }

    historyQuery += " ORDER BY sm.created_at DESC LIMIT ? OFFSET ?";
    historyParams.push(safeLimit, offset);

    const [totalRows] = await connection.query(countQuery, countParams);
    const [history] = await connection.query(historyQuery, historyParams);

    return {
      data: history,
      pagination: formatPaginationMeta(totalRows[0].total, safePage, safeLimit),
    };
  });
};

// Re-export for backward compatibility with exportService and consumers
export { buildTriStateWhere };

/**
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const getBatchLogsService = async ({
  startDate,
  endDate,
  productName,
  movementType,
  sourceLocation,
  destinationLocation,
  userId,
  notes,
  page = 1,
  limit = 50,
}) => {
  return withConnection(async (connection) => {
    const { page: safePage, limit: safeLimit, offset } = normalizePagination({ page, limit }, 50);
    const baseWhere = `sm.created_at BETWEEN ? AND ?`;
    const params = [startDate, `${endDate} 23:59:59`];

    let countQuery = `
    SELECT COUNT(*) as total
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    JOIN users u ON sm.user_id = u.id
    LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
    LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
    WHERE `;

    let dataQuery = `
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
    WHERE `;

    const conditions = [baseWhere];

    if (productName) {
      conditions.push(`(p.name LIKE ? OR p.sku LIKE ?)`);
      params.push(`%${productName}%`, `%${productName}%`);
    }

    const typeClauses = buildTriStateWhere("sm.movement_type", movementType, params);
    if (typeClauses.length > 0) {
      conditions.push(`(${typeClauses.join(" AND ")})`);
    }

    const sourceClauses = buildTriStateWhere("sm.from_location_id", sourceLocation, params);
    if (sourceClauses.length > 0) {
      conditions.push(`(${sourceClauses.join(" AND ")})`);
    }

    const destinationClauses = buildTriStateWhere("sm.to_location_id", destinationLocation, params);
    if (destinationClauses.length > 0) {
      conditions.push(`(${destinationClauses.join(" AND ")})`);
    }

    if (userId) {
      conditions.push(`u.username LIKE ?`);
      params.push(`%${userId}%`);
    }

    if (notes) {
      conditions.push(`sm.notes LIKE ?`);
      params.push(`%${notes}%`);
    }

    const whereClause = conditions.join(" AND ");
    countQuery += whereClause;
    dataQuery += whereClause;

    dataQuery += ` ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`;

    const [totalRows] = await connection.query(countQuery, params);
    const dataParams = [...params, safeLimit, offset];
    const [logs] = await connection.query(dataQuery, dataParams);

    return {
      data: logs,
      pagination: formatPaginationMeta(totalRows[0].total, safePage, safeLimit),
    };
  });
};

/**
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const validateReturnService = async (
  { pickingListItemId, returnToLocationId, userId },
  existingConnection = null,
) => {
  return withTransaction(async (connection) => {
    const returnedItem = await pickingRepo.getReturnedItemForValidation(
      connection,
      pickingListItemId,
    );

    if (!returnedItem) throw new Error("Item retur tidak ditemukan atau sudah diproses.");
    const { product_id, quantity } = returnedItem;

    await locationRepo.incrementStock(connection, product_id, returnToLocationId, quantity);
    await stockRepo.createLog(connection, {
      productId: product_id,
      quantity,
      toLocationId: returnToLocationId,
      type: "RETURN",
      userId,
      notes: `Validasi Retur Item ID: ${pickingListItemId}`,
    });
    await pickingRepo.updateItemStatus(connection, pickingListItemId, "COMPLETED_RETURN");

    signals.refreshStock();
    signals.refreshPicking();
    return { success: true, message: `Item (ID: ${pickingListItemId}) berhasil divalidasi.` };
  }, existingConnection);
};

/**
 * Mengambil daftar movement type dinamis
 * @returns {Promise<Array>}
 */
export const getMovementTypesService = async () => {
  return withConnection(async (connection) => {
    return stockRepo.getMovementTypes(connection);
  });
};
