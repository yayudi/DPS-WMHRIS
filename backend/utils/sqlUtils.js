// backend/utils/sqlUtils.js
import { parseJsonSafe } from "./jsonUtils.js";

/**
 * Membangun klausul SQL WHERE untuk filter TriState (include / exclude / single value / array)
 * dan secara aman memasukkan parameternya ke queryParams (parameterized query).
 *
 * @param {string} column - Nama kolom SQL (misal: "l.building", "sm.movement_type", "action")
 * @param {any} filterValue - Nilai filter (objek TriState { include, exclude }, array, string JSON, atau nilai tunggal)
 * @param {Array} queryParams - Array parameter query MySQL yang akan diisi
 * @returns {Array<string>} Array klausul SQL (misal: ["field IN (?)", "field NOT IN (?)"] atau ["field = ?"])
 */
export const buildTriStateWhere = (column, filterValue, queryParams) => {
  const clauses = [];
  if (filterValue === null || filterValue === undefined || filterValue === "") {
    return clauses;
  }

  if (typeof filterValue === "string" && (filterValue.toLowerCase() === "all" || filterValue.trim() === "")) {
    return clauses;
  }

  // Parse JSON jika filterValue dikirim sebagai stringified JSON
  const parsed = parseJsonSafe(filterValue, filterValue);

  if (Array.isArray(parsed)) {
    if (parsed.length > 0) {
      clauses.push(`${column} IN (?)`);
      queryParams.push(parsed);
    }
  } else if (parsed && typeof parsed === "object") {
    const inc = parsed.include
      ? Array.isArray(parsed.include)
        ? parsed.include
        : Object.values(parsed.include)
      : [];
    if (inc.length > 0) {
      clauses.push(`${column} IN (?)`);
      queryParams.push(inc);
    }

    const exc = parsed.exclude
      ? Array.isArray(parsed.exclude)
        ? parsed.exclude
        : Object.values(parsed.exclude)
      : [];
    if (exc.length > 0) {
      clauses.push(`${column} NOT IN (?)`);
      queryParams.push(exc);
    }
  } else if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (trimmed !== "" && trimmed.toLowerCase() !== "all") {
      clauses.push(`${column} = ?`);
      queryParams.push(trimmed);
    }
  } else if (typeof parsed === "number") {
    clauses.push(`${column} = ?`);
    queryParams.push(parsed);
  }

  return clauses;
};
