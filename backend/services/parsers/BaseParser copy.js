// backend\services\parsers\BaseParser.js
import path from "path";
import ExcelJS from "exceljs";
import { sanitizeExcel } from "../../utils/ExcelSanitizer.js";

export class BaseParser {
  constructor(filePath, source, mapper, goldenKeys, csvDelimiter = ",") {
    this.filePath = filePath;
    this.source = source;
    this.mapper = mapper;
    this.goldenKeys = goldenKeys;
    this.csvDelimiter = csvDelimiter;

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
    console.log(`\n[${this.source}Parser] 🚀 START: ${path.basename(this.filePath)}`);
    const workbook = new ExcelJS.Workbook();

    try {
      const ext = path.extname(this.filePath).toLowerCase();

      if (ext === ".csv") {
        console.log(`[DEBUG] Mode CSV Aktif. Delimiter: '${this.csvDelimiter}'`);

        await workbook.csv.readFile(this.filePath, {
          parserOptions: {
            delimiter: this.csvDelimiter,
            quote: '"',
            trim: true,

            cast: (value, context) => {
              // 1. Jika value kosong, return string kosong
              if (value === null || value === undefined) return "";

              // 2. Jika header, biarkan apa adanya
              if (context.header) return value;

              // Jangan biarkan library mikir ini angka.
              // Langsung return raw string-nya.
              return String(value);
            },

            // Matikan deteksi tanggal juga biar ID yang mirip tanggal gak rusak
            cast_date: false,
          },
        });
      } else {
        await workbook.xlsx.readFile(this.filePath);
      }

      const result = await this._processWorkbookData(workbook);

      console.log(`[${this.source}Parser] 🏁 FINISH. Stats:`, this.stats);
      return {
        orders: result.orders,
        stats: this.stats,
        errors: this.auditLog,
        headerRowIndex: result.headerRowIdx,
      };
    } catch (error) {
      console.error(`[DEBUG] Error di run():`, error);

      const isRescueable =
        error.message === "LOW_HEADER_SCORE" ||
        error.message === "FORCE_SANITIZE" ||
        error.message.includes("end of central directory");

      if (isRescueable && !this.sanitized) {
        console.warn(
          `[${this.source}Parser] 🚑 File Error (${error.message}). Mencoba Sanitasi...`
        );
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

    const allGoldenKeys = [...this.goldenKeys, "status"];

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
          if (allGoldenKeys.includes(norm)) score += 5;
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
      console.error(`[${this.source}Parser] ❌ Gagal Header. Max Score: ${maxScore}`);
      throw new Error("LOW_HEADER_SCORE");
    }

    console.log(
      `[${this.source}Parser] ✅ Header: Row ${headerRowIdx} @ Sheet "${bestSheet.name}"`
    );

    const orders = new Map();
    let processedCount = 0;

    bestSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIdx) return;

      // 🔍 CCTV 2: CELL VALUE GETTER
      // Kita intip apa yang diambil saat kita minta kolom "Order ID"
      const getter = (keys) => {
        for (const k of keys) {
          const normK = this._normalizeHeaderClean(k);
          const colIdx = headerMap[normK];
          if (colIdx) {
            const cell = row.getCell(colIdx);
            const val = this._getCellValue(cell);

            // Log HANYA untuk baris pertama data (header+1) dan jika key mirip Order ID
            if (rowNumber === headerRowIdx + 1 && (k.includes("order") || k.includes("pesanan"))) {
              console.log(
                `[🔍 CCTV 2 - GETTER] Key: "${k}" -> Col: ${colIdx} -> Raw Cell Value:`,
                cell.value,
                `(Type: ${typeof cell.value}) -> Clean: "${val}"`
              );
            }
            return val;
          }
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

    // 🔍 CCTV 3: RESULT EXTRACTION
    // Kita intip hasil akhir objek data yang terbentuk
    if (this.stats.totalRows === 0) {
      // Cuma log baris data pertama
      console.log(
        `[🔍 CCTV 3 - EXTRACTED DATA] Baris ${rowNumber}:`,
        JSON.stringify(data, null, 2)
      );
    }

    // Validasi Dasar
    if (!data || !data.invoiceId) {
      const fallbackId = getter(["order id", "no pesanan", "no. pesanan", "nomor tagihan"]);
      if (
        fallbackId &&
        (fallbackId.includes("Platform unique") || fallbackId.includes("unique order"))
      )
        return;

      const hasContent = this.mapper.knownColumns.some((col) => !!getter([col]));
      if (hasContent) {
        this.stats.failed++;
        this.auditLog.push({
          row: rowNumber,
          sku: "UNKNOWN",
          message: "Gagal ambil ID Pesanan/Invoice",
        });
      }
      return;
    }

    if (!data.sku) {
      data.sku = "MISSING-SKU";
      this.auditLog.push({
        row: rowNumber,
        sku: "MISSING-SKU",
        message: "SKU Kosong/Tidak Terbaca",
      });
    }

    this.stats.totalRows++;

    const status = this.mapper.getStatus(getter);
    const rawStatus = getter(["status", "order status", "status pesanan", "status transaksi"]);

    if (status === "IGNORE") {
      this.stats.skippedStatus++;
      this.auditLog.push({
        row: rowNumber,
        invoiceId: data.invoiceId,
        customer: data.customer,
        sku: data.sku,
        qty: data.qty,
        status: rawStatus || "-",
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

    // Handle Object (Rich Text / Formula)
    if (val && typeof val === "object") {
      if (val.text) val = val.text;
      else if (val.richText) val = val.richText.map((t) => t.text).join("");
      else if (val.result) val = val.result;
    }

    // Handle Null/Undefined
    if (val === null || val === undefined) return "";

    // 🛑 PAKSA STRING (Explicit String Conversion)
    // Ini pertahanan terakhir jika di atas gagal
    return String(val)
      .trim()
      .replace(/^\uFEFF/, "");
  }
}
