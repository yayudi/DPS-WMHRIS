// backend\utils\logger.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export const logDebug = (message, data = null) => {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] ${message}`;

  if (data) {
    if (typeof data === "object") {
      try {
        logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
      } catch (e) {
        logMessage += `\nData: [Circular or Non-serializable Object]`;
      }
    } else {
      logMessage += `\nData: ${data}`;
    }
  }

  logMessage += "\n----------------------------------------\n";

  // Write to console for dev
  console.log(logMessage);

  // Append to file
  fs.appendFile(path.join(logDir, "debug.log"), logMessage, (err) => {
    if (err) console.error("Failed to write to log file:", err);
  });
};
