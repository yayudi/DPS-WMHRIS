// backend/middleware/errorHandler.js
import Logger from "../utils/logger.js";

/**
 * Global Error Handling Middleware
 * Menangkap semua error yang dilempar oleh `next(err)` dari Controller/Service.
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let { statusCode, message, errorCode } = err;
  const { isOperational } = err;

  // Default values untuk error yang tidak terduga (misal bug JS murni atau error DB)
  if (!isOperational) {
    statusCode = 500;
    errorCode = "SERVER_ERROR";
    // Sembunyikan detail error asli di production untuk keamanan
    message =
      process.env.NODE_ENV === "production"
        ? "Terjadi kesalahan internal pada server."
        : err.message || "Server Error";
  }

  // Log Error (Hanya log detail penuh jika 500)
  if (statusCode >= 500) {
    Logger.error(err.message, err.stack, "GLOBAL_ERROR_HANDLER");
  } else {
    // Log sebagai peringatan/debug untuk 4xx
    Logger.debug(`${errorCode}: ${message}`, "API_ERROR");
  }

  // Respons Standard sesuai API Contract
  res.status(statusCode).json({
    success: false,
    message: message,
    error_code: errorCode,
    ...(err.details && { errors: err.details })
  });
};

export default errorHandler;
