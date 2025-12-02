// backend\utils\importHelpers.js
/**
 * Membersihkan header dari simbol aneh dan normalisasi.
 * Contoh: "*Nomor Tagihan" -> "nomor tagihan"
 */
export const normalizeHeader = (header) => {
  if (!header) return "";
  return header
    .toString()
    .replace(/^\uFEFF/, "") // Hapus BOM
    .replace(/\*/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

/**
 * Membaca cell Excel dengan aman (handle Rich Text, Formula, Date).
 */
export const getSafeStr = (cell) => {
  if (cell === null || cell === undefined) return "";

  // Handle ExcelJS objects
  if (typeof cell === "object") {
    if (cell.richText)
      return cell.richText
        .map((p) => p.text)
        .join("")
        .trim();
    if (cell.result !== undefined) return cell.result.toString().trim();
    if (cell.text) return cell.text.toString().trim();
    if (cell instanceof Date) return cell.toISOString();
  }

  return cell.toString().trim();
};
