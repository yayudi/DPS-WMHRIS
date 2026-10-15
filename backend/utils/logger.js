/* eslint-disable no-console */
// backend/utils/logger.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dayjs from "dayjs"; // Menggunakan dayjs dari fix sebelumnya untuk timestamp lokal yang konsisten

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, "../logs");

// Ensure logs directory exists
try {
  if (typeof fs.existsSync === "function" && !fs.existsSync(logDir)) {
    if (typeof fs.mkdirSync === "function") fs.mkdirSync(logDir, { recursive: true });
  }
} catch {
  // Ignore in mock/test environment
}

// Cek env, jika production matikan debug log
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Standardized Central Logger untuk Backend.
 * Menggunakan Buffered Write Strategy untuk meminimalkan disk I/O di shared hosting.
 * Log dikumpulkan di in-memory buffer dan di-flush ke disk secara periodik.
 */
class Logger {
  // ====================================================================
  // Buffer Configuration
  // ====================================================================
  /** @type {string[]} In-memory buffer untuk app log */
  static #appBuffer = [];
  /** @type {string[]} In-memory buffer untuk error log (subset dari app) */
  static #errorBuffer = [];
  /** Flush ke disk setiap N milidetik */
  static #FLUSH_INTERVAL_MS = 5000;
  /** Atau flush saat buffer mencapai N entries */
  static #MAX_BUFFER_SIZE = 50;
  /** @type {ReturnType<typeof setInterval>|null} */
  static #flushTimer = null;
  /** Guard untuk mencegah concurrent flush */
  static #isFlushing = false;
  /** Apakah warn/error juga ditulis ke file error/ terpisah (configurable via ENV) */
  static #separateErrorFile = process.env.LOG_SEPARATE_ERROR !== "false";
  /** @type {boolean} Flag untuk mencegah dir check berulang */
  static #appDirReady = false;
  /** @type {boolean} */
  static #errorDirReady = false;

  /**
   * @param {string} level
   * @param {string} context
   * @param {string} message
   * @returns {string}
   */
  static #formatMessage(level, context, message) {
    const timestamp = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const ctxString = context ? `[${context}]` : "";
    return `[${timestamp}] [${level}] ${ctxString} ${message}`;
  }

  // ====================================================================
  // Buffered Write System (menggantikan #writeToFile per-call)
  // ====================================================================

  /**
   * Menambahkan log ke in-memory buffer, bukan langsung ke disk.
   * Buffer di-flush secara periodik atau saat penuh.
   * @param {'app'|'error'} target - 'app' untuk info, 'error' untuk warn/error
   * @param {string} content - Formatted log string
   */
  static #bufferLog(target, content) {
    // Semua log masuk ke app buffer
    this.#appBuffer.push(content);

    // Warn/Error juga masuk ke error buffer (jika fitur error file terpisah aktif)
    if (target === "error" && this.#separateErrorFile) {
      this.#errorBuffer.push(content);
    }

    // Auto-flush jika buffer penuh
    if (this.#appBuffer.length >= this.#MAX_BUFFER_SIZE) {
      this.#flushBuffers();
    }
  }

  /**
   * Flush semua buffer ke disk dalam 1 operasi write per file.
   * Menggabungkan N log entries menjadi 1 appendFile call.
   * @returns {Promise<void>}
   */
  static async #flushBuffers() {
    if (this.#isFlushing) return;
    this.#isFlushing = true;

    try {
      const today = dayjs().format("YYYY-MM-DD");

      // Flush app buffer
      if (this.#appBuffer.length > 0) {
        const batch = this.#appBuffer.splice(0);
        const appDir = path.join(logDir, "app");
        if (!this.#appDirReady) {
          if (typeof fs.existsSync === "function" && !fs.existsSync(appDir)) {
            if (typeof fs.mkdirSync === "function") fs.mkdirSync(appDir, { recursive: true });
          }
          this.#appDirReady = true;
        }
        if (fs.promises?.appendFile) {
          await fs.promises.appendFile(
            path.join(appDir, `app-${today}.log`),
            batch.join("\n") + "\n",
          );
        }
      }

      // Flush error buffer (jika ada)
      if (this.#errorBuffer.length > 0) {
        const batch = this.#errorBuffer.splice(0);
        const errDir = path.join(logDir, "error");
        if (!this.#errorDirReady) {
          if (typeof fs.existsSync === "function" && !fs.existsSync(errDir)) {
            if (typeof fs.mkdirSync === "function") fs.mkdirSync(errDir, { recursive: true });
          }
          this.#errorDirReady = true;
        }
        if (fs.promises?.appendFile) {
          await fs.promises.appendFile(
            path.join(errDir, `error-${today}.log`),
            batch.join("\n") + "\n",
          );
        }
      }
    } catch (err) {
      console.error("Logger flush failed:", err);
    } finally {
      this.#isFlushing = false;
    }
  }

  /**
   * Memulai periodic flush timer. Panggil sekali saat server/worker start.
   * Timer menggunakan .unref() agar tidak memblokir process exit.
   */
  static startFlushTimer() {
    if (this.#flushTimer) return;
    this.#flushTimer = setInterval(() => this.#flushBuffers(), this.#FLUSH_INTERVAL_MS);
    this.#flushTimer.unref();
  }

  /**
   * Flush semua buffer dan hentikan timer.
   * Panggil sebelum process.exit() untuk mencegah kehilangan log.
   * @returns {Promise<void>}
   */
  static async shutdown() {
    if (this.#flushTimer) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }
    await this.#flushBuffers();
  }

  /**
   * Sanitizes sensitive keys recursively in an object to prevent leakage.
   * @param {any} data
   * @param {WeakSet} [seen]
   * @returns {any}
   */
  static #sanitize(data, seen = new WeakSet()) {
    if (!data || typeof data !== "object") {
      return data;
    }

    if (data instanceof Error) {
      return data;
    }

    if (seen.has(data)) {
      return "[Circular]";
    }
    seen.add(data);

    if (Array.isArray(data)) {
      return data.map((item) => this.#sanitize(item, seen));
    }

    const sensitiveKeys = [
      "password", "password_hash", "token", "secret", "jwt",
      "pin", "authorization", "cookie", "pass", "newpassword",
      "oldpassword", "kredensial"
    ];

    const cleanObj = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sKey) => lowerKey.includes(sKey))) {
        cleanObj[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        cleanObj[key] = this.#sanitize(value, seen);
      } else {
        cleanObj[key] = value;
      }
    }
    return cleanObj;
  }

  static #printObj(data) {
    if (!data) return "";
    try {
      const cleanData = this.#sanitize(data);
      return `\nData: ${JSON.stringify(cleanData, null, 2)}`;
    } catch {
      return `\nData: [Circular/Non-serializable]`;
    }
  }

  /**
   * Pruning otomatis file log yang sudah melewati masa retensi.
   * Fully async untuk menghindari blocking I/O di shared hosting.
   * @param {number} [daysToKeep=30]
   * @returns {Promise<void>}
   */
  static async pruneOldLogs(daysToKeep = 30) {
    try {
      const now = Date.now();
      const cutoffTime = now - daysToKeep * 24 * 60 * 60 * 1000;
      // Termasuk auto_recovery/ untuk backward compat (cleanup log lama)
      const folders = ["app", "error", "auto_recovery"];

      let deletedCount = 0;

      for (const folder of folders) {
        const targetDir = path.join(logDir, folder);
        try {
          if (!fs.promises?.readdir) continue;
          const files = await fs.promises.readdir(targetDir);
          for (const file of files) {
            if (!file.endsWith(".log")) continue;

            const filePath = path.join(targetDir, file);
            const stats = await fs.promises.stat(filePath);

            // Hapus jika file lebih tua dari cutoff
            if (stats.mtimeMs < cutoffTime) {
              await fs.promises.unlink(filePath);
              deletedCount++;
            }
          }
        } catch {
          // Folder tidak ada, skip silently
        }
      }

      if (deletedCount > 0) {
        this.info(`Berhasil menghapus ${deletedCount} file log lama (> ${daysToKeep} hari)`, "LOGGER_SYSTEM");
      }
    } catch (err) {
      console.error("Logger Failed to prune old logs:", err);
    }
  }

  /**
   * @param {string} message
   * @param {string} [context="INFO"]
   * @param {any} [data=null]
   */
  static info(message, context = "INFO", data = null) {
    const msg = this.#formatMessage("INFO", context, message);
    const cleanData = this.#sanitize(data);
    const fullMsg = msg + this.#printObj(cleanData);

    console.log(`\x1b[36m%s\x1b[0m`, msg); // Cyan
    if (cleanData) console.dir(cleanData, { depth: 2, colors: true });

    this.#bufferLog("app", fullMsg);
  }

  /**
   * @param {string} message
   * @param {string} [context="WARN"]
   * @param {any} [data=null]
   */
  static warn(message, context = "WARN", data = null) {
    const msg = this.#formatMessage("WARN", context, message);
    const cleanData = this.#sanitize(data);
    const fullMsg = msg + this.#printObj(cleanData);

    console.warn(`\x1b[33m%s\x1b[0m`, msg); // Yellow
    if (cleanData) console.dir(cleanData, { depth: 2, colors: true });

    this.#bufferLog("error", fullMsg); // Masuk ke app buffer + error buffer (jika aktif)
  }

  /**
   * @param {string} message
   * @param {Error|any} [error=null]
   * @param {string} [context="ERROR"]
   */
  static error(message, error = null, context = "ERROR") {
    const msg = this.#formatMessage("ERROR", context, message);
    const cleanError = this.#sanitize(error);
    const errorDetails = error instanceof Error
      ? `\nMessage: ${error.message}\nStack: ${error.stack}`
      : this.#printObj(cleanError);

    const fullMsg = msg + errorDetails;

    console.error(`\x1b[31m%s\x1b[0m`, msg); // Red
    if (cleanError) console.error(cleanError);

    this.#bufferLog("error", fullMsg); // Masuk ke app buffer + error buffer (jika aktif)
  }

  /**
   * Digunakan untuk trace & debug. Tidak akan diprint di production environment.
   * @param {string} message
   * @param {string} [context="DEBUG"]
   * @param {any} [data=null]
   */
  static debug(message, context = "DEBUG", data = null) {
    if (IS_PROD) return;

    const msg = this.#formatMessage("DEBUG", context, message);
    const cleanData = this.#sanitize(data);
    console.log(`\x1b[90m%s\x1b[0m`, msg); // Gray/Dim
    if (cleanData) console.dir(cleanData, { depth: 2, colors: true });

    // Debug tidak ditulis ke file untuk menghemat IOPS di shared hosting
  }
}

// ⚠️ Backward Compatibility untuk fungsi logger lama (agar tidak error)
export const logDebug = (message, data = null) => {
  Logger.debug(message, "LEGACY", data);
};

// Eksekusi pruning secara background 10 detik setelah logger di-load (agar tidak memblokir startup)
// Retensi diatur default ke 30 hari untuk hemat disk space di shared hosting
setTimeout(() => {
  Logger.pruneOldLogs(30).catch((err) => {
    console.error("Logger auto-prune failed:", err);
  });
}, 10000);

export default Logger;
