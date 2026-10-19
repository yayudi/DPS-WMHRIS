import ExcelJS from "exceljs";
import * as productRepo from "../repositories/productRepository.js";
import * as mediaRepo from "../repositories/mediaRepository.js";
import Logger from "../utils/logger.js";
import { logChange } from "./productService.js";

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} filePath
 * @param {number|string} userId
 */
export const processMediaLinkImport = async (connection, filePath, userId) => {
  const result = { success: false, successCount: 0, failCount: 0, errors: [] };

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("File Excel tidak memiliki sheet.");

    let headerRowIndex = -1;
    let skuCol = -1;
    let titleCol = -1;

    worksheet.eachRow((row, rowNumber) => {
      if (headerRowIndex !== -1) return; // already found
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "")
          .trim()
          .toLowerCase();
        if (val === "sku") skuCol = colNumber;
        if (
          val === "image_title" ||
          val === "image_filename" ||
          val === "image" ||
          val === "media_title" ||
          val === "image_url" ||
          val === "image_link" ||
          val === "url"
        )
          titleCol = colNumber;
      });
      if (skuCol !== -1 && titleCol !== -1) {
        headerRowIndex = rowNumber;
      }
    });

    if (headerRowIndex === -1) {
      throw new Error("Format kolom tidak sesuai. Pastikan ada kolom 'SKU' dan 'Image_URL' (atau link).");
    }

    const rowsToProcess = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;

      const skuVal = row.getCell(skuCol).value;
      const sku = String((skuVal && typeof skuVal === 'object' ? skuVal.text : skuVal) || "").trim();
      
      const imgVal = row.getCell(titleCol).value;
      const imageRef = String((imgVal && typeof imgVal === 'object' ? (imgVal.hyperlink || imgVal.text) : imgVal) || "").trim();

      if (sku && imageRef) {
        rowsToProcess.push({ sku, imageRef, row: rowNumber });
      } else {
        result.errors.push({
          row: rowNumber,
          message: "Baris dilewati karena SKU atau Link URL kosong",
        });
      }
    });

    for (const item of rowsToProcess) {
      try {
        const productId = await productRepo.getIdBySku(connection, item.sku);
        if (!productId) {
          result.errors.push({
            row: item.row,
            message: `Produk dengan SKU ${item.sku} tidak ditemukan`,
          });
          result.failCount++;
          continue;
        }

        // Ekstrak nama file dari URL (jika berupa URL lengkap)
        let searchPath = item.imageRef;
        if (searchPath.includes('/')) {
          const parts = searchPath.split('/');
          searchPath = parts[parts.length - 1];
        }
        // Hapus query string jika ada (?dl=1, #hash)
        searchPath = searchPath.split('?')[0].split('#')[0];

        // Cari image berdasar path (mencocokkan nama file persis di DB, baik main maupun thumb)
        const images = await mediaRepo.findMediaByPath(connection, searchPath);

        if (images.length === 0) {
          result.errors.push({
            row: item.row,
            message: `Media dengan URL/Link mengandung '${searchPath}' tidak ditemukan`,
          });
          result.failCount++;
          continue;
        }

        const mediaId = images[0].id;

        // Cek apakah sudah dilink
        const isLinked = await productRepo.isProductMediaLinked(connection, productId, mediaId);

        if (!isLinked) {
          await productRepo.linkMedia(connection, productId, [mediaId]);
          await logChange(
            connection,
            productId,
            userId,
            "UPDATE",
            "images",
            "Bulk Link Media via Excel",
            `Media ID ${mediaId} linked`,
          );
        }

        result.successCount++;
      } catch (e) {
        result.errors.push({ row: item.row, message: e.message });
        result.failCount++;
      }
    }

    result.success = true;
    result.headerRowIndex = headerRowIndex;
  } catch (error) {
    Logger.error("Failed processMediaLinkImport", error, "MEDIA_IMPORT");
    result.errors.push({ row: 0, message: error.message });
  }

  return result;
};
