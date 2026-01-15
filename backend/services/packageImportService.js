import db from "../config/db.js";
import ExcelJS from "exceljs";
import * as productRepo from "../repositories/productRepository.js";

/**
 * Validates and Imports Package Components
 * Strategy:
 * 1. Read Excel/CSV.
 * 2. Validate Package SKU exists.
 * 3. Validate Component SKUs exist.
 * 4. Replace components (DELETE old -> INSERT new).
 */
export const processPackageImport = async (filePath, jobId, updateProgress) => {
  console.log(`[PackageImport] Processing file: ${filePath}`);
  let connection;
  const errors = [];
  let processedCount = 0;
  let successCount = 0;

  try {
    connection = await db.getConnection();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1); // Assume Sheet 1

    if (!worksheet) throw new Error("File Excel tidak memiliki sheet.");

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip Header
      rows.push(row);
    });

    const totalRows = rows.length;
    console.log(`[PackageImport] Total rows found: ${totalRows}`);

    for (const row of rows) {
      processedCount++;
      if (processedCount % 10 === 0) {
        await updateProgress(Math.round((processedCount / totalRows) * 100));
      }

      // Column Mapping (Based on Export Service)
      // 1: SKU, 2: Name, 3: Price
      // 4: Comp1, 5: Qty1, 6: Comp2, 7: Qty2 ...
      const packageSku = row.getCell(1).text?.trim();

      if (!packageSku) {
        errors.push(`Row ${row.number}: SKU Paket kosong.`);
        continue;
      }

      // 1. Validate Package Exists
      const packageId = await productRepo.getIdBySku(connection, packageSku);
      if (!packageId) {
        errors.push(`Row ${row.number}: Paket SKU '${packageSku}' tidak ditemukan.`);
        continue;
      }

      // 2. Parse Components
      const componentsToInsert = [];
      let colIdx = 4;
      let hasComponentError = false;

      while (colIdx < row.cellCount) {
        const compSku = row.getCell(colIdx).text?.trim();
        const compQty = row.getCell(colIdx + 1).value;

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
        colIdx += 2; // Jump to next pair
      }

      if (hasComponentError) continue;
      if (componentsToInsert.length === 0) {
          errors.push(`Row ${row.number}: Tidak ada komponen valid.`);
          continue;
      }

      // 3. Transaction: Replace Components
      try {
        await connection.beginTransaction();
        await productRepo.deleteComponents(connection, packageId);
        await productRepo.insertComponents(connection, packageId, componentsToInsert);

        // Optional: Update Price/Name if provided?
        // For now, let's stick to component update as per requirement.
        // We could update is_active=1 if needed.

        await connection.commit();
        successCount++;
      } catch (err) {
        await connection.rollback();
        errors.push(`Row ${row.number}: DB Error - ${err.message}`);
      }
    }

    return { successCount, errors };

  } catch (error) {
    console.error("[PackageImport] Fatal Error:", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
