// backend/config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paksa dotenv mencari .env di backend folder atau root folder
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });

const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
  user: process.env.DB_USER || process.env.MYSQL_USER || "root",
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "",
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || "db_wms_dev",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00',
  dateStrings: ['DATE', 'DATETIME'],
});

export default pool;
