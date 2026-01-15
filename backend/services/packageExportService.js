import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import * as productRepo from "../repositories/productRepository.js";

const styleHeader = (worksheet, rowNumber, colCount, bgColor = "FFD9E1F2") => {
  const row = worksheet.getRow(rowNumber);
  row.height = 20;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.font = { bold: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  row.commit();
};

export const generatePackageExport = async (filters, filePath) => {
  console.log(`[PackageExport] Starting export to: ${filePath}`);
  let connection;
  const stream = fs.createWriteStream(filePath);
  const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: stream,
    useStyles: true,
    useSharedStrings: true,
  });

  try {
    connection = await db.getConnection();

    // 1. Fetch Data Flattened (Package SKU | Comp SKU)
    const rows = await productRepo.getAllPackagesWithComponents(connection);

    // 2. Process Data: Group by Package
    const packagesMap = new Map();
    let maxComponentCount = 0;

    for (const row of rows) {
      if (!packagesMap.has(row.package_sku)) {
        packagesMap.set(row.package_sku, {
          sku: row.package_sku,
          name: row.package_name,
          price: row.package_price,
          components: [],
        });
      }
      if (row.component_sku) {
        packagesMap.get(row.package_sku).components.push({
          sku: row.component_sku,
          qty: row.component_qty,
        });
      }
    }

    // Determine Matrix Width
    for (const p of packagesMap.values()) {
      if (p.components.length > maxComponentCount) maxComponentCount = p.components.length;
    }
    // Minimal 5 slots for template nice-ness
    maxComponentCount = Math.max(maxComponentCount, 5);

    // 3. Setup Sheet
    const sheet = workbookWriter.addWorksheet("Data Paket");
    const headers = ["SKU", "Nama Paket", "Harga Jual"];

    // Add Dynamic Headers (Component_1, Qty_1, ...)
    const columns = [
      { key: "sku", width: 15 },
      { key: "name", width: 40 },
      { key: "price", width: 15 },
    ];

    for (let i = 1; i <= maxComponentCount; i++) {
      headers.push(`Component_${i}`, `Qty_${i}`);
      columns.push({ key: `c_${i}`, width: 15 }, { key: `q_${i}`, width: 8 });
    }

    sheet.columns = columns;
    sheet.getRow(1).values = headers;
    styleHeader(sheet, 1, headers.length);

    // 4. Write Rows
    for (const p of packagesMap.values()) {
      const rowData = {
        sku: p.sku,
        name: p.name,
        price: p.price,
      };

      p.components.forEach((comp, idx) => {
        const i = idx + 1;
        rowData[`c_${i}`] = comp.sku;
        rowData[`q_${i}`] = comp.qty;
      });

      sheet.addRow(rowData).commit();
    }

    sheet.commit();
    await workbookWriter.commit();

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
       if (stream.writableEnded || stream.destroyed) return resolve();
       stream.on("finish", resolve);
       stream.on("error", reject);
       stream.on("close", resolve);
    });

    console.log("[PackageExport] Finished.");
  } catch (error) {
    console.error("[PackageExport] Error:", error);
    try { stream.end(); } catch (e) {}
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
