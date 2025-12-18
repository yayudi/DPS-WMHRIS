// backend/services/stockService.js
import db from "../config/db.js";
import * as productRepo from "../repositories/productRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";

/**
 * Service: Transfer Stok (Dengan Fitur Auto-Breakdown Paket)
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
    let product;
    try {
      product = await productRepo.getProductDetailWithStock(connection, productId);
    } catch (e) {
      const [rows] = await connection.query("SELECT * FROM products WHERE id = ?", [productId]);
      if (rows.length > 0) product = rows[0];
    }

    if (!product) {
      throw new Error(`Produk ID ${productId} tidak ditemukan.`);
    }

    let itemsToMove = [];

    if (product.is_package) {
      if (!product.components || product.components.length === 0) {
        const [comps] = await connection.query(
          `SELECT pc.component_product_id as id, p.sku, p.name, pc.quantity_per_package
             FROM package_components pc
             JOIN products p ON pc.component_product_id = p.id
             WHERE pc.package_product_id = ?`,
          [productId]
        );
        product.components = comps;
      }

      if (!product.components || product.components.length === 0) {
        throw new Error(`Produk Paket "${product.name}" tidak memiliki komponen terdaftar.`);
      }

      itemsToMove = product.components.map((comp) => ({
        id: comp.id,
        sku: comp.sku,
        name: comp.name,
        qtyNeeded: quantity * comp.quantity_per_package,
        isComponent: true,
      }));

      notes = notes ? `${notes} (Paket: ${product.sku})` : `Transfer Paket: ${product.sku}`;
    } else {
      itemsToMove.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        qtyNeeded: quantity,
        isComponent: false,
      });
    }

    for (const item of itemsToMove) {
      const currentStock = await locationRepo.getStockAtLocation(
        connection,
        item.id,
        fromLocationId,
        true
      );

      if (currentStock < item.qtyNeeded) {
        throw new Error(
          `Stok tidak cukup untuk ${item.name} (${item.sku}). ` +
            `Butuh: ${item.qtyNeeded}, Tersedia: ${currentStock} di lokasi asal.`
        );
      }

      await locationRepo.deductStock(connection, item.id, fromLocationId, item.qtyNeeded);
      await locationRepo.incrementStock(connection, item.id, toLocationId, item.qtyNeeded);

      await stockRepo.createLog(connection, {
        productId: item.id,
        quantity: item.qtyNeeded,
        fromLocationId,
        toLocationId,
        type: "TRANSFER",
        userId,
        notes,
      });
    }

    await connection.commit();

    return {
      success: true,
      message: product.is_package
        ? `Berhasil mentransfer paket. Komponen yang dipindahkan: ${itemsToMove.length} jenis.`
        : `Berhasil mentransfer stok.`,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Service: Adjust Stock (Opname)
 */
export const adjustStockService = async ({ productId, locationId, quantity, userId, notes }) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    if (quantity < 0) {
      const currentStock = await locationRepo.getStockAtLocation(
        connection,
        productId,
        locationId,
        true
      );
      if (currentStock + quantity < 0) {
        throw new Error(
          `Stok tidak mencukupi untuk pengurangan. Sisa: ${currentStock}, Kurang: ${Math.abs(
            quantity
          )}`
        );
      }
    }

    // Update Stok (Upsert logic di dalam repo menangani increment/decrement via + quantity)
    // Jika quantity negatif, stok akan berkurang
    await locationRepo.incrementStock(connection, productId, locationId, quantity);

    // Log
    // Di tabel stock_movements biasanya quantity disimpan positif (absolute),
    // tipe 'ADJUSTMENT' dan +/- bisa dilihat dari konteks atau logic bisnis.
    // Sesuai kode lama: kita simpan nilai absolutnya.
    await stockRepo.createLog(connection, {
      productId,
      quantity: Math.abs(quantity),
      toLocationId: locationId,
      type: "ADJUSTMENT",
      userId,
      notes,
    });

    await connection.commit();
    return { success: true, message: "Penyesuaian stok berhasil." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
