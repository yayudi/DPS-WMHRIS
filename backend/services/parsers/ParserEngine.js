// backend/services/ParserEngine.js
import path from "path";
import { BaseParser } from "./BaseParser.js";
import { Mappers } from "../../config/importMappers.js";

// Jika Anda masih ingin menggunakan class spesifik untuk legacy, import di sini.
// Namun, BaseParser + Mappers sudah cukup powerful untuk handle semuanya.
// import { TokopediaParser } from "./TokopediaParser.js";
// import { ShopeeParser } from "./ShopeeParser.js";
// import { OfflineParser } from "./OfflineParser.js";

export class ParserEngine {
  /**
   * @param {string} filePath - Path absolut file di server
   * @param {string} source - 'Tokopedia', 'Shopee', 'Offline', 'MassPriceUpdate', dll.
   */
  constructor(filePath, source) {
    this.filePath = filePath;
    this.source = source;
  }

  async run() {
    console.log(
      `[ParserEngine] Meminta parser untuk source: "${this.source}" | File: ${path.basename(
        this.filePath
      )}`
    );

    let mapper = null;
    let normalizedSource = (this.source || "").trim();

    // 1. Cek Mapper berdasarkan Source yang dikirim (Explicit)
    if (normalizedSource && Mappers[normalizedSource]) {
      mapper = Mappers[normalizedSource];
    }
    // 2. Fallback: Auto-detect dari nama file jika Source tidak valid/kosong
    else {
      const fileName = path.basename(this.filePath).toLowerCase();
      console.log(
        `[ParserEngine] Source '${this.source}' tidak spesifik. Mencoba auto-detect dari filename: ${fileName}`
      );

      if (fileName.includes("tokopedia")) {
        normalizedSource = "Tokopedia";
      } else if (fileName.includes("shopee")) {
        normalizedSource = "Shopee";
      } else if (
        fileName.includes("offline") ||
        fileName.includes("manual") ||
        fileName.includes("tagihan")
      ) {
        normalizedSource = "Offline";
      } else if (fileName.includes("price") || fileName.includes("harga")) {
        normalizedSource = "MassPriceUpdate";
      } else {
        // Default fallback (bisa disesuaikan)
        throw new Error(`[ParserEngine] Gagal mendeteksi tipe parser untuk file: ${fileName}`);
      }

      mapper = Mappers[normalizedSource];
      console.log(`[ParserEngine] Auto-detect result: ${normalizedSource}`);
    }

    if (!mapper) {
      throw new Error(
        `[ParserEngine] Konfigurasi Mapper tidak ditemukan untuk source: ${normalizedSource}`
      );
    }

    // 3. Instansiasi BaseParser dengan konfigurasi yang ditemukan
    // PENTING: Ambil delimiter dari mapper (Shopee pakai ';'), atau default ke koma
    const goldenKeys = mapper.knownColumns || [];
    const delimiter = mapper.csvDelimiter || ",";

    // Teruskan delimiter ke BaseParser agar pembacaan CSV akurat
    const parser = new BaseParser(this.filePath, normalizedSource, mapper, goldenKeys, delimiter);

    return await parser.run();
  }
}
