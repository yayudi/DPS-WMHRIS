import { withConnection } from "../utils/dbUtils.js";
import ExcelJS from "exceljs";
import * as productRepo from "../repositories/productRepository.js";
import * as categoryRepo from "../repositories/categoryRepository.js";
import Logger from "../utils/logger.js";

/**
 * Validates and Imports Package Components
 * Strategy:
 * 1. Read Excel/CSV.
 * 2. Find header row and map columns dynamically by name.
 * 3. Validate Package SKU exists.
 * 4. Validate Component SKUs exist.
 * 5. Replace components (DELETE old -> INSERT new).
 */
export const processPackageImport = async (filePath, jobId, updateProgress, userId) => {
  Logger.info(`Processing file: ${filePath}`, "PACKAGE_IMPORT");

  return withConnection(async (connection) => {
    const errors = [];
    let processedCount = 0;
    let successCount = 0;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1); // Assume Sheet 1

    if (!worksheet) throw new Error("File Excel tidak memiliki sheet.");

    const rows = [];
    let headerRow = null;
    worksheet.eachRow((row, rowNumber) => {
      if (!headerRow && rowNumber <= 10 && row.hasValues) {
        let hasSku = false;
        row.eachCell((cell) => {
          if (cell.text?.trim().toLowerCase() === "sku") hasSku = true;
        });
        if (hasSku) {
           headerRow = row;
           return;
        }
      }
      if (headerRow && row.number > headerRow.number) {
        rows.push(row);
      }
    });

    if (!headerRow) throw new Error("Header (dengan kolom 'SKU') tidak ditemukan di file.");

    // Map Headers Dynamically
    const headerMap = { sku: -1, name: -1, category: -1, price: -1 };
    const componentPairs = []; // array of { compCol, qtyCol }

    headerRow.eachCell((cell, colNumber) => {
      const headerName = cell.text?.trim().toLowerCase();
      if (!headerName) return;

      if (headerName === "sku") headerMap.sku = colNumber;
      else if (headerName === "nama paket" || headerName === "name" || headerName === "nama") headerMap.name = colNumber;
      else if (headerName === "kategori" || headerName === "category") headerMap.category = colNumber;
      else if (headerName === "harga jual" || headerName === "price" || headerName === "harga") headerMap.price = colNumber;
      else if (headerName.startsWith("component_") || headerName.startsWith("komponen_")) {
        const parts = headerName.split("_");
        const idx = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(idx)) {
          if (!componentPairs[idx]) componentPairs[idx] = {};
          componentPairs[idx].compCol = colNumber;
        }
      }
      else if (headerName.startsWith("qty_")) {
        const parts = headerName.split("_");
        const idx = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(idx)) {
          if (!componentPairs[idx]) componentPairs[idx] = {};
          componentPairs[idx].qtyCol = colNumber;
        }
      }
    });

    if (headerMap.sku === -1) throw new Error("Kolom 'SKU' wajib ada di baris header.");

    const validComponentPairs = componentPairs.filter(p => p && p.compCol && p.qtyCol);

    const totalRows = rows.length;
    Logger.info(`Total rows found: ${totalRows}. Valid Component Pairs: ${validComponentPairs.length}`, "PACKAGE_IMPORT");

    // [OPTIMIZATION] Fetch Categories to Map category names to IDs
    const categories = await categoryRepo.findAllCategories(connection);
    const categoryMap = {};
    categories.forEach(c => {
      categoryMap[c.name.toLowerCase().trim()] = c.id;
    });

    for (const row of rows) {
      processedCount++;
      if (processedCount % 10 === 0) {
        await updateProgress(Math.round((processedCount / totalRows) * 100));
      }

      const packageSku = row.getCell(headerMap.sku).text?.trim();

      if (!packageSku) {
        errors.push(`Row ${row.number}: SKU Paket kosong.`);
        continue;
      }

      // Validate Package Exists
      const packageId = await productRepo.getIdBySku(connection, packageSku);
      if (!packageId) {
        errors.push(`Row ${row.number}: Paket SKU '${packageSku}' tidak ditemukan.`);
        continue;
      }
      
      const dbProduct = await productRepo.getProductById(connection, packageId);
      
      // Map Category
      let targetCategoryId = dbProduct.category_id;
      if (headerMap.category !== -1) {
        const categoryName = row.getCell(headerMap.category).text?.trim();
        if (categoryName) {
           const mappedId = categoryMap[categoryName.toLowerCase()];
           if (mappedId) {
             targetCategoryId = mappedId;
           } else {
             errors.push(`Row ${row.number}: Kategori '${categoryName}' tidak ditemukan. Mohon buat kategori tersebut di menu Kategori Produk terlebih dahulu.`);
             continue; // Skip per Option A
           }
        }
      }

      // Parse Components
      const componentsToInsert = [];
      let hasComponentError = false;

      for (const pair of validComponentPairs) {
        const compSku = row.getCell(pair.compCol).text?.trim();
        const compQty = row.getCell(pair.qtyCol).value;

        if (compSku) {
          // Validate Component SKU
          const compId = await productRepo.getIdBySku(connection, compSku);
          if (!compId) {
            errors.push(`Row ${row.number}: Komponen SKU '${compSku}' tidak ditemukan.`);
            hasComponentError = true;
            break; // Stop parsing this row
          }

          // Validate Qty
          const qty = parseInt(compQty);
          if (!qty || qty <= 0) {
            errors.push(`Row ${row.number}: Qty untuk '${compSku}' tidak valid.`);
            hasComponentError = true;
            break;
          }

          componentsToInsert.push({ id: compId, quantity: qty });
        }
      }

      if (hasComponentError) continue;

      const packageName = headerMap.name !== -1 ? row.getCell(headerMap.name).text?.trim() : null;
      const packagePrice = headerMap.price !== -1 ? row.getCell(headerMap.price).value : null;

      if (componentsToInsert.length === 0 && !packageName && (packagePrice === null || packagePrice === undefined || packagePrice === "") && targetCategoryId === dbProduct.category_id) {
        errors.push(`Row ${row.number}: Tidak ada komponen valid atau data harga/nama/kategori untuk diupdate.`);
        continue;
      }

      // Transaction: Replace Components and Update Product
      try {
        await connection.beginTransaction();

        const updatePayload = {};
        if (packageName) updatePayload.name = packageName;
        if (packagePrice !== null && packagePrice !== undefined && packagePrice !== "") updatePayload.price = packagePrice;
        if (targetCategoryId !== dbProduct.category_id) updatePayload.category_id = targetCategoryId;

        if (Object.keys(updatePayload).length > 0) {
          await productRepo.updateProductTransaction(connection, packageId, updatePayload, [], userId);
        }

        if (componentsToInsert.length > 0) {
          await productRepo.deleteComponents(connection, packageId);
          await productRepo.insertComponents(connection, packageId, componentsToInsert);
        }

        await connection.commit();
        successCount++;
      } catch (err) {
        await connection.rollback();
        errors.push(`Row ${row.number}: DB Error - ${err.message}`);
      }
    }

    return { successCount, errors, headerRowIndex: headerRow.number };
  });
};
