import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import { processAttendanceImport } from "../services/attendanceImportService.js";
import { generateErrorFile } from "../utils/workerHelpers.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  let connection;
  try {
    connection = await db.getConnection();
    const csvPath = path.resolve(__dirname, "../.agent/context/TransactionsReportJa26.csv");

    console.log("Menjalankan Simulasi Import (Dry Run = false)...");

    const result = await processAttendanceImport(
      connection,
      csvPath,
      1, // userId
      "TransactionsReportJa26.csv",
      (curr, total) => {
        // console.log(`Progress: ${curr}/${total}`);
      },
      false, // isDryRun (kita test beneran atau false biar kena db constraint)
      {},
    );

    console.log("=== HASIL IMPORT ===");
    console.log("Log Summary:", result.logSummary);
    console.log("Stats:", result.stats);
    console.log("Header Row Index:", result.headerRowIndex);
    console.log("Errors Count:", result.errors ? result.errors.length : 0);

    if (result.errors && result.errors.length > 0) {
      console.log("Sebagian data error, men-generate Excel...");
      const exportDir = path.resolve(__dirname, "storage/exports");
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      const excelUrl = await generateErrorFile(
        csvPath,
        result.errors,
        result.headerRowIndex,
        999, // dummy jobId
        exportDir,
      );
      console.log("Berhasil generate Excel Error:", excelUrl);
    }
  } catch (error) {
    console.error("FATAL ERROR TEST:", error);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

runTest();
