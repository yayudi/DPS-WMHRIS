// backend\services\parsers\TokopediaParser.js
import { Mappers } from "../../config/importMappers.js";
import { BaseParser } from "./BaseParser.js";

export class TokopediaParser extends BaseParser {
  constructor(filePath) {
    // Config Tokopedia: Delimiter Koma (,)
    super(
      filePath,
      "Tokopedia",
      Mappers["Tokopedia"],
      ["order id", "nomor invoice", "no pesanan", "tokopedia invoice number"],
      ","
    );
  }
}
