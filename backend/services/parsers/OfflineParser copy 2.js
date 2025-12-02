// backend\services\parsers\OfflineParser.js
import path from "path";
import ExcelJS from "exceljs";
import { Mappers } from "../../config/importMappers.js";
import { sanitizeExcel } from "../../utils/ExcelSanitizer.js";

export class OfflineParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.source = "Offline";
    this.mapper = Mappers["Offline"];

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
    console.log(`\n[OfflineParser] 🚀 START: ${path.basename(this.filePath)}`);
    const workbook = new ExcelJS.Workbook();

    try {
      const ext = path.extname(this.filePath).toLowerCase();
      if (ext === ".csv") {
        await workbook.csv.readFile(this.filePath, {
          parserOptions: { delimiter: ",", quote: '"', trim: true },
        });
      } else {
        await workbook.xlsx.readFile(this.filePath);
      }

      const result = await this._processWorkbookData(workbook);

      console.log(`[OfflineParser] 🏁 FINISH. Stats:`, this.stats);
      return {
        orders: result.orders,
        stats: this.stats,
        errors: this.auditLog,
        headerRowIndex: result.headerRowIdx,
      };
    } catch (error) {
      const isRescueable =
        error.message === "LOW_HEADER_SCORE" || error.message === "FORCE_SANITIZE";

      if (isRescueable && !this.sanitized) {
        console.warn(`[OfflineParser] 🚑 File Error (${error.message}). Mencoba Sanitasi...`);
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

    // [UPDATE] Tambahkan "status" ke Golden Keys
    const goldenKeys = [
      "nomor tagihan",
      "no tagihan",
      "invoice no",
      "kode produk",
      "sku",
      "jumlah produk",
      "qty",
      "tanggal",
      "date",
      "status", // <--- PENTING UNTUK REPAIR FILE
    ];

    // 1. HEADER DETECTION
    workbook.eachSheet((sheet) => {
      const limit = 25;
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

    if (!bestSheet || maxScore < 2) {
      console.error(`[OfflineParser] ❌ Gagal Header. Max Score: ${maxScore}`);
      throw new Error("LOW_HEADER_SCORE");
    }

    console.log(`[OfflineParser] ✅ Header: Row ${headerRowIdx} @ Sheet "${bestSheet.name}"`);

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

    if (!data || !data.invoiceId) {
      const hasContent = this.mapper.knownColumns.some((col) => !!getter([col]));
      if (hasContent) {
        this.stats.failed++;
        this.auditLog.push({
          row: rowNumber,
          sku: "UNKNOWN",
          message: "Gagal ambil Nomor Tagihan",
        });
      }
      return;
    }

    if (!data.sku) {
      this.auditLog.push({
        row: rowNumber,
        sku: "MISSING-SKU",
        message: "Kode Produk/SKU Kosong",
      });
      data.sku = "MISSING-SKU";
    }

    this.stats.totalRows++;
    const status = this.mapper.getStatus(getter);

    // [UPDATE] Ambil Status Asli
    const rawStatus = getter(["status"]);

    if (status === "IGNORE") {
      this.stats.skippedStatus++;
      this.auditLog.push({
        row: rowNumber,
        // 👇 KIRIM DATA LENGKAP
        invoiceId: data.invoiceId,
        customer: data.customer,
        sku: data.sku,
        qty: data.qty,
        status: rawStatus, // <--- [FIX] Simpan status asli
        message: `SKIPPED: Status '${rawStatus}' tidak diproses.`,
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
