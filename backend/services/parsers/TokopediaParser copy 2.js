// backend\services\parsers\TokopediaParser.js
import path from "path";
import ExcelJS from "exceljs";
import { Mappers } from "../../config/importMappers.js";
import { sanitizeExcel } from "../../utils/ExcelSanitizer.js";

export class TokopediaParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.source = "Tokopedia";
    this.mapper = Mappers["Tokopedia"];

    this.stats = { totalRows: 0, success: 0, failed: 0, skippedStatus: 0 };
    this.auditLog = [];
    this.sanitized = false;
  }

  _normalizeHeaderClean(val) {
    if (!val) return "";
    return String(val)
      .toLowerCase()
      .replace(/\u00A0/g, " ")
      .replace(/[^\w\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async run() {
    console.log(`\n[TokopediaParser] 🚀 START: ${path.basename(this.filePath)}`);
    const workbook = new ExcelJS.Workbook();
    const ext = path.extname(this.filePath).toLowerCase();

    try {
      if (ext === ".csv") {
        await workbook.csv.readFile(this.filePath, {
          parserOptions: { delimiter: ",", quote: '"', trim: true },
        });
      } else {
        await workbook.xlsx.readFile(this.filePath);
      }

      const result = await this._processWorkbookData(workbook);

      console.log(`[TokopediaParser] 🏁 FINISH. Stats:`, this.stats);

      if (this.auditLog.length > 0) {
        console.log(`[TokopediaParser] ⚠️ Laporan Baris yang Tidak Masuk:`);
        this.auditLog.forEach((log) => {
          console.log(`   Row ${log.row} [${log.sku}]: ${log.message}`);
        });
      }

      return {
        orders: result.orders,
        stats: this.stats,
        errors: this.auditLog,
        headerRowIndex: result.headerRowIdx,
      };
    } catch (error) {
      // Logika Self-Healing
      const isRescueable =
        error.message === "LOW_HEADER_SCORE" ||
        error.message === "FORCE_SANITIZE" ||
        error.message.includes("end of central directory");

      if (isRescueable && !this.sanitized) {
        console.warn(`[TokopediaParser] 🚑 File Error (${error.message}). Mencoba Sanitasi...`);
        await sanitizeExcel(this.filePath);
        this.sanitized = true;
        this.stats = { totalRows: 0, success: 0, failed: 0, skippedStatus: 0 };
        this.auditLog = [];
        return this.run();
      }
      throw error;
    }
  }

  async _processWorkbookData(workbook) {
    let bestSheet = null;
    let headerMap = {};
    let headerRowIdx = 0;
    let maxScore = 0;

    // Tambahkan 'status' ke goldenKeys agar deteksi header lebih akurat untuk file Repair
    const goldenKeys = [
      "order id",
      "no pesanan",
      "nomor invoice",
      "tokopedia invoice number",
      "status",
    ];

    // HEADER DETECTION
    workbook.eachSheet((sheet) => {
      const limit = 20;
      for (let r = 1; r <= limit; r++) {
        const row = sheet.getRow(r);
        let currentMap = {};
        let score = 0;
        row.eachCell((cell, colNumber) => {
          const rawVal = this._getCellValue(cell);
          const norm = this._normalizeHeaderClean(rawVal);
          if (!norm) return;
          currentMap[norm] = colNumber;
          if (this.mapper.knownColumns.includes(norm)) score++;
          if (goldenKeys.includes(norm)) score += 5;
        });
        if (score > maxScore) {
          maxScore = score;
          bestSheet = sheet;
          headerRowIdx = r;
          headerMap = currentMap;
        }
      }
    });

    if (!bestSheet || maxScore < 2) throw new Error("LOW_HEADER_SCORE");
    console.log(`[TokopediaParser] ✅ Header: Row ${headerRowIdx} @ Sheet "${bestSheet.name}"`);

    const orders = new Map();
    let processedCount = 0;

    bestSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;

      const getter = (keys) => {
        for (const k of keys) {
          const normK = this._normalizeHeaderClean(k);
          const colIdx = headerMap[normK];
          if (colIdx) return this._getCellValue(row.getCell(colIdx));
        }
        return "";
      };

      this._processRow(getter, orders, rowNumber);
      processedCount++;
    });

    if (processedCount === 0) throw new Error("FORCE_SANITIZE");
    return { orders, headerRowIdx };
  }

  _processRow(getter, orders, rowNumber) {
    let data = this.mapper.extract(getter);

    // --- [DEBUGGER START] ---
    // Kita log apa yang dibaca parser dari kolom Status
    const debugRawStatus = getter(["order status", "status pesanan", "status"]);
    const debugInvoice = data?.invoiceId || "No ID";
    if (!data || !data.invoiceId) {
      // Hanya log baris kosong jika perlu
    } else {
      // Uncomment baris bawah ini jika ingin melihat log per baris
      // console.log(`[DEBUG Row ${rowNumber}] ID: ${debugInvoice} | Raw Status: "${debugRawStatus}"`);
    }
    // --- [DEBUGGER END] ---

    if (!data || !data.invoiceId) {
      const fallbackId = getter(["order id", "no pesanan"]);
      if (fallbackId && fallbackId.includes("Platform unique")) return;
      const hasContent = this.mapper.knownColumns.some((col) => !!getter([col]));
      if (!hasContent) return;
    }

    if (!data || !data.invoiceId) {
      this.stats.failed++;
      this.auditLog.push({
        row: rowNumber,
        sku: "UNKNOWN",
        message: "GAGAL: Invoice ID tidak ditemukan di baris ini.",
      });
      return;
    }

    if (!data.sku) {
      data.sku = "MISSING-SKU";
      this.auditLog.push({
        row: rowNumber,
        sku: "MISSING-SKU",
        message: "WARNING: SKU Kosong. Menggunakan 'MISSING-SKU'.",
      });
    }

    this.stats.totalRows++;

    const status = this.mapper.getStatus(getter);

    // Ambil string status asli (termasuk kolom 'status' dari file repair)
    const rawStatus = getter(["order status", "status pesanan", "status"]);

    // [FIX] Mengapa status kosong di file repair?
    // Karena sebelumnya kita tidak menyimpan 'rawStatus' ke dalam objek auditLog ini.
    // Controller membaca e.status, tapi e.status undefined.

    if (status === "IGNORE") {
      this.stats.skippedStatus++;

      // DEBUG LOG KHUSUS SKIP
      console.log(`[SKIP Row ${rowNumber}] Raw Status terbaca: "${rawStatus}"`);

      this.auditLog.push({
        row: rowNumber,
        invoiceId: data.invoiceId, // Pastikan field ini ada
        customer: data.customer, // Pastikan field ini ada
        sku: data.sku,
        qty: data.qty,
        status: rawStatus, // <--- [CRITICAL FIX] Simpan status asli agar muncul di Excel Repair berikutnya
        message: `SKIPPED: Status pesanan '${rawStatus}' tidak diproses.`,
      });
      return;
    }

    if (!orders.has(data.invoiceId)) {
      orders.set(data.invoiceId, { ...data, status, items: [] });
    }

    orders.get(data.invoiceId).items.push({
      sku: data.sku,
      qty: data.qty || 1,
      status: status,
      locationId: null,
      row: rowNumber,
    });

    this.stats.success++;
  }

  _getCellValue(cell) {
    let val = cell.value;
    if (val && typeof val === "object") {
      if (val.text) val = val.text;
      else if (val.richText) val = val.richText.map((t) => t.text).join("");
      else if (val.result) val = val.result;
    }
    if (val === null || val === undefined) return "";
    return String(val)
      .trim()
      .replace(/^\uFEFF/, "");
  }
}
