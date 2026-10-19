// backend/controllers/uploadController.js
import { storageService } from "../services/storageService.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";

/**
 * Generate a presigned URL for direct object upload.
 */
export const getPresignedUrl = catchAsync(async (req, res) => {
  const { fileName, mimeType, folder } = req.body;

  if (!fileName || !mimeType) {
    throw new AppError("fileName dan mimeType wajib diisi.", 400, "VALIDATION_ERROR");
  }

  const result = await storageService.generatePresignedUploadUrl(fileName, mimeType, folder);

  if (!result) {
    throw new AppError("Gagal men-generate URL upload.", 500, "STORAGE_ERROR");
  }

  res.status(200).json({
    success: true,
    message: "Presigned URL berhasil dibuat",
    data: result,
  });
});
