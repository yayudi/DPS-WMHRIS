import * as investigationRepo from "../repositories/investigationRepository.js";
import * as locationRepo from "../repositories/locationRepository.js";
import * as stockRepo from "../repositories/stockMovementRepository.js";
import AppError from "../utils/AppError.js";
import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";
import { signals } from "./firebaseSignalService.js";

/**
 * Service to find duplicate stock transactions.
 *
 * @param {Object} filters
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 * @param {string} [filters.includeNotes]
 * @param {string} [filters.excludeNotes]
 * @param {string} [filters.movementType]
 * @param {string} [filters.productName]
 * @param {string} [filters.username]
 * @param {string} [filters.location]
 * @returns {Promise<Array>}
 */
export const getDuplicateTransactionsService = async (filters, page = 1, limit = 10) => {
  // Validasi basic
  if (filters.startDate && filters.endDate) {
    if (new Date(filters.startDate) > new Date(filters.endDate)) {
      throw new AppError("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.", 400);
    }
  }

  const { page: safePage, limit: safeLimit, offset } = normalizePagination({ page, limit }, 10);

  return withConnection(async (connection) => {

    const totalGroups = await investigationRepo.countDuplicateGroups(connection, filters);
    const duplicates = await investigationRepo.getDuplicateGroups(
      connection,
      filters,
      safeLimit,
      offset,
    );

    const invoiceSet = new Set();
    const itemIdSet = new Set();
    const invoiceRegex = /Sale Ref:\s+(.*?)\s+\(Item/i;

    // Grouping for better frontend consumption
    // We group by baseNote (Invoice Reference)
    const grouped = duplicates.reduce((acc, curr) => {
      const baseNote = curr.notes ? curr.notes.split(" (Item")[0].trim() : "Unknown";
      // Convert baseNote to uppercase to match MySQL case-insensitive grouping
      const normalizedBaseNote = baseNote.toUpperCase();
      const key = `${normalizedBaseNote}_${curr.movement_type}${
        filters.exactQuantity ? "_exact" : ""
      }`;

      if (!acc[key]) {
        let extractedInvoice = null;
        if (curr.notes) {
          const matchInv = curr.notes.match(invoiceRegex);
          if (matchInv && matchInv[1]) {
            extractedInvoice = matchInv[1].trim();
            invoiceSet.add(extractedInvoice);
          }
        }

        acc[key] = {
          baseNote: baseNote, // Keep original casing for display
          movementType: curr.movement_type,
          extractedInvoice,
          pickingList: null,
          totalQuantity: 0,
          totalTransaction: 0,
          uniqueItemsCount: 0,
          occurrences: 0, // Will be calculated based on unique timestamps
          transactions: [],
        };
      }

      acc[key].totalQuantity += curr.quantity;

      acc[key].transactions.push({
        id: curr.id,
        productId: curr.product_id,
        productName: curr.product_name,
        sku: curr.sku,
        quantity: curr.quantity,
        fromLocationCode: curr.from_location_code,
        toLocationCode: curr.to_location_code,
        userId: curr.user_id,
        username: curr.username,
        createdAt: curr.created_at,
        notes: curr.notes,
      });
      return acc;
    }, {});

    // Calculate occurrences based on unique execution times and unique SKUs
    Object.values(grouped).forEach((group) => {
      const uniqueTimes = new Set(group.transactions.map((t) => new Date(t.createdAt).getTime()));
      group.occurrences = uniqueTimes.size;

      const uniqueSkus = new Set(group.transactions.map((t) => t.sku));
      group.uniqueItemsCount = uniqueSkus.size;
    });

    const invoiceIds = Array.from(invoiceSet);
    const itemIds = Array.from(itemIdSet);
    let pickingDetails = [];

    if (invoiceIds.length > 0) {
      const details = await investigationRepo.findPickingListDetailsByInvoices(
        connection,
        invoiceIds,
      );
      pickingDetails = [...pickingDetails, ...details];
    }
    if (itemIds.length > 0) {
      const details = await investigationRepo.findPickingListDetailsByItemIds(connection, itemIds);
      pickingDetails = [...pickingDetails, ...details];
    }

    if (pickingDetails.length > 0) {
      const pickingLists = {}; // map by listId
      const pickingByInvoice = {};
      const pickingByItemId = {};

      pickingDetails.forEach((row) => {
        const listId = row.picking_list_id;
        if (!pickingLists[listId]) {
          pickingLists[listId] = {
            id: row.picking_list_id,
            originalInvoiceId: row.original_invoice_id,
            customerName: row.customer_name,
            source: row.source,
            orderDate: row.order_date,
            status: row.list_status,
            marketplaceStatus: row.marketplace_status,
            shopName: row.shop_name,
            items: [],
          };
          if (row.original_invoice_id) {
            pickingByInvoice[row.original_invoice_id] = pickingLists[listId];
          }
        }
        pickingLists[listId].items.push({
          itemId: row.item_id,
          productId: row.product_id,
          originalSku: row.original_sku,
          productName: row.product_name,
          quantity: row.quantity,
          price: row.price,
          status: row.item_status,
        });
        pickingByItemId[row.item_id] = pickingLists[listId];
      });

      Object.values(grouped).forEach((group) => {
        if (group.extractedInvoice && pickingByInvoice[group.extractedInvoice]) {
          group.pickingList = pickingByInvoice[group.extractedInvoice];
        }
      });
    }

    let finalGrouped = Object.values(grouped);

    // Apply Picking List Filters if any
    const { plSource, plStatus, plMarketplaceStatus, plCustomer } = filters;
    const hasPlFilters =
      (plSource && (plSource.include?.length > 0 || plSource.exclude?.length > 0)) ||
      (plStatus && (plStatus.include?.length > 0 || plStatus.exclude?.length > 0)) ||
      plMarketplaceStatus ||
      plCustomer;

    if (hasPlFilters) {
      finalGrouped = finalGrouped.filter((group) => {
        const pl = group.pickingList;
        if (!pl) return false;

        if (
          plSource &&
          plSource.include &&
          plSource.include.length > 0 &&
          !plSource.include.includes(pl.source)
        )
          return false;
        if (
          plSource &&
          plSource.exclude &&
          plSource.exclude.length > 0 &&
          plSource.exclude.includes(pl.source)
        )
          return false;

        if (
          plStatus &&
          plStatus.include &&
          plStatus.include.length > 0 &&
          !plStatus.include.includes(pl.status)
        )
          return false;
        if (
          plStatus &&
          plStatus.exclude &&
          plStatus.exclude.length > 0 &&
          plStatus.exclude.includes(pl.status)
        )
          return false;

        if (plMarketplaceStatus && pl.marketplaceStatus !== plMarketplaceStatus) return false;
        if (plCustomer && !pl.customerName?.toLowerCase().includes(plCustomer.toLowerCase()))
          return false;

        return true;
      });
    }

    return {
      data: finalGrouped,
      meta: {
        totalGroups,
        ...formatPaginationMeta(totalGroups, safePage, safeLimit),
      },
    };
  });
};

/**
 * Service to revert a specific duplicate stock transaction.
 * @param {number} transactionId
 * @param {number} userId
 */
export const revertTransactionService = async (transactionId, userId) => {
  return withTransaction(async (connection) => {
    // 1. Fetch original transaction
    const [rows] = await connection.query(`SELECT * FROM stock_movements WHERE id = ?`, [
      transactionId,
    ]);
    if (rows.length === 0) {
      throw new AppError("Transaksi tidak ditemukan", 404);
    }
    const originalTrx = rows[0];

    // 2. Prevent double revert by checking notes
    const revertNotesPattern = `%Reversal of Trx #${transactionId}%`;
    const [revertRows] = await connection.query(
      `SELECT id FROM stock_movements WHERE notes LIKE ?`,
      [revertNotesPattern],
    );
    if (revertRows.length > 0) {
      throw new AppError("Transaksi ini sudah di-revert sebelumnya", 400);
    }

    // 3. Restore Physical Stock
    let restored = false;

    if (originalTrx.from_location_id) {
      // It was taken FROM a location (deduction). We put it back.
      await locationRepo.incrementStock(
        connection,
        originalTrx.product_id,
        originalTrx.from_location_id,
        originalTrx.quantity,
      );
      restored = true;
    }

    if (originalTrx.to_location_id) {
      // It was added TO a location. We deduct it.
      await locationRepo.deductStock(
        connection,
        originalTrx.product_id,
        originalTrx.to_location_id,
        originalTrx.quantity,
      );
      restored = true;
    }

    if (!restored) {
      throw new AppError("Transaksi tidak valid (tidak ada from_location maupun to_location)", 400);
    }

    // 4. Log Reversal
    await stockRepo.createLog(connection, {
      productId: originalTrx.product_id,
      quantity: originalTrx.quantity,
      toLocationId: originalTrx.from_location_id, // Putting back to where it was taken from
      fromLocationId: originalTrx.to_location_id, // Taking from where it went to
      type: "REVERSAL",
      userId: userId,
      notes: `Reversal of Trx #${transactionId} - ${originalTrx.notes}`,
    });

    // 5. Tandai transaksi asli sebagai reverted agar UI bisa langsung menonaktifkan tombol
    await connection.query(
      `UPDATE stock_movements SET notes = CONCAT(notes, ' [REVERTED]') WHERE id = ?`,
      [transactionId],
    );

    signals.transactionReverted();
    signals.refreshStock();
    return { success: true, message: "Transaksi berhasil di-revert dan stok dikembalikan." };
  });
};
