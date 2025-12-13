// backend\services\parsers\BaseParser.js
import path from "path";
import fs from "fs"; // Tambahkan import fs
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
        console.log(`[DEBUG] Mode CSV Manual Read (fs). Delimiter: '${this.csvDelimiter}'`);

        const fileContent = fs.readFileSync(this.filePath, "utf8");
        const sheet = workbook.addWorksheet("Sheet1");

        // [FIX MULTILINE CSV]
        // Split awal berdasarkan newline
        const rawLines = fileContent.split(/\r?\n/);
        const mergedLines = [];
        let buffer = "";
        let inQuote = false;

        // Algoritma Penyeimbang Tanda Kutip
        for (let i = 0; i < rawLines.length; i++) {
          const line = rawLines[i];

          // Hitung jumlah tanda kutip di baris ini
          const quoteCount = (line.match(/"/g) || []).length;

          // Jika buffer tidak kosong, tambahkan newline yang hilang karena split sebelumnya
          if (inQuote) {
            buffer += "\n" + line;
          } else {
            buffer = line;
          }

          // Jika jumlah kutip ganjil, toggle status inQuote (Masuk/Keluar kutip)
          // Ganjil + Ganjil = Genap (Keluar)
          // Genap + Ganjil = Ganjil (Masuk)
          if (quoteCount % 2 === 1) {
            inQuote = !inQuote;
          }

          // Jika sudah seimbang (tidak di dalam kutip), ini adalah satu baris utuh
          if (!inQuote) {
            if (buffer.trim()) {
              // Skip baris kosong murni
              mergedLines.push(buffer);
            }
            buffer = "";
          }
        }

        // Proses baris yang sudah digabung dengan benar
        mergedLines.forEach((line) => {
          // Regex untuk split CSV tapi mengabaikan delimiter dalam kutip
          const regex = new RegExp(`\\s*${this.csvDelimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)\\s*`);

          const rowValues = line.split(regex).map((val) => {
            let clean = val.trim();
            if (clean.startsWith('"') && clean.endsWith('"')) {
              clean = clean.slice(1, -1);
            }
            return clean.replace(/""/g, '"');
          });

          sheet.addRow(rowValues);
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
      // [FIX] Handle jika total baris < limit
      const maxRow = Math.min(sheet.rowCount, limit);

      for (let r = 1; r <= maxRow; r++) {
        const row = sheet.getRow(r);
        let currentMap = {};
        let score = 0;

        // Optimasi: Cek hanya jika row punya value
        if (!row.hasValues) continue;

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

      const getter = (keys) => {
        for (const k of keys) {
          const normK = this._normalizeHeaderClean(k);
          const colIdx = headerMap[normK];
          if (colIdx) {
            const cell = row.getCell(colIdx);
            return this._getCellValue(cell);
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

    if (!data || !data.invoiceId) {
      const fallbackId = getter([
        "order id",
        "no pesanan",
        "no. pesanan",
        "nomor tagihan",
        "*nomor tagihan",
      ]);
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
      returnedQty: data.returnedQty || 0,
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
