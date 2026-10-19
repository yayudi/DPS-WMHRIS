// backend/controllers/jobController.js
import * as jobRepo from "../repositories/jobRepository.js";
import catchAsync from "../utils/catchAsync.js";
import { withConnection } from "../utils/dbUtils.js";
import { parseJsonSafe } from "../utils/jsonUtils.js";

/**
 * Get list of import jobs for the current user.
 */
export const getUserImportJobs = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const formattedJobs = await withConnection(async (connection) => {
    const jobs = await jobRepo.findByUser(connection, userId, 20); // Limit 20

    // Parse error_log JSON if exists
    return jobs.map((job) => {
      const errorLog = parseJsonSafe(job.error_log, null);

      return {
        id: job.id,
        status: job.status,
        jobType: job.job_type,
        originalFilename: job.original_filename,
        summary: job.log_summary,
        notes: job.notes || null,
        errorLog, // Contains download_url and errors array
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        retryCount: job.retry_count,
        processedRecords: job.processed_records,
        totalRecords: job.total_records,
      };
    });
  });

  res.json({
    success: true,
    data: formattedJobs,
  });
});
