import { withTransaction, withConnection } from "../utils/dbUtils.js";
import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";
import { STOCK_MOVEMENT_TYPE } from "../config/wmsConstants.js";
import AppError from "../utils/AppError.js";
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
 * Mengirim notifikasi transfer stok secara fire-and-forget setelah transaksi berhasil commit.
 * @param {string} title
 * @param {string} message
 * @param {Object} actionPayload
 * @param {number|string} userId
 * @returns {void}
 */
const notifyStockTransfer = (title, message, actionPayload, userId) => {
  try {
    notificationService
      .notifyUsersByPermission(
        "manage-stock-batch",
        "WMS",
        title,
        message,
        actionPayload,
        userId,
        true,
      )
      .catch((e) => Logger.error("Failed to send notification", e, "STOCK_SERVICE"));
  } catch (e) {
    Logger.error("Failed to prepare notification", e, "STOCK_SERVICE");
  }
};

/**
 * Memeriksa izin akses lokasi user dengan cache per-transaksi untuk menghindari query berulang.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Map<number|string, boolean>} accessCache
 * @param {number|string} userId
 * @param {number|string} locationId
 * @param {string} errorMessage
 * @returns {Promise<void>}
 * @throws {AppError}
 */
const assertLocationAccess = async (connection, accessCache, userId, locationId, errorMessage) => {
  if (!accessCache.has(locationId)) {
    const hasAccess = await userRepo.hasLocationAccess(connection, userId, locationId);
    accessCache.set(locationId, hasAccess);
  }
  if (!accessCache.get(locationId)) {
    throw new AppError(errorMessage, 403, "FORBIDDEN");
  }
};

/**
 * Menerapkan penyesuaian stok (tambah/kurang) dengan validasi agar stok tidak minus.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} params
 * @param {number|string} params.productId
 * @param {string} params.sku
 * @param {number|string} params.locationId
 * @param {number} params.deltaQty
 * @param {number|string} params.userId
 * @param {string} [params.notes]
 * @returns {Promise<void>}
 * @throws {AppError}
 */
const applyStockAdjustment = async (
  connection,
  { productId, sku, locationId, deltaQty, userId, notes },
) => {
  if (deltaQty < 0) {
    const currentStock = await locationRepo.getStockAtLocation(
      connection,
      productId,
      locationId,
      true,
    );
    if (currentStock + deltaQty < 0) {
      throw new AppError(
        `Stok SKU '${sku}' tidak cukup untuk dikurangi. Ada: ${currentStock}, Butuh: ${Math.abs(deltaQty)}.`,
        400,
        "INSUFFICIENT_STOCK",
      );
    }
  }

  await locationRepo.incrementStock(connection, productId, locationId, deltaQty);
  await stockRepo.createLog(connection, {
    productId,
    quantity: Math.abs(deltaQty),
    fromLocationId: null,
    toLocationId: locationId,
    type: STOCK_MOVEMENT_TYPE.ADJUSTMENT,
    userId,
    notes,
  });
};

/**
 * Memvalidasi kecukupan stok pada lokasi asal (dengan row lock) lalu mengurangi stoknya.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} params
 * @param {number|string} params.productId
 * @param {string} params.sku
 * @param {number|string} params.locationId
 * @param {number} params.quantity
 * @returns {Promise<void>}
 * @throws {AppError}
 */
const assertSufficientStockAndDeduct = async (
  connection,
  { productId, sku, locationId, quantity },
) => {
  const currentStock = await locationRepo.getStockAtLocation(connection, productId, locationId, true);
  if (currentStock < quantity) {
    throw new AppError(
      `Stok SKU '${sku}' kurang. Ada: ${currentStock}, Butuh: ${quantity}.`,
      400,
      "INSUFFICIENT_STOCK",
    );
  }
  await locationRepo.deductStock(connection, productId, locationId, quantity);
};

/**
 * Menambah stok ke lokasi tujuan dan mencatat log pergerakan masuk.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} params
 * @param {number|string} params.productId
 * @param {number|string|null} params.locationId
 * @param {number} params.quantity
 * @param {string} params.type
 * @param {number|string} params.userId
 * @param {string} [params.notes]
 * @returns {Promise<void>}
 * @throws {AppError}
 */
const applyStockIncrement = async (
  connection,
  { productId, locationId, quantity, type, userId, notes },
) => {
  if (!locationId) throw new AppError("Lokasi tujuan wajib diisi.", 400, "VALIDATION_ERROR");
  await locationRepo.incrementStock(connection, productId, locationId, quantity);
  await stockRepo.createLog(connection, {
    productId,
    quantity,
    fromLocationId: null,
    toLocationId: locationId,
    type,
    userId,
    notes,
  });
};

/**
 * Mengekstrak dan memvalidasi SKU dari daftar movement sebelum query massal.
 * @param {Array<{ sku?: string }>} movements
 * @param {string} emptyMessage
 * @returns {string[]} Daftar SKU unik yang sudah di-trim
 * @throws {AppError}
 */
const extractValidatedSkus = (movements, emptyMessage) => {
  const skuSet = new Set();
  for (const mov of movements) {
    const sku = typeof mov.sku === "string" ? mov.sku.trim() : "";
    if (!sku) {
      throw new AppError(emptyMessage, 400, "VALIDATION_ERROR");
    }
    skuSet.add(sku);
  }
  return Array.from(skuSet);
};

/**
 * Menerima array pergerakan stok (SKU & Qty), lalu:
 * - Validasi SKU ke DB
 * - Cek apakah Paket? Jika ya, pecah jadi komponen
 * - Kembalikan array item FISIK yang siap diproses stoknya
 * @param {import('mysql2/promise').Connection} connection
 * @param {Array<{ sku: string, quantity: number, [key: string]: any }>} movements
 * @returns {Promise<Array<{ productId: number, sku: string, quantity: number, isComponent?: boolean, parentSku?: string, [key: string]: any }>>}
 * @throws {AppError}
 */
const resolveInventoryItems = async (connection, movements) => {
  const resolvedItems = [];
  const uniqueSkus = extractValidatedSkus(movements, "SKU wajib diisi untuk setiap item pergerakan.");

  // Bulk Fetch Info Produk & Komponen
  const productMap = await productRepo.getProductMapWithComponents(connection, uniqueSkus);

  for (const mov of movements) {
    const sku = mov.sku.trim();
    const product = productMap.get(sku.toUpperCase());

    if (!product) {
      throw new AppError(`SKU '${sku}' tidak ditemukan di database.`, 404, "NOT_FOUND");
    }

    // Logic Pecah Paket
    if (product.is_package) {
      if (!product.components || product.components.length === 0) {
        throw new AppError(
          `Produk Paket "${product.name}" (${product.sku}) tidak memiliki komponen terdaftar.`,
          400,
          "VALIDATION_ERROR",
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
 * @param {Object} params
 * @param {number|string} params.productId
 * @param {number|string} params.fromLocationId
 * @param {number|string} params.toLocationId
 * @param {number} params.quantity
 * @param {number|string} params.userId
 * @param {string} [params.notes]
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const transferStockService = async (
  { productId, fromLocationId, toLocationId, quantity, userId, notes },
  existingConnection = null,
) => {
  const { itemsCount, sku } = await withTransaction(async (connection) => {
    const product = await productRepo.getProductById(connection, productId);
    if (!product) throw new AppError("Produk tidak ditemukan.", 404, "NOT_FOUND");
    const productSku = product.sku;

    const itemsToMove = await resolveInventoryItems(connection, [
      { sku: productSku, quantity, fromLocationId, toLocationId },
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
        throw new AppError(
          `Stok tidak cukup untuk ${item.sku}. Butuh: ${item.quantity}, Ada: ${currentStock}.` +
            (item.isComponent ? ` (Komponen dari paket ${item.parentSku})` : ""),
          400,
          "INSUFFICIENT_STOCK",
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
        type: STOCK_MOVEMENT_TYPE.TRANSFER,
        userId,
        notes: finalNote,
      });
    }

    return { itemsCount: itemsToMove.length, sku: productSku };
  }, existingConnection);

  // Side-effect hanya dipicu jika transaksi ini berdiri sendiri dan sudah commit
  if (!existingConnection) {
    notifyStockTransfer(
      "Transfer Stok",
      `Transfer stok untuk ${itemsCount} item (SKU: ${sku}) telah berhasil dilakukan.`,
      { productId, fromLocationId, toLocationId, quantity },
      userId,
    );
    signals.refreshStock();
  }

  return { success: true, message: "Transfer berhasil." };
};

/**
 * Service: Adjust Stock (Single)
 * @param {Object} params
 * @param {number|string} params.productId
 * @param {number|string} params.locationId
 * @param {number} params.quantity
 * @param {number|string} params.userId
 * @param {string} [params.notes]
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const adjustStockService = async (
  { productId, locationId, quantity, userId, notes },
  existingConnection = null,
) => {
  await withTransaction(async (connection) => {
    const product = await productRepo.getProductById(connection, productId);
    if (!product) throw new AppError("Produk tidak ditemukan.", 404, "NOT_FOUND");

    // Helper Resolver (Juga memecah paket saat opname jika user opname paket!)
    const itemsToAdjust = await resolveInventoryItems(connection, [
      { sku: product.sku, quantity },
    ]);

    for (const item of itemsToAdjust) {
      const finalNote = item.isComponent ? `${notes} [Adj Paket ${item.parentSku}]` : notes;
      await applyStockAdjustment(connection, {
        productId: item.productId,
        sku: item.sku,
        locationId,
        deltaQty: item.quantity,
        userId,
        notes: finalNote,
      });
    }
  }, existingConnection);

  if (!existingConnection) {
    signals.refreshStock();
  }

  return { success: true, message: "Penyesuaian stok berhasil." };
};

/**
 * Service: Process Batch Movements (INBOUND, RETURN, TRANSFER, TRANSFER_MULTI, etc)
 * @param {Object} params
 * @param {string} params.type
 * @param {number|string|null} [params.fromLocationId]
 * @param {number|string|null} [params.toLocationId]
 * @param {string} [params.notes]
 * @param {Array<Object>} params.movements
 * @param {number|string} params.userId
 * @param {number} params.userRoleId
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, count: number }>}
 * @throws {AppError}
 */
export const processBatchMovementsService = async (
  { type, fromLocationId, toLocationId, notes, movements, userId, userRoleId },
  existingConnection = null,
) => {
  const result = await withTransaction(async (connection) => {
    const locationAccessCache = new Map();

    // Permission Check
    if (type === STOCK_MOVEMENT_TYPE.TRANSFER || type === STOCK_MOVEMENT_TYPE.ADJUSTMENT) {
      if (userRoleId !== 1) {
        const locationToCheck =
          type === STOCK_MOVEMENT_TYPE.TRANSFER ? fromLocationId : toLocationId;
        if (!locationToCheck) {
          throw new AppError("Lokasi wajib diisi untuk operasi ini.", 400, "VALIDATION_ERROR");
        }

        await assertLocationAccess(
          connection,
          locationAccessCache,
          userId,
          locationToCheck,
          "Akses ditolak. Anda tidak memiliki izin untuk lokasi ini.",
        );
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
        case STOCK_MOVEMENT_TYPE.TRANSFER:
        case STOCK_MOVEMENT_TYPE.TRANSFER_MULTI: {
          if (!srcLoc || !destLoc) {
            throw new AppError(
              `Lokasi asal/tujuan tidak valid untuk ${item.sku}`,
              400,
              "VALIDATION_ERROR",
            );
          }

          if (type === STOCK_MOVEMENT_TYPE.TRANSFER_MULTI && userRoleId !== 1) {
            await assertLocationAccess(
              connection,
              locationAccessCache,
              userId,
              srcLoc,
              `Akses ditolak untuk lokasi asal SKU '${item.sku}'.`,
            );
          }

          await assertSufficientStockAndDeduct(connection, {
            productId,
            sku: item.sku,
            locationId: srcLoc,
            quantity,
          });
          await locationRepo.incrementStock(connection, productId, destLoc, quantity);
          await stockRepo.createLog(connection, {
            productId,
            quantity,
            fromLocationId: srcLoc,
            toLocationId: destLoc,
            type: STOCK_MOVEMENT_TYPE.TRANSFER,
            userId,
            notes: itemNote,
          });
          break;
        }

        case STOCK_MOVEMENT_TYPE.INBOUND:
        case STOCK_MOVEMENT_TYPE.RETURN:
          await applyStockIncrement(connection, {
            productId,
            locationId: destLoc,
            quantity,
            type,
            userId,
            notes: itemNote,
          });
          break;

        case STOCK_MOVEMENT_TYPE.TRANSFER_OUT:
        case STOCK_MOVEMENT_TYPE.OUTBOUND: {
          if (!srcLoc) throw new AppError("Lokasi asal wajib diisi.", 400, "VALIDATION_ERROR");
          await assertSufficientStockAndDeduct(connection, {
            productId,
            sku: item.sku,
            locationId: srcLoc,
            quantity,
          });
          await stockRepo.createLog(connection, {
            productId,
            quantity,
            fromLocationId: srcLoc,
            toLocationId: null,
            type:
              type === STOCK_MOVEMENT_TYPE.OUTBOUND
                ? STOCK_MOVEMENT_TYPE.OUTBOUND
                : STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
            userId,
            notes: itemNote,
          });
          break;
        }

        case STOCK_MOVEMENT_TYPE.TRANSFER_IN:
          await applyStockIncrement(connection, {
            productId,
            locationId: destLoc,
            quantity,
            type: STOCK_MOVEMENT_TYPE.TRANSFER_IN,
            userId,
            notes: itemNote,
          });
          break;

        case STOCK_MOVEMENT_TYPE.ADJUSTMENT:
          if (!destLoc) throw new AppError("Lokasi wajib diisi.", 400, "VALIDATION_ERROR");
          await applyStockAdjustment(connection, {
            productId,
            sku: item.sku,
            locationId: destLoc,
            deltaQty: quantity,
            userId,
            notes: itemNote,
          });
          break;

        default:
          throw new AppError(`Tipe pergerakan '${type}' tidak dikenal.`, 400, "VALIDATION_ERROR");
      }
    }

    return { success: true, count: resolvedItems.length };
  }, existingConnection);

  // Side-effect hanya dipicu jika transaksi ini berdiri sendiri dan sudah commit
  if (!existingConnection) {
    if (
      type === STOCK_MOVEMENT_TYPE.TRANSFER ||
      type === STOCK_MOVEMENT_TYPE.TRANSFER_MULTI
    ) {
      notifyStockTransfer(
        `Batch Transfer Stok (${type})`,
        `Transfer stok massal untuk ${result.count} item telah berhasil dilakukan.`,
        { type, fromLocationId, toLocationId, count: result.count },
        userId,
      );
    }

    signals.refreshStock();
  }

  return result;
};

/**
 * Service: Process Batch Stock Opname (Pure Override)
 * Bypass component breakdown. Fails if package SKU included.
 * @param {Object} params
 * @param {Array<{ sku: string, quantity: number, toLocationId: number|string, notes?: string }>} params.movements
 * @param {number|string} params.userId
 * @param {number} params.userRoleId
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, count: number }>}
 * @throws {AppError}
 */
export const processBatchOpnameService = async (
  { movements, userId, userRoleId },
  existingConnection = null,
) => {
  const result = await withTransaction(async (connection) => {
    const locationAccessCache = new Map();

    // 1. Resolve Items using getProductMap (to check if product exists and if it's package)
    const uniqueSkus = extractValidatedSkus(movements, "SKU wajib diisi untuk setiap item opname.");
    const productMap = await productRepo.getProductMapWithComponents(connection, uniqueSkus);

    let processedCount = 0;

    for (const mov of movements) {
      const sku = mov.sku.trim();
      const product = productMap.get(sku.toUpperCase());
      if (!product) {
        throw new AppError(`SKU '${sku}' tidak ditemukan di database.`, 404, "NOT_FOUND");
      }

      // Block packages
      if (product.is_package) {
        throw new AppError(
          `SKU Paket '${sku}' tidak dapat di-opname secara langsung. Opname hanya berlaku untuk barang fisik (komponen).`,
          400,
          "VALIDATION_ERROR",
        );
      }

      if (!mov.toLocationId) {
        throw new AppError(
          `Lokasi tujuan wajib diisi untuk opname SKU '${sku}'.`,
          400,
          "VALIDATION_ERROR",
        );
      }

      // Ensure user has location permission if not superadmin
      if (userRoleId !== 1) {
        await assertLocationAccess(
          connection,
          locationAccessCache,
          userId,
          mov.toLocationId,
          `Akses ditolak untuk mencatat stok pada lokasi SKU '${sku}'.`,
        );
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
          type: STOCK_MOVEMENT_TYPE.OPNAME,
          userId,
          notes: mov.notes || "Stock Opname Override",
        });

        processedCount++;
      }
    }

    // Return processedCount (how many actual updates happened)
    return { success: true, count: processedCount };
  }, existingConnection);

  if (!existingConnection) {
    signals.refreshStock();
  }

  return result;
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
    type: STOCK_MOVEMENT_TYPE.TRANSFER,
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
 * Membuat workbook template Excel dengan sheet tersembunyi `DataValidasi` untuk dropdown lokasi.
 * @param {Object} options
 * @param {string} options.sheetName - Nama worksheet utama
 * @param {Array<{ header: string, key: string, width: number }>} options.columns - Definisi kolom
 * @returns {Promise<import('exceljs').Workbook>}
 */
const generateLocationTemplateWorkbook = async ({ sheetName, columns }) => {
  return withConnection(async (connection) => {
    const locationCodes = await locationRepo.getAllLocationCodes(connection);

    const workbook = new ExcelJS.Workbook();
    const mainSheet = workbook.addWorksheet(sheetName);
    const validationSheet = workbook.addWorksheet("DataValidasi");

    validationSheet.state = "hidden";
    validationSheet.getColumn("A").values = locationCodes;

    mainSheet.columns = columns;
    mainSheet.getRow(1).font = { bold: true };

    if (locationCodes.length > 0) {
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
    }

    return workbook;
  });
};

/**
 * Menghasilkan workbook template Stock Opname / Adjustment dengan validasi dropdown lokasi.
 * @returns {Promise<import('exceljs').Workbook>}
 */
export const generateAdjustmentTemplateService = async () => {
  return generateLocationTemplateWorkbook({
    sheetName: "Input Stok",
    columns: [
      { header: "SKU", key: "sku", width: 25 },
      { header: "LT (Lokasi)", key: "location", width: 20 },
      { header: "ACTUAL", key: "actual", width: 10 },
      { header: "NOTES", key: "notes", width: 35 },
    ],
  });
};

/**
 * Menghasilkan workbook template Inbound Stok dengan validasi dropdown lokasi.
 * @returns {Promise<import('exceljs').Workbook>}
 */
export const generateInboundTemplateService = async () => {
  return generateLocationTemplateWorkbook({
    sheetName: "Inbound Stok",
    columns: [
      { header: "SKU", key: "sku", width: 25 },
      { header: "Lokasi Tujuan", key: "location", width: 20 },
      { header: "Quantity", key: "quantity", width: 15 },
      { header: "Notes", key: "notes", width: 35 },
    ],
  });
};

/**
 * Mengambil riwayat pergerakan stok per produk secara terpaginasi.
 * @param {number|string} productId
 * @param {number|string} [page=1]
 * @param {number|string} [limit=15]
 * @param {string|null} [movementType=null]
 * @param {string|null} [startDate=null]
 * @param {string|null} [endDate=null]
 * @param {number|string|null} [locationId=null]
 * @param {string|null} [user=null]
 * @returns {Promise<{ data: Array<Object>, pagination: Object }>}
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
    const { rows, total } = await stockRepo.getStockHistory(connection, {
      productId,
      movementType,
      startDate,
      endDate,
      locationId,
      user,
      limit: safeLimit,
      offset,
    });

    return {
      data: rows,
      pagination: formatPaginationMeta(total, safePage, safeLimit),
    };
  });
};

/**
 * Mengambil log pergerakan stok batch terfilter dan terpaginasi.
 * @param {Object} options
 * @param {string} options.startDate
 * @param {string} options.endDate
 * @param {string} [options.productName]
 * @param {any} [options.movementType]
 * @param {any} [options.sourceLocation]
 * @param {any} [options.destinationLocation]
 * @param {string} [options.userId]
 * @param {string} [options.notes]
 * @param {number|string} [options.page=1]
 * @param {number|string} [options.limit=50]
 * @returns {Promise<{ data: Array<Object>, pagination: Object }>}
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
  const { page: safePage, limit: safeLimit, offset } = normalizePagination({ page, limit }, 50);
  return withConnection(async (connection) => {
    const { rows, total } = await stockRepo.getBatchLogs(connection, {
      startDate,
      endDate,
      productName,
      movementType,
      sourceLocation,
      destinationLocation,
      userId,
      notes,
      limit: safeLimit,
      offset,
    });

    return {
      data: rows,
      pagination: formatPaginationMeta(total, safePage, safeLimit),
    };
  });
};

/**
 * Service: Validasi barang retur dari picking list ke lokasi tujuan.
 * @param {Object} options
 * @param {number|string} options.pickingListItemId
 * @param {number|string} options.returnToLocationId
 * @param {number|string} options.userId
 * @param {import('mysql2/promise').Connection|null} [existingConnection=null]
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const validateReturnService = async (
  { pickingListItemId, returnToLocationId, userId },
  existingConnection = null,
) => {
  const result = await withTransaction(async (connection) => {
    const returnedItem = await pickingRepo.getReturnedItemForValidation(
      connection,
      pickingListItemId,
    );

    if (!returnedItem) {
      throw new AppError("Item retur tidak ditemukan atau sudah diproses.", 404, "NOT_FOUND");
    }
    const { product_id, quantity } = returnedItem;

    await locationRepo.incrementStock(connection, product_id, returnToLocationId, quantity);
    await stockRepo.createLog(connection, {
      productId: product_id,
      quantity,
      toLocationId: returnToLocationId,
      type: STOCK_MOVEMENT_TYPE.RETURN,
      userId,
      notes: `Validasi Retur Item ID: ${pickingListItemId}`,
    });
    await pickingRepo.updateItemStatus(connection, pickingListItemId, "COMPLETED_RETURN");

    return { success: true, message: `Item (ID: ${pickingListItemId}) berhasil divalidasi.` };
  }, existingConnection);

  if (!existingConnection) {
    signals.refreshStock();
    signals.refreshPicking();
  }

  return result;
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
