// backend\services\parsers\OfflineParser.js
import { Mappers } from "../../config/importMappers.js";
import { BaseParser } from "./BaseParser.js";

export class OfflineParser extends BaseParser {
  constructor(filePath) {
    // Config Offline: Delimiter Koma (,)
    super(
      filePath,
      "Offline",
      Mappers["Offline"],
      ["nomor tagihan", "no tagihan", "kode produk", "sku", "tanggal"],
      ","
    );
  }
}
