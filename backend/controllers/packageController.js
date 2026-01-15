import db from "../config/db.js";
import * as jobRepo from "../repositories/jobRepository.js";
import * as productRepo from "../repositories/productRepository.js"; // For standard CRUD if needed

// Helper: Get Base URL
const getBaseUrl = (req) => {
  return `${req.protocol}://${req.get("host")}`;
};

export const exportPackages = async (req, res) => {
  const { format, search, searchBy, status } = req.query;
  const userId = req.user?.id || 1; // Fallback to 1 if no user

  let connection;
  try {
    connection = await db.getConnection();

    // Create Job Filters
    const filters = {
      exportType: "EXPORT_PACKAGES", // Identified by queue
      format: format || "xlsx",
      search,
      searchBy,
      status,
    };

    // Create Job
    const jobId = await jobRepo.createExportJob(connection, {
      userId,
      filters,
      jobType: "EXPORT_PACKAGES",
    });

    res.json({
      success: true,
      message: "Export job created successfully",
      data: { jobId },
    });
  } catch (error) {
    console.error("Export Package Error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
};

export const importPackagesBatch = async (req, res) => {
  // Phase 4 Implementation Placeholder
  // Enqueue IMPORT_PACKAGES job
  if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
  }

  const userId = req.user?.id || 1;
  const filePath = req.file.path;
  const originalName = req.file.originalname;

  let connection;
  try {
      connection = await db.getConnection();

      // Create Import Job
      const jobId = await jobRepo.create(connection, {
          userId,
          jobType: "IMPORT_PACKAGES",
          filename: originalName,
          filePath: filePath,
          notes: "Batch Package Update"
      });

      res.json({
          success: true,
          message: "Import job created successfully",
          data: { jobId }
      });
  } catch(error) {
      console.error("Import Package Error:", error);
      res.status(500).json({ success: false, message: error.message });
  } finally {
      if(connection) connection.release();
  }
};
