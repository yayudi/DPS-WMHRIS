// backend\utils\ExcelSanitizer.js
import XLSX from "xlsx"; // FIXED: Use Default Import for CommonJS compatibility
import fs from "fs";
import path from "path";

/**
 * Repairs a malformed Excel file by reading it with SheetJS (robust)
 * and writing it back out as a clean standard XLSX file.
 * @param {string} filePath - Absolute path to the corrupted file
 * @returns {string} - Path to the sanitized file (usually the same path)
 */
export const sanitizeExcel = (filePath) => {
  try {
    // Read with SheetJS (Tolerant of broken structures)
    // Note: XLSX.readFile automatically handles the fs module in Node.js
    const workbook = XLSX.readFile(filePath, {
      type: "file",
      cellDates: true,
      cellNF: false,
      cellText: false,
    });

    // Re-write to buffer (Generates clean XML)
    const cleanBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
      compression: true,
    });

    // Overwrite the original file
    fs.writeFileSync(filePath, cleanBuffer);

    return filePath;
  } catch (error) {
    console.error(`[ExcelSanitizer] ❌ Repair failed:`, error.message);
    // If XLSX.readFile failed, maybe the file is truly unreadable or empty
    throw error;
  }
};
