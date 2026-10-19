// backend/controllers/packageController.js
import * as jobRepo from "../repositories/jobRepository.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { withConnection } from "../utils/dbUtils.js";
import { EXPORT_JOB_TYPE, IMPORT_JOB_TYPE } from "../config/jobConstants.js";

/**
 * Request asynchronous export of packages.
 */
export const exportPackages = catchAsync(async (req, res) => {
  const { format, search, searchBy, status } = req.query;
  const userId = req.user?.id || 1;

  const filters = {
    exportType: EXPORT_JOB_TYPE.EXPORT_PACKAGES,
    format: format || "xlsx",
    search,
    searchBy,
    status,
  };

  const jobId = await withConnection(async (connection) => {
    return await jobRepo.createExportJob(connection, {
      userId,
      filters,
      jobType: EXPORT_JOB_TYPE.EXPORT_PACKAGES,
    });
  });

  res.json({
    success: true,
    message: "Export job created successfully",
    data: { jobId },
  });
});

/**
 * Enqueue batch package import job.
 */
export const importPackagesBatch = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError("No file uploaded.", 400, "VALIDATION_ERROR");
  }

  const userId = req.user?.id || 1;
  const filePath = req.file.path;
  const originalName = req.file.originalname;

  const jobId = await withConnection(async (connection) => {
    return await jobRepo.create(connection, {
      userId,
      jobType: IMPORT_JOB_TYPE.PACKAGES,
      filename: originalName,
      filePath,
      notes: "Batch Package Update",
    });
  });

  res.json({
    success: true,
    message: "Import job created successfully",
    data: { jobId },
  });
});
