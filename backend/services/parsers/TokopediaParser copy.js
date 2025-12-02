// backend\services\TokopediaParser.js
import path from "path";
import ExcelJS from "exceljs";
import { Mappers } from "../../config/importMappers.js";
import { normalizeHeader } from "../../utils/importHelpers.js";
import { sanitizeExcel } from "../../utils/ExcelSanitizer.js";

export class TokopediaParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.source = "Tokopedia";
    this.mapper = Mappers["Tokopedia"];

    this.stats = { totalRows: 0, success: 0, failed: 0, skippedStatus: 0 };
    this.auditLog = []; // Menyimpan detail error
    this.sanitized = false;
  }

  async run() {
    console.log(`[TokopediaParser] 🚀 Parser started for ${path.basename(this.filePath)}`);

    const workbook = new ExcelJS.Workbook();
    const ext = path.extname(this.filePath).toLowerCase();

    try {
      if (ext === ".csv") {
        try {
          // [FIX PRECISION]: Force Text Parsing
          await workbook.csv.readFile(this.filePath, {
            parserOptions: {
              delimiter: ",",
              quote: '"',
              ltrim: true,
              rtrim: true,
              relax_column_count: true,
              // Opsional untuk beberapa versi parser: matikan auto-cast
              cast: false,
              // Map function untuk memaksa return string
              map: (value) => value,
            },
            // Redudansi: Taruh map di luar juga
            map: (value) => {
              return value;
            },
          });
        } catch (csvError) {
          // FALLBACK: Jika gagal baca text, coba mode XLSX
          if (this.sanitized) {
            console.warn(`[TokopediaParser] ⚠️ Gagal baca CSV Text. Mencoba mode Binary (XLSX)...`);
            await workbook.xlsx.readFile(this.filePath);
          } else {
            throw csvError;
          }
        }
      } else {
        await workbook.xlsx.readFile(this.filePath);
      }

      const result = await this._processWorkbookData(workbook);
      this._printReport();

      return {
        orders: result.orders,
        stats: this.stats,
        errors: this.auditLog,
        headerRowIndex: result.headerRowIdx,
      };
    } catch (error) {
      // --- SELF-HEALING / SANITASI OTOMATIS ---
      const isStructureError =
        error.message === "LOW_HEADER_SCORE" || error.message === "FORCE_SANITIZE";

      if (isStructureError && !this.sanitized) {
        console.warn(
          `[TokopediaParser] 🚑 File bermasalah (${error.message}). Memulai Sanitasi Otomatis...`
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
    // HEADER DETECTION
    let bestSheet = null;
    let headerMap = {};
    let headerRowIdx = 0;
    let maxScore = 0;

    const goldenKeys = ["order id", "no pesanan", "nomor invoice", "tokopedia invoice number"];

    const scanSheet = (sheet) => {
      const limit = Math.min(sheet.rowCount, 5);
      for (let r = 1; r <= limit; r++) {
        const row = sheet.getRow(r);
        if (!row.hasValues) continue;

        let currentMap = {};
        let score = 0;

        row.eachCell((cell, colNumber) => {
          const val = this._getCellValue(cell);
          const norm = normalizeHeader(val);
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
    };

    workbook.eachSheet(scanSheet);

    if (!bestSheet || maxScore < 2) {
      throw new Error("LOW_HEADER_SCORE");
    }

    // DATA EXTRACTION
    const orders = new Map();
    const totalRows = bestSheet.rowCount;

    for (let i = headerRowIdx + 1; i <= totalRows; i++) {
      const row = bestSheet.getRow(i);
      if (!row.hasValues) continue;

      const getter = (keys) => {
        for (const k of keys) {
          const normK = normalizeHeader(k);
          const colIdx = headerMap[normK];
          if (colIdx) {
            return this._getCellValue(row.getCell(colIdx));
          }
        }
        return "";
      };

      this._processRow(getter, orders, i);
    }

    return { orders, headerRowIdx };
  }

  _processRow(getter, orders, rowNumber) {
    const potentialHeader = getter(["invoiceId", "order id", "no pesanan"]);
    if (potentialHeader && potentialHeader.toLowerCase().includes("order id")) {
      return;
    }

    let data = this.mapper.extract(getter);
    const orderId = getter(["order id", "no pesanan", "order_id"]);

    // Ambil Data Penting untuk Error Reporting
    const skuId = getter(["sku id", "product id", "marketplace sku"]) || "";
    const sellerSku = getter(["seller sku", "nomor sku", "sku"]) || "";

    // --- RESCUE LOGIC ---
    // Jika invoiceId kosong (umum di file Tokopedia), gunakan Order ID
    if (!data || !data.invoiceId) {
      if (orderId) {
        if (!data) {
          // [UPDATED] Manual Object Construction
          // Prioritaskan "Seller SKU". Jika kosong, gunakan "UNKNOWN-SKU".
          // Kita tidak menggunakan skuId sebagai 'sku' utama agar sistem validasi tetap konsisten (mencari Seller SKU di DB)
          data = {
            invoiceId: orderId,
            sku: sellerSku || "UNKNOWN-SKU",
            qty: getter(["quantity", "jumlah", "qty"]) || 1,
            recipient: getter(["recipient", "penerima", "nama penerima"]),
          };
        } else {
          data.invoiceId = orderId;
        }
      }
    }

    if (!data) {
      const foundData = [];
      this.mapper.knownColumns.forEach((col) => {
        const val = getter([col]);
        if (val && val.trim() !== "") {
          foundData.push(`${col}: "${val}"`);
        }
      });

      if (foundData.length === 0) return;

      if (!this.sanitized) {
        throw new Error("FORCE_SANITIZE");
      }

      this.stats.failed++;
      const snippet = foundData.join(", ").substring(0, 200);
      this.auditLog.push({
        row: rowNumber,
        sku: "UNKNOWN",
        message: `Struktur Baris Invalid. Data terbaca: [${snippet}]`,
      });
      return;
    }

    this.stats.totalRows++;

    if (!data.invoiceId) {
      this.stats.failed++;
      this.auditLog.push({
        row: rowNumber,
        sku: data.sku || "UNKNOWN",
        message: "Order ID / Invoice ID Kosong",
      });
      return;
    }

    const status = this.mapper.getStatus(getter);
    if (status === "IGNORE") {
      this.stats.skippedStatus++;
      return;
    }

    // Grouping Item ke Invoice
    if (!orders.has(data.invoiceId)) {
      // [UPDATE] Hapus 'row' dari level Order karena 1 Order bisa punya banyak Item (Row berbeda)
      orders.set(data.invoiceId, { ...data, status, items: [] });
    }

    // [CRITICAL UPDATE] Simpan 'row' dan 'skuId' (Marketplace SKU) di level ITEM
    // Ini memungkinkan kita melacak baris spesifik mana yang error, bukan cuma baris pertama order.
    orders.get(data.invoiceId).items.push({
      sku: data.sku || "NO-SKU", // Ini Seller SKU (yang dicocokkan ke DB)
      marketplace_sku: skuId, // Ini Marketplace SKU (untuk referensi Error)
      qty: data.qty || 1,
      status: status,
      locationId: null,
      row: rowNumber, // Simpan Nomor Baris Asli
    });

    this.stats.success++;
  }

  _getCellValue(cell) {
    let val = cell.value;
    if (val === null && cell.master && cell.master.address !== cell.address)
      val = cell.master.value;

    if (typeof val === "object" && val !== null) {
      if (val.text) return val.text;
      if (val.richText) return val.richText.map((t) => t.text).join("");
      if (val.result) return String(val.result);
      return JSON.stringify(val);
    }

    if (val === null || val === undefined) return "";
    return String(val)
      .trim()
      .replace(/^\uFEFF/, "");
  }

  _printReport() {}
}
