// backend/services/reportService.js
import db from "../config/db.js";
import ExcelJS from "exceljs";

/**
 * Helper untuk styling header di ExcelJS
 */
const styleHeader = (
  worksheet,
  rowNumber,
  colCount,
  bgColor = "FFD9E1F2",
  fontColor = "FF000000"
) => {
  const row = worksheet.getRow(rowNumber);
  row.height = 20;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    // [FIX] Menggunakan fontColor dari parameter
    cell.font = { bold: true, color: { argb: fontColor } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
};

/**
 * Helper untuk styling data border
 */
const applyDataBorders = (worksheet, startRow, endRow, colCount) => {
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  }
};

/**
 * Menghasilkan file Excel (sebagai stream) dengan 2 sheet:
 * 1. Ringkasan Stok (Pivot per SKU dan Lokasi)
 * 2. Data Mentah (Detail per Lokasi)
 *
 * @param {object} filters - Objek filter
 * @returns {Promise<ExcelJS.Workbook>} Workbook Excel yang siap di-stream.
 */
export const generateStockReport = async (filters = {}) => {
  let connection;
  try {
    connection = await db.getConnection();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WMHRIS";
    workbook.lastModifiedBy = "WMHRIS";
    workbook.created = new Date();

    const [locationRows] = await connection.query(
      "SELECT DISTINCT code FROM locations WHERE code IS NOT NULL AND code != '' ORDER BY code ASC"
    );
    const locationCodes = locationRows.map((row) => row.code);

    let whereClauses = ["p.is_active = 1"];
    const queryParams = [];

    const baseQuery = `
      SELECT
        p.sku AS Sku,
        p.name AS NamaProduk,
        l.code AS Lokasi,
        COALESCE(sl.quantity, 0) AS Kuantitas,
        p.price AS HargaSatuan,
        (COALESCE(sl.quantity, 0) * p.price) AS TotalNilai
      FROM
        products p
      LEFT JOIN
        stock_locations sl ON p.id = sl.product_id
      LEFT JOIN
        locations l ON sl.location_id = l.id
    `;

    switch (filters.stockStatus) {
      case "positive":
        whereClauses.push("COALESCE(sl.quantity, 0) > 0");
        break;
      case "negative":
        whereClauses.push("COALESCE(sl.quantity, 0) < 0");
        break;
      case "zero":
        whereClauses.push("COALESCE(sl.quantity, 0) = 0");
        break;
      case "all":
        break;
      default:
        whereClauses.push("COALESCE(sl.quantity, 0) > 0");
    }

    if (filters.building && filters.building.length > 0) {
      whereClauses.push("l.building IN (?)");
      queryParams.push(filters.building);
    }
    if (filters.searchQuery) {
      whereClauses.push("(p.sku LIKE ? OR p.name LIKE ?)");
      queryParams.push(`%${filters.searchQuery}%`);
      queryParams.push(`%${filters.searchQuery}%`);
    }
    if (filters.purpose) {
      whereClauses.push("l.purpose = ?");
      queryParams.push(filters.purpose);
    }
    if (filters.isPackage !== null && filters.isPackage !== undefined && filters.isPackage !== "") {
      whereClauses.push("p.is_package = ?");
      queryParams.push(filters.isPackage);
    }

    const finalQuery = `
      ${baseQuery}
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY
        p.sku, l.code;
    `;

    const [rows] = await connection.query(finalQuery, queryParams);

    const pivotData = new Map();

    rows.forEach((row) => {
      const qty = parseFloat(row.Kuantitas) || 0;
      const val = parseFloat(row.TotalNilai) || 0;

      if (!pivotData.has(row.Sku)) {
        const newEntry = {
          Sku: row.Sku,
          NamaProduk: row.NamaProduk,
          HargaSatuan: parseFloat(row.HargaSatuan) || 0,
          GrandTotalKuantitas: 0,
          GrandTotalNilai: 0,
        };
        for (const code of locationCodes) {
          newEntry[code] = 0;
        }
        pivotData.set(row.Sku, newEntry);
      }

      const current = pivotData.get(row.Sku);

      if (row.Lokasi && locationCodes.includes(row.Lokasi)) {
        current[row.Lokasi] += qty;
      }

      current.GrandTotalKuantitas += qty;
      current.GrandTotalNilai += val;
    });

    const aggregatedRows = Array.from(pivotData.values());

    // ==============================
    // --- Ringkasan Stok (Pivot) ---
    // ==============================
    const pivotSheet = workbook.addWorksheet("Ringkasan Stok");

    let excelColumns = [];
    excelColumns.push({ key: "Sku", width: 25 });
    excelColumns.push({ key: "NamaProduk", width: 50 });
    for (const code of locationCodes) {
      excelColumns.push({
        key: code,
        width: 12,
        style: { numFmt: "#,##0", alignment: { horizontal: "right" } },
      });
    }
    excelColumns.push({
      key: "GrandTotalKuantitas",
      width: 15,
      style: { numFmt: "#,##0;[Red](#,##0);0", alignment: { horizontal: "right" } },
    });
    excelColumns.push({
      key: "HargaSatuan",
      width: 22,
      style: { numFmt: '"Rp"#,##0.00', alignment: { horizontal: "right" } },
    });
    excelColumns.push({
      key: "TotalNilai",
      width: 25,
      style: { numFmt: '"Rp"#,##0.00', alignment: { horizontal: "right" } },
    });

    pivotSheet.columns = excelColumns;

    let headerTexts = [];
    headerTexts.push("SKU");
    headerTexts.push("Nama Produk");
    headerTexts.push(...locationCodes);
    headerTexts.push("Grand Total");
    headerTexts.push("Harga Satuan");
    headerTexts.push("Total Nilai");

    const totalColumns = excelColumns.length;

    pivotSheet.mergeCells(1, 1, 1, totalColumns);
    const titleCell = pivotSheet.getCell("A1");
    titleCell.value = "Laporan Ringkasan Stok (Per Lokasi)";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    pivotSheet.getRow(1).height = 30;
    pivotSheet.getRow(2).height = 10;
    const headerRow = pivotSheet.getRow(3);
    headerRow.values = headerTexts;
    styleHeader(pivotSheet, 3, totalColumns, "FF4472C4", "FFFFFFFF"); // BG Biru, Font Putih

    // Tambahkan Data Agregat
    aggregatedRows.forEach((row) => {
      // Ganti 0 dengan string kosong untuk data lokasi agar lebih bersih
      const rowData = { ...row };
      for (const code of locationCodes) {
        if (rowData[code] === 0) {
          rowData[code] = ""; // Kosongkan sel jika 0
        }
      }
      pivotSheet.addRow(rowData);
    });

    // Terapkan Border untuk Data (mulai dari baris 4)
    const dataStartRow = 4;
    const dataEndRow = dataStartRow + aggregatedRows.length - 1;
    if (aggregatedRows.length > 0) {
      applyDataBorders(pivotSheet, dataStartRow, dataEndRow, totalColumns);
    }

    pivotSheet.views = [{ state: "frozen", xSplit: 2, ySplit: 3, topLeftCell: "C4" }];

    // ===================================
    // --- Data Mentah (Detail Lokasi) ---
    // ===================================
    const rawSheet = workbook.addWorksheet("Data Mentah (Detail Lokasi)");

    rawSheet.columns = [
      { header: "SKU", key: "Sku", width: 20 },
      { header: "Nama Produk", key: "NamaProduk", width: 45 },
      { header: "Lokasi", key: "Lokasi", width: 15 },
      { header: "Kuantitas", key: "Kuantitas", width: 10 },
      { header: "Harga Satuan", key: "HargaSatuan", width: 20 },
      { header: "Total Nilai", key: "TotalNilai", width: 20 },
    ];
    styleHeader(rawSheet, 1, 6, "FFD9E1F2", "FF000000");
    rows.forEach((row) => {
      rawSheet.addRow(row);
    });
    rawSheet.getColumn("Kuantitas").numFmt = "#,##0";
    rawSheet.getColumn("HargaSatuan").numFmt = '"Rp"#,##0.00';
    rawSheet.getColumn("TotalNilai").numFmt = '"Rp"#,##0.00';
    rawSheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2" }];

    return workbook;
  } catch (error) {
    console.error("Error di generateStockReport service:", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

// ===============================
// --- FUNGSI getReportFilters ---
// ===============================
export const getReportFilters = async () => {
  let connection;
  try {
    connection = await db.getConnection();

    const [allBuildingRows] = await connection.query(
      "SELECT DISTINCT building FROM locations WHERE building IS NOT NULL AND building != '' ORDER BY building ASC"
    );

    const [purposeRows] = await connection.query(
      "SELECT DISTINCT purpose FROM locations WHERE purpose IS NOT NULL AND purpose != '' ORDER BY purpose ASC"
    );

    const [relationRows] = await connection.query(
      "SELECT DISTINCT purpose, building FROM locations WHERE purpose IS NOT NULL AND building IS NOT NULL AND purpose != '' AND building != ''"
    );

    const buildingsByPurpose = {};
    relationRows.forEach((row) => {
      if (!buildingsByPurpose[row.purpose]) {
        buildingsByPurpose[row.purpose] = [];
      }
      buildingsByPurpose[row.purpose].push(row.building);
    });

    return {
      allBuildings: allBuildingRows.map((row) => row.building),
      purposes: purposeRows.map((row) => row.purpose),
      buildingsByPurpose: buildingsByPurpose,
    };
  } catch (error) {
    console.error("Error di getReportFilters service:", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
