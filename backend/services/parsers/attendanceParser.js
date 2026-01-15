// backend/services/attendanceParser.js
import fs from "fs";
import csv from "csv-parser";
import { PARSER_CONSTANTS } from "../../config/wmsConstants.js"; // ✅ Import Config

/**
 * Mencoba mengekstrak tanggal dari 10 baris pertama file (Metadata Header)
 */
export async function extractDateFromCsv(filepath) {
  try {
    const fileContent = await fs.promises.readFile(filepath, "utf8");
    const lines = fileContent.split(/\r?\n/).slice(0, 10); // Baca 10 baris pertama

    console.log(`[Parser] 🔍 Mencari metadata tanggal di 10 baris pertama...`);

    for (const line of lines) {
      // Cari pola "From YYYY/MM/DD To YYYY/MM/DD"
      // Regex flexible: support separator / atau -
      const match = line.match(/From\s+(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+To/i);
      if (match) {
        console.log(`[Parser] ✅ Metadata ditemukan: "${line.trim()}"`);
        return { year: parseInt(match[1]), month: parseInt(match[2]) };
      }
    }

    console.log("[Parser] ℹ️ Metadata tanggal tidak ditemukan di header file.");
    return { year: null, month: null };
  } catch (error) {
    console.error("[Parser] ❌ Error membaca metadata:", error);
    return { year: null, month: null };
  }
}

/**
 * Parsing Logika Utama: CSV Stream -> User Data Object
 */
export function parseCsvToUserData(filepath) {
  return new Promise((resolve, reject) => {
    const data = {};
    let rowCount = 0;
    let validRowCount = 0;
    let skippedCount = 0;

    console.log(`[Parser] 📂 Memulai stream file: ${filepath}`);

    fs.createReadStream(filepath)
      .pipe(
        csv({
          skipLines: 3,
          mapHeaders: ({ header, index }) => {
            // Bersihkan header dari karakter aneh (BOM) dan spasi berlebih
            const cleanHeader = header.replace(/^\uFEFF/, "").trim();
            if (index < 5) console.log(`[Parser] Header Col ${index}: '${cleanHeader}'`);
            return cleanHeader;
          },
        })
      )
      .on("headers", (headers) => {
        console.log(`[Parser] 📋 Header Lengkap:`, JSON.stringify(headers));

        const hasUserID = headers.some((h) =>
          ["User ID", "No.", "AC-No.", "ID Number"].includes(h)
        );
        const hasDate = headers.some((h) => ["Date/Time", "Time", "Waktu", "DateTime"].includes(h));

        if (!hasUserID || !hasDate) {
          console.warn(
            `[Parser] ⚠️ PERINGATAN: Header 'User ID' atau 'Date/Time' tidak terdeteksi standar!`
          );
        }
      })
      .on("data", (row) => {
        rowCount++;

        // Debug 3 baris pertama
        if (rowCount <= 3) {
          console.log(`[Parser] 🔍 Row #${rowCount}:`, JSON.stringify(row));
        }

        const id = row["User ID"] || row["No."] || row["AC-No."] || row["ID Number"];
        const nama = row["Full Name"] || row["Name"] || row["Nama"];
        const datetimeRaw = row["Date/Time"] || row["Time"] || row["Waktu"] || row["DateTime"];

        if (!id || !datetimeRaw) {
          if (skippedCount < 5)
            console.warn(
              `[Parser] ⚠️ Baris ${rowCount} SKIPPED (Data Incomplete): ID=${id}, Time=${datetimeRaw}`
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
            console.warn(`[Parser] ⚠️ Baris ${rowCount} SKIPPED (Invalid Date): ${datetimeRaw}`);
          skippedCount++;
          return;
        }

        const dayKey = dateObj.getDate();
        const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();

        if (!data[id]) {
          data[id] = { id: parseInt(id), nama: nama || `User-${id}`, days: {} };
        }
        if (!data[id].days[dayKey]) {
          data[id].days[dayKey] = { l: [] };
        }

        const logType = determineLogType(minutes, dateObj.getDay(), data[id].days[dayKey].l);

        if (logType) {
          data[id].days[dayKey].l.push({ m: minutes, y: logType });
        }

        validRowCount++;
      })
      .on("end", () => {
        console.log(`[Parser] ✅ Parsing Selesai.`);
        console.log(
          `[Parser] 📊 Statistik: Total=${rowCount}, Valid=${validRowCount}, Skipped=${skippedCount}`
        );
        console.log(`[Parser] 👥 User Unik Ditemukan: ${Object.keys(data).length}`);
        resolve({ data });
      })
      .on("error", (error) => {
        console.error("[Parser] ❌ Stream Error:", error);
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
