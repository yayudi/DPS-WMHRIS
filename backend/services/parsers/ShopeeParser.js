// backend\services\parsers\ShopeeParser.js
import { Mappers } from "../../config/importMappers.js";
import { BaseParser } from "./BaseParser.js";

export class ShopeeParser extends BaseParser {
  constructor(filePath) {
    // Config Shopee: Delimiter Titik Koma (;) untuk CSV
    super(
      filePath,
      "Shopee",
      Mappers["Shopee"],
      ["no pesanan", "order id", "nomor referensi sku", "sku reference no", "status pesanan"],
      ";"
    );
  }
}
