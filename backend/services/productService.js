// backend/services/productService.js
import path from "path";
import fs from "fs/promises";
import Logger from "../utils/logger.js";
import * as productRepo from "../repositories/productRepository.js";
import { signals } from "./firebaseSignalService.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";
import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";

// resolveProductImageTitle removed since image processing is handled by mediaController now

// Helper Internal: Mencatat Log Audit hanya jika ada perubahan
export const logChange = async (connection, productId, userId, action, field, oldVal, newVal) => {
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

/**
 * @param {any} data
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const createProductService = async (data, userId) => {
  const newId = await withTransaction(async (connection) => {
    // Business Logic: Cek Duplikasi SKU
    const existingId = await productRepo.getIdBySku(connection, data.sku);
    if (existingId) {
      const error = new Error("SKU sudah terdaftar.");
      error.code = "DUPLICATE_SKU";
      throw error;
    }

    // Insert Product
    const id = await productRepo.createProduct(connection, data);

    // Log Creation
    await logChange(connection, id, userId, "CREATE", "all", null, data.sku);

    if (data.mediaIds && data.mediaIds.length > 0) {
      await productRepo.linkMedia(connection, id, data.mediaIds);
      await logChange(
        connection,
        id,
        userId,
        "CREATE",
        "images",
        null,
        `${data.mediaIds.length} Images Linked`,
      );
    }

    // Handle Package Components
    if (data.is_package && data.components?.length > 0) {
      await productRepo.insertComponents(connection, id, data.components);
    }

    return id;
  });

  signals.refreshProducts();
  return newId;
};

/**
 * @param {number|string} id
 * @param {any} data
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const updateProductService = async (id, data, userId) => {
  await withTransaction(async (connection) => {
    // Ambil Data Lama untuk Audit Log
    const oldData = await productRepo.getProductById(connection, id);
    if (!oldData) {
      const error = new Error("Produk tidak ditemukan.");
      error.code = "PRODUCT_NOT_FOUND";
      throw error;
    }

    // Update Product Core Data
    await productRepo.updateProduct(connection, id, data);

    // Audit Log Logic (Compare fields)
    const fieldsToCheck = [
      { key: "name", label: "Nama Produk" },
      { key: "category_id", label: "Kategori", type: "number" },
      { key: "price", label: "Harga", type: "number" },
      { key: "weight", label: "Berat", type: "number" },
      { key: "is_package", label: "Tipe Paket", type: "bool" },
      { key: "image_path", label: "Foto Produk", type: "string" },
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

    if (data.mediaIds && data.mediaIds.length > 0) {
      await productRepo.linkMedia(connection, id, data.mediaIds);
      await logChange(
        connection,
        id,
        userId,
        "UPDATE",
        "images",
        "Append",
        `${data.mediaIds.length} New Images Linked`,
      );
    }

    // Handle Package Components (Selalu replace logic untuk konsistensi, HANYA jika data.components diberikan)
    if (data.is_package && data.components !== undefined) {
      await productRepo.deleteComponents(connection, id);

      if (data.components.length > 0) {
        await productRepo.insertComponents(connection, id, data.components);

        // Generic log untuk perubahan struktur komponen
        await logChange(
          connection,
          id,
          userId,
          "UPDATE",
          "components",
          "Old Components",
          `${data.components.length} Items`,
        );
      }
    }
  });

  signals.refreshProducts();
  return true;
};

/**
 * @param {number|string} id
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const softDeleteProductService = async (id, userId) => {
  await withTransaction(async (connection) => {
    await productRepo.updateProductStatus(connection, id, false); // Active = false
    await logChange(connection, id, userId, "DELETE", "status", "Active", "Archived");
  });
  signals.refreshProducts();
};

/**
 * @param {number|string} id
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const restoreProductService = async (id, userId) => {
  await withTransaction(async (connection) => {
    await productRepo.updateProductStatus(connection, id, true); // Active = true
    await logChange(connection, id, userId, "RESTORE", "status", "Archived", "Active");
  });
  signals.refreshProducts();
};

// Removed uploadProductImagesService as linking is handled via mediaIds

/**
 * @param {number|string} productId
 * @param {number|string} mediaIds
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const linkMediaToProductService = async (productId, mediaIds, userId) => {
  await withTransaction(async (connection) => {
    await productRepo.linkMedia(connection, productId, mediaIds);
    await logChange(
      connection,
      productId,
      userId,
      "UPDATE",
      "images",
      "Add Media",
      `${mediaIds.length} Linked Media`,
    );
  });
  signals.refreshProducts();
};

/**
 * @param {number|string} imageId
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const deleteProductImageService = async (imageId, userId) => {
  await withTransaction(async (connection) => {
    const image = await productRepo.getImageById(connection, imageId);
    if (!image) throw new Error("Gambar tidak ditemukan.");

    if (image.image_path && !image.media_id) {
      try {
        const actualPath = path.resolve("uploads/products/", image.image_path);
        await fs.unlink(actualPath);
      } catch (err) {
        Logger.warn(`Gagal menghapus file ${image.image_path}`, "PRODUCT_SERVICE", err);
      }
    }

    await productRepo.deleteImage(connection, imageId);
    await logChange(
      connection,
      image.product_id,
      userId,
      "DELETE",
      "image",
      image.image_path,
      "Deleted",
    );
  });
  signals.refreshProducts();
};

/**
 * @param {number|string} productId
 * @param {number|string} imageId
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const setPrimaryImageService = async (productId, imageId, userId) => {
  await withTransaction(async (connection) => {
    await productRepo.resetPrimaryImage(connection, productId);
    await productRepo.setPrimaryImage(connection, imageId);
    await logChange(
      connection,
      productId,
      userId,
      "UPDATE",
      "primary_image",
      "Changed",
      `Image ID ${imageId}`,
    );
  });
  signals.refreshProducts();
};

/**
 * @param {number|string} productId
 * @param {any} page
 * @param {number} limit
 * @param {any} filters
 * @returns {Promise<any>}
 */
export const getHistoricalStockTimelineService = async (
  productId,
  page = 1,
  limit = 100,
  filters = {},
) => {
  return await withConnection(async (connection) => {
    const { page: safePage, limit: safeLimit, offset } = normalizePagination({ page, limit }, 100);

    // Run aggregations concurrently
    const [currentStock, totalMovementsCount, newerMovementsSum] = await Promise.all([
      productRepo.getProductTotalStock(connection, productId, filters),
      productRepo.getProductStockMovementsCount(connection, productId, filters),
      productRepo.getSumOfNewerStockMovements(connection, productId, offset, filters),
    ]);

    // Fetch ONLY the paginated movements
    const movements = await productRepo.getProductStockMovementsPaginated(
      connection,
      productId,
      safeLimit,
      offset,
      filters,
    );

    // Balance at the very beginning of the paginated list (newest movement of this page)
    let currentBalance = currentStock - newerMovementsSum;

    const timeline = movements.map((mov) => {
      const balanceAtThisPoint = currentBalance;

      let netChange = 0;
      const hasBuildingFilter = filters.buildings && filters.buildings.length > 0;

      if (hasBuildingFilter) {
        const fromInFilter = filters.buildings.includes(mov.from_building);
        const toInFilter = filters.buildings.includes(mov.to_building);

        if (toInFilter && !fromInFilter) {
          netChange = mov.quantity; // INBOUND to filtered building
        } else if (fromInFilter && !toInFilter) {
          netChange = -mov.quantity; // OUTBOUND from filtered building
        }
        // If both in filter or both not in filter, netChange = 0 for this scope
      } else {
        if (!mov.from_location_id && mov.to_location_id) {
          netChange = mov.quantity; // Global INBOUND
        } else if (mov.from_location_id && !mov.to_location_id) {
          netChange = -mov.quantity; // Global OUTBOUND
        }
        // if both are NOT NULL, it's an internal transfer (netChange = 0 globally)
      }

      // Revert balance for the NEXT older movement (which comes next in the loop because it's DESC)
      currentBalance -= netChange;

      return {
        id: mov.id,
        created_at: mov.created_at,
        movement_type: mov.movement_type,
        quantity: mov.quantity,
        from_location_id: mov.from_location_id,
        to_location_id: mov.to_location_id,
        notes: mov.notes,
        user_name: mov.user_name,
        balance_after: balanceAtThisPoint,
        net_change: netChange,
      };
    });

    return {
      data: timeline,
      ...formatPaginationMeta(totalMovementsCount, safePage, safeLimit),
    };
  });
};

// ============================================================================
// HELPER: CALCULATION UTILS (Exported for Testing)
// ============================================================================

/**
 * Menghitung Virtual Stock dan Berat Total untuk Produk Paket
 * @param {object} product - Object produk dengan array 'components'
 * @returns {object} Produk dengan properti tambahan 'virtual_stock' dan 'total_weight'
 */
export const calculatePackageMeta = (product) => {
  // Jika bukan paket atau tidak ada komponen, kembalikan default
  if (!product.is_package || !product.components || product.components.length === 0) {
    return {
      ...product,
      virtual_stock: 0,
      total_weight: parseFloat(product.weight || 0),
      total_cbm: (parseFloat(product.length || 0) * parseFloat(product.width || 0) * parseFloat(product.height || 0)) / 1000000,
    };
  }

  let minStock = Infinity;
  let calculatedWeight = 0;
  let calculatedCbm = 0;
  let hasStockComponent = false;

  for (const comp of product.components) {
    const compWeight = parseFloat(comp.weight || 0);
    const compCbm = (parseFloat(comp.length || 0) * parseFloat(comp.width || 0) * parseFloat(comp.height || 0)) / 1000000;
    const compQty = parseFloat(comp.quantity_per_package || comp.quantity || 0);
    const compStock = parseFloat(comp.stock_available || comp.total_stock || 0);

    // Hitung Berat (Weight * Qty)
    calculatedWeight += compWeight * compQty;
    // Hitung CBM (CBM * Qty)
    calculatedCbm += compCbm * compQty;

    // Hitung Virtual Stock (Bottle Neck Logic)
    if (compQty > 0) {
      const possible = Math.floor(compStock / compQty);
      if (possible < minStock) minStock = possible;
      hasStockComponent = true;
    }
  }

  // Jika tidak ada komponen yang valid untuk stok, set 0
  if (!hasStockComponent || minStock === Infinity) minStock = 0;

  return {
    ...product,
    virtual_stock: minStock,
    total_weight: calculatedWeight > 0 ? calculatedWeight : parseFloat(product.weight || 0),
    total_cbm: calculatedCbm > 0 ? calculatedCbm : ((parseFloat(product.length || 0) * parseFloat(product.width || 0) * parseFloat(product.height || 0)) / 1000000),
  };
};
