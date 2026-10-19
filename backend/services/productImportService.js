// backend/services/priceImportService.js
import { ParserEngine } from "./parsers/ParserEngine.js";
import * as productRepo from "../repositories/productRepository.js";
import * as categoryRepo from "../repositories/categoryRepository.js";
import Logger from "../utils/logger.js";

export const processProductImport = async (
  connection,
  filePath,
  userId,
  originalFilename,
  updateProgressCallback,
  isDryRun = false,
  options = {},
) => {
  let logSummary = "";
  const logicErrors = [];
  let updatedCount = 0;
  const createdCount = 0;

  // Pagination / Resume Support
  const startIndex = options.lastRow || 0;
  let processedInThisRun = 0;

  // Time limit check (25 detik untuk Shared Hosting)
  const startTime = Date.now();
  const TIME_LIMIT = 25000;

  Logger.info(
    `Processing: ${originalFilename} (DryRun: ${isDryRun}) start: ${startIndex}`,
    "PRODUCT_IMPORT_SERVICE",
  );

  try {
    // Gunakan Mapper baru 'MassProductUpdate'
    const parser = new ParserEngine(filePath, "MassProductUpdate");

    const { orders: dataMap, errors: parserErrors, headerRowIdx } = await parser.run();
    logicErrors.push(...parserErrors);
    const actualHeaderRowIndex = headerRowIdx || 1;

    const totalItems = dataMap.size;
    const allData = Array.from(dataMap.values());

    logSummary += `Total baris terbaca: ${totalItems}. `;

    // [OPTIMIZATION] Bulk-fetch all relevant products to prevent N+1 queries
    const skusToFetch = allData
      .slice(startIndex)
      .map((item) => item.sku)
      .filter(Boolean);
    const dbProductMap = new Map();
    if (skusToFetch.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < skusToFetch.length; i += chunkSize) {
        const chunk = skusToFetch.slice(i, i + chunkSize);
        const existingRows = await productRepo.getProductsBySkus(connection, chunk);
        existingRows.forEach((row) => dbProductMap.set(row.sku, row));
      }
    }

    // [OPTIMIZATION] Fetch Categories to Map category names to IDs
    const categories = await categoryRepo.findAllCategories(connection);
    const categoryMap = {};
    categories.forEach(c => {
      categoryMap[c.name.toLowerCase().trim()] = c.id;
    });

    for (let i = startIndex; i < totalItems; i++) {
      // Cek Timeout
      if (Date.now() - startTime > TIME_LIMIT) {
        return {
          logSummary: logSummary + ` (Paused at row ${i})`,
          errors: logicErrors,
          headerRowIndex: actualHeaderRowIndex,
          stats: {
            total: totalItems,
            success: updatedCount + createdCount,
            failed: logicErrors.length,
          },
          partial: true,
          nextOptions: { lastRow: i },
        };
      }

      const csvItem = allData[i];
      const row = csvItem.items && csvItem.items[0] ? csvItem.items[0].row : 0;
      const { sku } = csvItem;

      try {
        // 1. Cek Eksistensi Produk di DB (O(1) memory lookup)
        const dbProduct = dbProductMap.get(sku);
        const productExists = !!dbProduct;

        if (productExists) {
          let targetCategoryId = dbProduct.category_id;
          if (csvItem.category !== undefined && csvItem.category !== "") {
            const mappedId = categoryMap[csvItem.category.toLowerCase().trim()];
            if (mappedId) {
              targetCategoryId = mappedId;
            } else {
              logicErrors.push({
                row,
                message: `Kategori '${csvItem.category}' tidak ditemukan. Mohon buat kategori tersebut di menu Kategori Produk terlebih dahulu.`,
              });
              continue; // Skip this row per Option A
            }
          }

          // --- UPDATE SCENARIO ---
          const payload = {
            name: csvItem.name || dbProduct.name,
            category_id: targetCategoryId,
            price:
              csvItem.price !== undefined && csvItem.price !== "" ? csvItem.price : dbProduct.price,
            weight:
              csvItem.weight !== undefined && csvItem.weight !== ""
                ? csvItem.weight
                : dbProduct.weight,
            length:
              csvItem.length !== undefined && csvItem.length !== ""
                ? csvItem.length
                : dbProduct.length,
            width:
              csvItem.width !== undefined && csvItem.width !== ""
                ? csvItem.width
                : dbProduct.width,
            height:
              csvItem.height !== undefined && csvItem.height !== ""
                ? csvItem.height
                : dbProduct.height,
            is_package: 0,
            is_active:
              csvItem.is_active !== undefined && csvItem.is_active !== ""
                ? csvItem.is_active
                : dbProduct.is_active,
          };

          // [PHASE 1] SAFETY GUARD: Reject Package Updates via Batch Edit
          if (dbProduct.is_package === 1) {
            logicErrors.push({
              row,
              message: `SKU '${sku}' adalah Paket. Batch Edit ini hanya untuk Produk Biasa.`,
            });
            continue;
          }

          if (!isDryRun) {
            // Panggil Repository Update (Ini otomatis catat Audit Log!)
            await productRepo.updateProductTransaction(
              connection,
              dbProduct.id,
              payload,
              [],
              userId,
            );

            // Handle status aktif/nonaktif khusus
            if (csvItem.is_active !== undefined && csvItem.is_active !== "") {
              const isActiveBool =
                csvItem.is_active === 1 ||
                csvItem.is_active === "1" ||
                csvItem.is_active === true ||
                csvItem.is_active === "true";
              await productRepo.updateProductStatus(connection, dbProduct.id, isActiveBool);
            }
          }
          updatedCount++;
        } else {
          logicErrors.push({
            row,
            message: `SKU '${sku}' tidak ditemukan. Batch Edit hanya untuk update produk yang sudah ada.`,
          });
        }
      } catch (err) {
        logicErrors.push({ row, message: `Error SKU ${sku}: ${err.message}` });
      }

      processedInThisRun++;
      // Update progress DB
      if (processedInThisRun % 20 === 0 && updateProgressCallback) {
        await updateProgressCallback(i + 1, totalItems);
      }
    }

    const modeText = isDryRun ? "[SIMULASI] " : "";
    logSummary = `${modeText}Selesai. Baru: ${createdCount}, Update: ${updatedCount}, Gagal: ${logicErrors.length}.`;

    // Return format standar yang diharapkan importQueue.js
    return {
      logSummary,
      errors: logicErrors,
      headerRowIndex: actualHeaderRowIndex,
      stats: {
        total: totalItems,
        success: createdCount + updatedCount,
        failed: logicErrors.length,
      },
    };
  } catch (error) {
    Logger.error("Error", error, "PRODUCT_IMPORT_SERVICE");
    throw error;
  }
};
