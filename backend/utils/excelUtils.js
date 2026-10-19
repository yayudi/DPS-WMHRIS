/**
 * Utility helper terpusat untuk manipulasi dokumen dan worksheet ExcelJS.
 */

/**
 * Menata gaya baris header pada worksheet ExcelJS (background, font, border, alignment).
 *
 * @param {import('exceljs').Worksheet} worksheet - Worksheet target
 * @param {number} rowNumber - Baris indeks header (1-indexed)
 * @param {number} colCount - Jumlah kolom yang distyle
 * @param {string} [bgColor="FFD9E1F2"] - Warna background ARGB (default soft blue/grey)
 * @param {string} [fontColor="FF000000"] - Warna teks ARGB (default hitam)
 * @returns {void}
 */
export const styleHeader = (
  worksheet,
  rowNumber,
  colCount,
  bgColor = "FFD9E1F2",
  fontColor = "FF000000"
) => {
  if (!worksheet || !colCount || colCount < 1) return;

  const row = worksheet.getRow(rowNumber);
  row.height = 20;

  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    cell.font = {
      bold: true,
      color: { argb: fontColor },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
    };
  }

  if (typeof row.commit === "function") {
    row.commit();
  }
};

/**
 * Membersihkan nama sheet agar valid menurut batasan Excel (maksimal 31 karakter dan tanpa karakter ilegal).
 *
 * @param {string} sheetName - Nama sheet mentah
 * @returns {string} - Nama sheet yang aman
 */
export const sanitizeSheetName = (sheetName) => {
  return String(sheetName || "Sheet1")
    .substring(0, 31)
    .replace(/[\\/?*[\]]/g, "-");
};
