import fs from "fs/promises";

const SHEETS_API_KEY = process.env.SHEETS_API_KEY;

export function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

export async function fetchSheet(spreadsheetId, rangeName) {
  if (!SHEETS_API_KEY) {
    throw new Error("SHEETS_API_KEY tidak ditemukan di file .env");
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rangeName}?key=${SHEETS_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengambil data sheet: ${response.statusText}`);
  }
  const data = await response.json();
  const values = data.values || [];
  if (values.length < 2) return [];

  const headers = values[0];
  return values.slice(1).map((row) => {
    const rowObject = {};
    headers.forEach((header, index) => {
      rowObject[header] = row[index] || "";
    });
    return rowObject;
  });
}

export function cleanHarga(value) {
  const num = typeof value === "string" ? parseInt(value.replace(/[^\d]/g, ""), 10) : Number(value);
  return isNaN(num) ? 0 : num;
}

export function cleanQty(value) {
  if (!value || typeof value !== "string" || !value.trim()) return 0;
  const standardFormat = value.replace(/\./g, "").replace(/,/g, ".");
  const num = parseFloat(standardFormat);
  return isNaN(num) ? 0 : num;
}
