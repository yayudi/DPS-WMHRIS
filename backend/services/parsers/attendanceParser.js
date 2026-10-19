// backend/services/attendanceParser.js
import fs from "fs";
import csv from "csv-parser";
import { PARSER_CONSTANTS } from "../../config/wmsConstants.js"; // Import Config
import Logger from "../../utils/logger.js";

/**
 * Mencoba mengekstrak tanggal dari 10 baris pertama file (Metadata Header)
 */
export async function extractDateFromCsv(filepath) {
  try {
    const fileContent = await fs.promises.readFile(filepath, "utf8");
    const lines = fileContent.split(/\r?\n/).slice(0, 10); // Baca 10 baris pertama

    Logger.info("Mencari metadata tanggal di 10 baris pertama...", "ATTENDANCE_PARSER");

    for (const line of lines) {
      // Cari pola "From YYYY/MM/DD To YYYY/MM/DD"
      // Regex flexible: support separator / atau -
      const match = line.match(/From\s+(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+To/i);
      if (match) {
        Logger.info(`Metadata ditemukan: "${line.trim()}"`, "ATTENDANCE_PARSER");
        return { year: parseInt(match[1]), month: parseInt(match[2]) };
      }
    }

    Logger.info("Metadata tanggal tidak ditemukan di header file.", "ATTENDANCE_PARSER");
    return { year: null, month: null };
  } catch (error) {
    Logger.error("Error membaca metadata", error, "ATTENDANCE_PARSER");
    return { year: null, month: null };
  }
}

/**
 * Parsing Logika Utama: CSV Stream -> User Data Object
 */
export function parseCsvToUserData(filepath, mapping = {}) {
  return new Promise((resolve, reject) => {
    const data = {};
    let rowCount = 0;
    let validRowCount = 0;
    let skippedCount = 0;

    Logger.info(`Memulai stream file: ${filepath}`, "ATTENDANCE_PARSER");

    fs.createReadStream(filepath)
      .pipe(
        csv({
          skipLines: 3,
          mapHeaders: ({ header, index }) => {
            // Bersihkan header dari karakter aneh (BOM) dan spasi berlebih
            const cleanHeader = header.replace(/^\uFEFF/, "").trim();
            if (index < 5) Logger.info(`Header Col ${index}: '${cleanHeader}'`, "ATTENDANCE_PARSER");
            return cleanHeader;
          },
        })
      )
      .on("headers", (headers) => {
        Logger.info(`📋 Header Lengkap: ${JSON.stringify(headers)}`, "ATTENDANCE_PARSER");

        const hasUserID = headers.some((h) =>
          [mapping.id, "User ID", "No.", "AC-No.", "ID Number", "Nomor Pegawai"].filter(Boolean).includes(h)
        );
        const hasDate = headers.some((h) =>
          [mapping.time, "Date/Time", "Time", "Waktu", "DateTime", "Waktu Absen"].filter(Boolean).includes(h)
        );

        if (!hasUserID || !hasDate) {
          Logger.warn(
            "PERINGATAN: Header 'User ID' atau 'Date/Time' tidak terdeteksi standar!",
            "ATTENDANCE_PARSER"
          );
        }
      })
      .on("data", (row) => {
        rowCount++;

        // Debug 3 baris pertama
        if (rowCount <= 3) {
          Logger.info(`Row #${rowCount}: ${JSON.stringify(row)}`, "ATTENDANCE_PARSER");
        }

        const idCol = mapping.id;
        const nameCol = mapping.name;
        const timeCol = mapping.time;

        const id = (idCol && row[idCol]) || row["User ID"] || row["No."] || row["AC-No."] || row["ID Number"] || row["Nomor Pegawai"];
        const nama = (nameCol && row[nameCol]) || row["Full Name"] || row["Name"] || row["Nama"] || row["Nama Lengkap"];
        const datetimeRaw = (timeCol && row[timeCol]) || row["Date/Time"] || row["Time"] || row["Waktu"] || row["DateTime"] || row["Waktu Absen"];

        if (!id || !datetimeRaw) {
          if (skippedCount < 5)
            Logger.warn(
              `Baris ${rowCount} SKIPPED (Data Incomplete): ID=${id}, Time=${datetimeRaw}`,
              "ATTENDANCE_PARSER"
            );
          skippedCount++;
          return;
        }

        let dateObj;
        if (datetimeRaw.includes(" ")) {
          const parts = datetimeRaw.split(" ");
          if (parts.length >= 2) {
            const datePart = parts[0];
            const timePart = parts[1];
            const dParts = datePart.split(/[\/\-]/);
            const tParts = timePart.split(":");

            if (dParts.length === 3) {
              const y = parseInt(dParts[0]);
              const m = parseInt(dParts[1]) - 1;
              const d = parseInt(dParts[2]);
              const hr = parseInt(tParts[0] || 0);
              const min = parseInt(tParts[1] || 0);
              dateObj = new Date(y, m, d, hr, min);
            }
          }
        }

        if (!dateObj || isNaN(dateObj.getTime())) {
          dateObj = new Date(datetimeRaw);
        }

        if (isNaN(dateObj.getTime())) {
          if (skippedCount < 5)
            Logger.warn(`Baris ${rowCount} SKIPPED (Invalid Date): ${datetimeRaw}`, "ATTENDANCE_PARSER");
          skippedCount++;
          return;
        }

        const dayKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();

        if (!data[id]) {
          data[id] = { id: parseInt(id), nama: nama || `User-${id}`, days: {}, sourceRows: [] };
        }
        if (!data[id].days[dayKey]) {
          data[id].days[dayKey] = { l: [] };
        }
        
        // 4 because skipLines: 3 means header is row 4, first data is row 5.
        // rowCount starts at 1, so rowCount + 4 gives the correct Excel row number
        data[id].sourceRows.push(rowCount + 4);

        const logType = determineLogType(minutes, dateObj.getDay(), data[id].days[dayKey].l);

        if (logType) {
          data[id].days[dayKey].l.push({ m: minutes, y: logType });
        }

        validRowCount++;
      })
      .on("end", () => {
        Logger.info("Parsing Selesai", "ATTENDANCE_PARSER");
        Logger.info(
          `Statistik: Total=${rowCount}, Valid=${validRowCount}, Skipped=${skippedCount}`,
          "ATTENDANCE_PARSER"
        );
        Logger.info(`User Unik Ditemukan: ${Object.keys(data).length}`, "ATTENDANCE_PARSER");
        resolve({ data, headerRowIndex: 4 });
      })
      .on("error", (error) => {
        Logger.error("Stream Error", error, "ATTENDANCE_PARSER");
        reject(error);
      });
  });
}

/**
 * Logika Bisnis Penentuan Tipe Log (In/Out)
 * Menggunakan konstanta dari wmsConstants.js
 */
function determineLogType(minutes, dayOfWeek, existingLogs) {
  const {
    RANGE_MASUK_MULAI,
    RANGE_MASUK_SELESAI,
    RANGE_ISTIRAHAT_MULAI,
    RANGE_ISTIRAHAT_SELESAI,
    BATAS_PULANG_SABTU,
    BATAS_PULANG_BIASA,
  } = PARSER_CONSTANTS;

  // Masuk
  if (minutes >= RANGE_MASUK_MULAI && minutes <= RANGE_MASUK_SELESAI) return "in";

  // Istirahat
  if (minutes >= RANGE_ISTIRAHAT_MULAI && minutes <= RANGE_ISTIRAHAT_SELESAI) {
    const lastLog = existingLogs[existingLogs.length - 1];
    return lastLog && lastLog.y === "break-in" ? "break-out" : "break-in";
  }

  // Pulang
  const isSaturday = dayOfWeek === 6;
  const batasPulang = isSaturday ? BATAS_PULANG_SABTU : BATAS_PULANG_BIASA;

  if (minutes >= batasPulang) return "out";

  return null;
}
