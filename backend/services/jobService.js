// backend/services/jobService.js
import db from "../config/db.js";
import * as jobRepo from "../repositories/jobRepository.js";

/**
 * Membuat Entry Job Baru (Pending)
 */
export const createJobService = async ({ userId, type, originalname, serverFilePath, notes }) => {
  const connection = await db.getConnection();
  try {
    const jobId = await jobRepo.create(connection, {
      userId,
      jobType: type,
      filename: originalname,
      filePath: serverFilePath,
      notes,
    });
    return jobId;
  } finally {
    connection.release();
  }
};

/**
 * Update Progress/Status Job (Biasanya dipanggil saat proses selesai/error)
 */
export const updateJobStatusService = async (jobId, status, summary, errorLogObj = null) => {
  const connection = await db.getConnection();
  try {
    await jobRepo.update(connection, jobId, {
      status,
      summary,
      errorLog: errorLogObj,
    });
  } finally {
    connection.release();
  }
};

/**
 * Ambil History Job User
 */
export const getUserJobsService = async (userId) => {
  const connection = await db.getConnection();
  try {
    return await jobRepo.findByUser(connection, userId);
  } finally {
    connection.release();
  }
};

/**
 * Batalkan Job
 */
export const cancelJobService = async (jobId, userId) => {
  const connection = await db.getConnection();
  try {
    const success = await jobRepo.cancel(connection, jobId, userId);
    if (!success) {
      throw new Error("Gagal membatalkan. Job mungkin sudah diproses atau bukan milik Anda.");
    }
    return true;
  } finally {
    connection.release();
  }
};
