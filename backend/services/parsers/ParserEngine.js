// backend/services/ParserEngine.js
import { TokopediaParser } from "./TokopediaParser.js";
import { ShopeeParser } from "./ShopeeParser.js";
import { OfflineParser } from "./OfflineParser.js"; // [NEW] Import OfflineParser
import path from "path";

export class ParserEngine {
  /**
   * Factory method untuk menjalankan parser yang sesuai
   * @param {string} filePath - Path absolut file
   * @param {string} source - 'Tokopedia', 'Shopee', 'Offline'
   */
  async run(filePath, source) {
    let parser;
    const normalizedSource = (source || "").toLowerCase();

    console.log(`[ParserEngine] Meminta parser untuk source: "${source}"`);

    switch (normalizedSource) {
      case "tokopedia":
        parser = new TokopediaParser(filePath);
        break;

      case "shopee":
        parser = new ShopeeParser(filePath);
        break;

      case "offline":
        // [NEW] Aktifkan case Offline
        parser = new OfflineParser(filePath);
        break;

      default:
        // Fallback cerdas: Coba tebak dari nama file
        const fileName = path.basename(filePath).toLowerCase();

        if (fileName.includes("tokopedia")) {
          console.log("[ParserEngine] Auto-detect: Menggunakan TokopediaParser");
          parser = new TokopediaParser(filePath);
        } else if (fileName.includes("shopee")) {
          console.log("[ParserEngine] Auto-detect: Menggunakan ShopeeParser");
          parser = new ShopeeParser(filePath);
        } else if (
          fileName.includes("tagihan") ||
          fileName.includes("offline") ||
          fileName.includes("manual")
        ) {
          // [NEW] Auto-detect Offline
          console.log("[ParserEngine] Auto-detect: Menggunakan OfflineParser");
          parser = new OfflineParser(filePath);
        } else {
          // Default fallback terakhir ke Tokopedia jika format tidak jelas (opsional, atau throw error)
          throw new Error(`Source '${source}' tidak dikenali dan auto-detect gagal.`);
        }
    }

    // Jalankan Parser terpilih
    return await parser.run();
  }
}
