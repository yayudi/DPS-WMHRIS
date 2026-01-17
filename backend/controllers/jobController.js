// backend/controllers/jobController.js
import db from "../config/db.js";
import * as jobRepo from "../repositories/jobRepository.js";

/**
 * Get list of import jobs for the current user.
 */
export const getUserImportJobs = async (req, res) => {
  let connection;
  try {
    const userId = req.user.id;
    connection = await db.getConnection();

    const jobs = await jobRepo.findByUser(connection, userId, 20); // Limit 20

    // Parse error_log JSON if exists
    const formattedJobs = jobs.map((job) => {
      let errorLog = null;
      if (job.error_log) {
        try {
          errorLog = typeof job.error_log === "string" ? JSON.parse(job.error_log) : job.error_log;
        } catch (e) {
          console.warn(`Failed to parse error_log for job ${job.id}`, e);
        }
      }

      return {
        id: job.id,
        status: job.status,
        jobType: job.job_type,
        originalFilename: job.original_filename,
        summary: job.log_summary,
        errorLog: errorLog, // Contains download_url and errors array
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        retryCount: job.retry_count,
        processedRecords: job.processed_records,
        totalRecords: job.total_records,
      };
    });

    res.json({
      success: true,
      data: formattedJobs,
    });
  } catch (error) {
    console.error("Error getting user import jobs:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil riwayat import.",
    });
  } finally {
    if (connection) connection.release();
  }
};
