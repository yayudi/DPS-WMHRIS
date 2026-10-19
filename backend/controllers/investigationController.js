import catchAsync from "../utils/catchAsync.js";
import * as investigationService from "../services/investigationService.js";
import { parseJsonSafe } from "../utils/jsonUtils.js";

/**
 * Mendapatkan transaksi ganda (duplikat).
 */
export const getDuplicateTransactions = catchAsync(async (req, res, next) => {
  const { 
    startDate, endDate, includeNotes, excludeNotes, movementType, 
    productName, username, location, exactQuantity, page = 1, limit = 10,
    revertStatus, plSource, plStatus, plMarketplaceStatus, plCustomer,
    minOccurrences, maxOccurrences, minSku, maxSku, sortBy, sortDirection, maxTimeGap
  } = req.query;

  const result = await investigationService.getDuplicateTransactionsService({
    startDate,
    endDate,
    includeNotes,
    excludeNotes,
    movementType: parseJsonSafe(movementType, null),
    productName,
    username,
    location,
    exactQuantity: exactQuantity === 'true',
    revertStatus,
    plSource: parseJsonSafe(plSource, null),
    plStatus: parseJsonSafe(plStatus, null),
    plMarketplaceStatus,
    plCustomer,
    minOccurrences: minOccurrences ? Number(minOccurrences) : undefined,
    maxOccurrences: maxOccurrences ? Number(maxOccurrences) : undefined,
    minSku: minSku ? Number(minSku) : undefined,
    maxSku: maxSku ? Number(maxSku) : undefined,
    maxTimeGap: maxTimeGap ? Number(maxTimeGap) : undefined,
    sortBy,
    sortDirection
  }, Number(page), Number(limit));

  res.json({ success: true, ...result });
});

/**
 * Revert (Rollback) a specific transaction.
 */
export const revertTransaction = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.id || 1; // Assuming req.user is set by auth middleware

  const result = await investigationService.revertTransactionService(id, userId);

  res.json(result);
});
