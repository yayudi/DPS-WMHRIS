// backend/controllers/mediaController.js
import catchAsync from "../utils/catchAsync.js";
import * as mediaRepo from "../repositories/mediaRepository.js";
import * as mediaService from "../services/mediaService.js";
import db from "../config/db.js";
import Logger from "../utils/logger.js";
import { storageService } from "../services/storageService.js";
import * as productRepo from "../repositories/productRepository.js";
import { signals } from "../services/firebaseSignalService.js";

import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";

import AppError from "../utils/AppError.js";

/**
 * GET /api/media
 * list paginated
 */
export const listMedia = async (req, res, next) => {
  const { page, limit, offset } = normalizePagination(req.query, 20);

  const filters = {};
  if (req.query.search && req.query.search.trim()) {
    filters.search = req.query.search.trim();
  }
  if (req.query.linkStatus) {
    try {
      filters.linkStatus = JSON.parse(req.query.linkStatus);
    } catch {
      if (["linked", "orphaned"].includes(req.query.linkStatus)) {
        filters.linkStatus = req.query.linkStatus;
      }
    }
  }

  let connection;
  try {
    connection = await db.getConnection();
    const assets = await mediaRepo.getMediaAssets(connection, limit, offset, filters);
    const total = await mediaRepo.getTotalMediaAssets(connection, filters);

    res.json({
      success: true,
      data: assets,
      pagination: formatPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * GET /api/media/:id
 * Mengambil detail lengkap satu media beserta produk yang terikat
 */
export const getMediaById = async (req, res, next) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    const asset = await mediaRepo.getMediaDetailsWithProducts(connection, id);
    if (!asset) {
      return next(new AppError("Aset tidak ditemukan", 404));
    }
    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * GET /api/media/status
 * Ambil status beberapa asset via query parameter ids=1,2,3
 */
export const getMediaStatus = async (req, res, next) => {
  const idsStr = req.query.ids;
  if (!idsStr) {
    return res.json({ success: true, data: [] });
  }

  const mediaIds = idsStr
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (mediaIds.length === 0) {
    return res.json({ success: true, data: [] });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const assets = await mediaRepo.getMediaAssetsByIds(connection, mediaIds);
    res.json({ success: true, data: assets });
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * DELETE /api/media/:id
 * Menghapus record DB, dilindungi FK constraint, lalu asinkron hapus R2 via worker
 */
export const deleteMedia = async (req, res, next) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();

    // Check asset
    const asset = await mediaRepo.getMediaAssetById(connection, id);
    if (!asset) {
      return next(new AppError("Aset tidak ditemukan", 404));
    }

    // Attempt delete (RESTRICT FK will throw if used)
    await mediaRepo.deleteMediaAsset(connection, id);

    // If successful, push paths to trash queue for async deletion by worker
    const pushToQueue = async (subPath) => {
      if (!subPath) return;
      try {
        await mediaRepo.insertTrashQueue(connection, subPath);
      } catch (err) {
        Logger.error(`Could not push to trash queue ${subPath}`, err, "MEDIA_CTRL");
      }
    };

    await pushToQueue(asset.main_path);
    await pushToQueue(asset.thumbnail_path);


    
    // Broadcast signal agar list media refresh otomatis di client lain
    signals.refreshMedia();

    res.json({ success: true, message: "Media berhasil dihapus" });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return next(new AppError("Tidak bisa dihapus karena sedang dipakai oleh produk", 409));
    }
    return next(new AppError("Gagal menghapus media", 500));
  } finally {
    if (connection) connection.release();
  }
};

/**
 * PUT /api/media/:id/tags
 * Memperbarui tag aset
 */
export const updateMediaTagsController = async (req, res, next) => {
  const { id } = req.params;
  const { tags } = req.body;

  let connection;
  try {
    connection = await db.getConnection();

    const asset = await mediaRepo.getMediaAssetById(connection, id);
    if (!asset) return next(new AppError("Aset tidak ditemukan", 404));

    await mediaRepo.updateMediaTags(connection, id, tags);
    
    signals.refreshMedia();
    
    res.json({ success: true, message: "Tags berhasil diperbarui" });
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * PUT /api/media/:id/title
 * Memperbarui judul (title) aset
 */
export const updateMediaTitleController = async (req, res, next) => {
  const { id } = req.params;
  const { title } = req.body;

  let connection;
  try {
    connection = await db.getConnection();

    const asset = await mediaRepo.getMediaAssetById(connection, id);
    if (!asset) return next(new AppError("Aset tidak ditemukan", 404));

    await mediaRepo.updateMediaTitle(connection, id, title.trim());
    
    signals.refreshMedia();
    
    res.json({ success: true, message: "Judul berhasil diperbarui" });
  } catch (error) {
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * POST /api/media/bulk-link-excel
 * Upload Excel untuk Tautkan Massal produk ke aset gambar.
 */
import { createJobService } from "../services/jobService.js";

export const bulkLinkMediaExcel = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("File tidak ditemukan.", 400));
  }
  const jobId = await createJobService({
    userId: req.user.id,
    type: "LINK_MEDIA_EXCEL",
    originalname: req.file.originalname,
    serverFilePath: req.file.path,
    notes: "Bulk Link Media via Excel",
  });

  res.status(201).json({
    success: true,
    message: "File berhasil diunggah. Proses tautan massal berjalan di latar belakang.",
    jobId: jobId,
  });
});

import ExcelJS from "exceljs";

export const downloadBulkLinkTemplate = catchAsync(async (req, res, next) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Template Tautkan Media");

  sheet.columns = [
    { header: "SKU", key: "sku", width: 20 },
    { header: "Image_URL", key: "image_url", width: 50 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDDDDDD" },
  };

  sheet.addRow({
    sku: "PP000R081",
    image_url: "https://api.dpvindonesia.com/uploads/main/main-1783397524366-325551216.webp",
  });
  sheet.addRow({
    sku: "PP000453P",
    image_url:
      "https://api.dpvindonesia.com/uploads/main/main-dpv_indonesia_logo-white_lettermark_sm.png",
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", "attachment; filename=Template_Tautkan_Media.xlsx");

  await workbook.xlsx.write(res);
  res.end();
});

/**
 * GET /api/media/presigned-url
 * Mendapatkan presigned URL untuk upload langsung ke R2
 */
export const getPresignedUrls = async (req, res, next) => {
  const { files } = req.body; // Array of { name, type }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return next(new AppError("List file tidak valid", 400));
  }

  try {
    const urls = [];
    for (const f of files) {
      // 2 presigned URLs per image (main and thumb)
      const main = await storageService.generatePresignedUploadUrl(f.name, f.type, "main");
      const thumb = await storageService.generatePresignedUploadUrl(
        `thumb_${f.name}`,
        f.type,
        "thumb",
      );
      urls.push({ originalName: f.name, main, thumb });
    }

    res.json({ success: true, data: urls });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/media/confirm
 * Mengkonfirmasi file yang sudah diupload ke R2 dan menyimpan metadata
 */
export const confirmUpload = async (req, res, next) => {
  const { assets, products } = req.body;
  if (!assets || !Array.isArray(assets) || assets.length === 0) {
    return next(new AppError("Metadata aset tidak valid", 400));
  }

  const userId = req.user.id;
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const uploadedAssets = [];

    for (const asset of assets) {
      const mediaId = await mediaService.saveMediaMetadata(asset, userId, connection);

      if (products) {
        const productIds = Array.isArray(products) ? products : [products];
        for (const pId of productIds) {
          await productRepo.linkMedia(connection, pId, [mediaId]);
        }
      }

      uploadedAssets.push({ id: mediaId, originalName: asset.title, status: "COMPLETED" });
    }

    await connection.commit();
    
    // Trigger update ke client lain
    signals.refreshMedia();

    res.json({
      success: true,
      message: `${uploadedAssets.length} media berhasil disimpan`,
      data: uploadedAssets,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.isDuplicate) {
      return res.status(409).json({
        success: false,
        message: `File sudah pernah diunggah sebelumnya.`,
        error_code: "DUPLICATE_MEDIA",
      });
    }
    return next(new AppError(error.message || "Gagal menyimpan metadata media", 500));
  } finally {
    if (connection) connection.release();
  }
};
