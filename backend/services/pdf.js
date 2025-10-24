import fs from "fs/promises";
// Menggunakan createRequire untuk menjembatani sistem modul ESM dan CommonJS
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Impor library dan dependensinya menggunakan metode CommonJS (require) yang andal
const { PDFParse } = require("pdf-parse");
const { CanvasFactory } = require("pdf-parse/worker");

/**
 * Membaca file PDF dari path yang diberikan dan mengekstrak konten teksnya
 * menggunakan API v2 dari pdf-parse.
 * @param {string} filePath - Path ke file PDF.
 * @returns {Promise<string>} - Konten teks dari file PDF.
 */
export async function parsePdf(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);

    // Buat instance parser, berikan data buffer dan CanvasFactory saat konstruksi
    const parser = new PDFParse({ data: dataBuffer, CanvasFactory });

    // Panggil metode getText() yang mengembalikan promise berisi hasil
    const result = await parser.getText();

    // Kembalikan konten teksnya
    return result.text;
  } catch (error) {
    console.error("Gagal membaca atau mem-parsing file PDF:", error);
    throw new Error("Gagal membaca konten dari file PDF.");
  }
}
