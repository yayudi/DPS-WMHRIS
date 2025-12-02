import path from "path";
import ExcelJS from "exceljs";
import { Mappers } from "../../config/importMappers.js";
import { sanitizeExcel } from "../../utils/ExcelSanitizer.js";

export class ShopeeParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.source = "Shopee";
    this.mapper = Mappers["Shopee"];

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
    console.log(`\n[ShopeeParser] 🚀 START: ${path.basename(this.filePath)}`);
    const workbook = new ExcelJS.Workbook();

    try {
      const ext = path.extname(this.filePath).toLowerCase();
      if (ext === ".csv") {
        await workbook.csv.readFile(this.filePath, {
          parserOptions: { delimiter: ";", quote: '"', trim: true },
        });
      } else {
        await workbook.xlsx.readFile(this.filePath);
      }

      const result = await this._processWorkbookData(workbook);

      console.log(`[ShopeeParser] 🏁 FINISH. Stats:`, this.stats);
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
        console.warn(`[ShopeeParser] 🚑 File Error (${error.message}). Mencoba Sanitasi...`);
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

    // [UPDATE] Tambahkan "status" agar file Repair terbaca
    const goldenKeys = [
      "no pesanan",
      "order id",
      "nomor referensi sku",
      "sku reference no",
      "status pesanan",
      "status", // <--- PENTING UNTUK REPAIR FILE
    ];

    // 1. HEADER DETECTION
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

    if (!bestSheet || maxScore < 2) {
      console.error(`[ShopeeParser] ❌ Gagal Header. Max Score: ${maxScore}`);
      throw new Error("LOW_HEADER_SCORE");
    }

    console.log(`[ShopeeParser] ✅ Header: Row ${headerRowIdx} @ Sheet "${bestSheet.name}"`);

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

    // Validasi Dasar
    if (!data || !data.invoiceId) {
      const hasContent = this.mapper.knownColumns.some((col) => !!getter([col]));
      if (hasContent) {
        this.stats.failed++;
        this.auditLog.push({ row: rowNumber, sku: "UNKNOWN", message: "Gagal ambil No. Pesanan" });
      }
      return;
    }

    if (!data.sku) {
      data.sku = "MISSING-SKU";
      this.auditLog.push({
        row: rowNumber,
        sku: "MISSING-SKU",
        message: "SKU Kosong (Pastikan 'Nomor Referensi SKU' atau 'SKU Induk' terisi)",
      });
    }

    this.stats.totalRows++;
    const status = this.mapper.getStatus(getter);

    // [UPDATE] Ambil status asli
    const rawStatus = getter(["status pesanan", "order status", "status"]);

    if (status === "IGNORE") {
      this.stats.skippedStatus++;
      this.auditLog.push({
        row: rowNumber,
        invoiceId: data.invoiceId,
        customer: data.customer,
        sku: data.sku,
        qty: data.qty,
        status: rawStatus, // <--- [FIX] Simpan status asli
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
