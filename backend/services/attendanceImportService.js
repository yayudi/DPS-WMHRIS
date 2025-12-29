// backend/services/attendanceImportService.js
import fs from "fs";
import csv from "csv-parser";
import readline from "readline";
import path from "path";

// --- KONFIGURASI LOGIKA BISNIS ---
// Dalam menit (misal: 08:00 = 8 * 60 = 480)
const JAM_KERJA_MULAI = 480; // 08:00
const JAM_KERJA_SELESAI = 960; // 16:00
const JAM_KERJA_SELESAI_SABTU = 840; // 14:00
const TOLERANSI_MENIT = 5;

// Mapping tipe log mesin ke tipe DB
const logTypeMap = {
  in: "in",
  out: "out",
  "break-in": "break-in",
  "break-out": "break-out",
};

/**
 * Service utama untuk memproses file absensi di background worker.
 * Menerima koneksi DB dari worker, path file, dan user ID.
 */
export async function processAttendanceImport(
  connection,
  filePath,
  userId,
  originalFilename = null,
  onProgress = null,
  dryRun = false,
  columnMapping = null
) {
  try {
    // Fallback nama file jika tidak dikirim
    const fileNameForLog = originalFilename || path.basename(filePath);
    console.log(`[AttendanceService] Memulai proses file (DryRun=${dryRun}): ${fileNameForLog}`);
    if (columnMapping)
      console.log(`[AttendanceService] Menggunakan Custom Mapping:`, columnMapping);

    // Analisis Struktur File (Cari Header & Periode)
    const structure = await analyzeFileStructure(filePath);
    console.log(
      `[AttendanceService] Struktur: Header baris ${structure.headerIndex + 1}, Periode: ${
        structure.year
      }-${structure.month}`
    );

    // 2. Parse Data CSV dengan parameter Mapping
    const { data: parsedData, dateRange } = await parseCsvToUserData(
      filePath,
      structure,
      columnMapping
    );

    // Fallback Periode
    let year = structure.year;
    let month = structure.month;
    if (!year || !month) {
      if (dateRange.min) {
        year = dateRange.min.getFullYear();
        month = dateRange.min.getMonth() + 1;
      } else {
        throw new Error("Gagal mendeteksi periode tanggal dari file.");
      }
    }

    // Hitung Total Data untuk Progress Bar
    let totalRecordsToProcess = 0;
    for (const uid in parsedData) {
      totalRecordsToProcess += Object.keys(parsedData[uid].days).length;
    }
    console.log(`[AttendanceService] Total Hari Kerja ditemukan: ${totalRecordsToProcess}`);

    // 3. Validasi User Database (Non-Strict / Normalisasi Nama)
    const [validUsers] = await connection.query("SELECT username FROM users");
    const validUserMap = new Map(validUsers.map((u) => [u.username.toLowerCase(), u.username]));

    let processedCounter = 0; // Counter Global untuk Progress
    let totalSummaryRecords = 0;
    let totalRawRecords = 0;
    const errors = [];

    console.log(
      `[AttendanceService] Mulai insert DB. Mode: TERIMA SEMUA USER (Strict Validation OFF)`
    );

    // [NEW] Lapor progress awal (0%)
    if (onProgress) await onProgress(0, totalRecordsToProcess);

    await connection.beginTransaction();

    try {
      for (const id in parsedData) {
        const user = parsedData[id];
        const rawName = user.nama.trim();

        // [LOGIC BARU]: Prioritaskan nama dari DB jika ada match (untuk konsistensi casing),
        // Tapi jika tidak ada, PAKAI NAMA MENTAH dari CSV. Jangan di-skip.
        const finalUsername = validUserMap.get(rawName.toLowerCase()) || rawName;

        // Logic loop hari tetap sama
        for (const dayKey in user.days) {
          try {
            const dayOfMonth = parseInt(dayKey);
            const dailyLog = user.days[dayKey];
            const date = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(
              2,
              "0"
            )}`;
            const dayOfWeek = new Date(date).getDay();

            // --- HITUNG LOGIKA ABSENSI ---

            // Cari Check-In (Log tipe 'in' paling awal)
            const checkIns = dailyLog.l.filter((log) => log.y === "in").map((log) => log.m);
            const earliestCheckIn = checkIns.length > 0 ? Math.min(...checkIns) : null;

            // Cari Check-Out (Log tipe 'out' paling akhir)
            const checkOuts = dailyLog.l.filter((log) => log.y === "out").map((log) => log.m);
            const latestCheckOut = checkOuts.length > 0 ? Math.max(...checkOuts) : null;

            // Hitung Telat
            let lateness = 0;
            if (earliestCheckIn) {
              const lateThreshold = JAM_KERJA_MULAI + TOLERANSI_MENIT;
              if (earliestCheckIn > lateThreshold) {
                lateness = earliestCheckIn - JAM_KERJA_MULAI;
              }
            }

            // Hitung Lembur
            let overtime = 0;
            if (latestCheckOut) {
              const workEndTime = dayOfWeek === 6 ? JAM_KERJA_SELESAI_SABTU : JAM_KERJA_SELESAI;
              if (latestCheckOut > workEndTime) {
                overtime = latestCheckOut - workEndTime;
              }
            }

            // Helper konversi menit ke "HH:mm:ss"
            const minutesToTime = (minutes) => {
              if (minutes === null || minutes === undefined) return null;
              const h = Math.floor(minutes / 60)
                .toString()
                .padStart(2, "0");
              const m = (minutes % 60).toString().padStart(2, "0");
              return `${h}:${m}:00`;
            };

            // Audit Note
            const processTime = new Date()
              .toLocaleString("id-ID", { hour12: false })
              .replace(/\./g, ":");

            // Logic Calc Info untuk Audit Trail
            let calcInfo = [];
            if (lateness > 0) calcInfo.push(`Late:${lateness}m`);
            if (overtime > 0) calcInfo.push(`OT:${overtime}m`);
            const calcStr = calcInfo.length > 0 ? ` | ${calcInfo.join(",")}` : "";

            // Potong nama file jika terlalu panjang agar muat di DB
            const safeFileName =
              fileNameForLog.length > 20 ? fileNameForLog.substring(0, 17) + "..." : fileNameForLog;
            const auditNote = `Import${
              dryRun ? " (Simulasi)" : ""
            }: ${safeFileName} (${processTime})${calcStr}`;

            // Upsert Summary dengan Audit Note
            const summarySql = `
              INSERT INTO attendance_logs (username, date, check_in, check_out, lateness_minutes, overtime_minutes, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                check_in=VALUES(check_in),
                check_out=VALUES(check_out),
                lateness_minutes=VALUES(lateness_minutes),
                overtime_minutes=VALUES(overtime_minutes),
                        notes = CONCAT(IFNULL(notes, ''), ' | ', VALUES(notes))
            `;

            const [summaryResult] = await connection.query(summarySql, [
              finalUsername,
              date,
              minutesToTime(earliestCheckIn),
              minutesToTime(latestCheckOut),
              lateness,
              overtime,
              auditNote,
            ]);

            let summaryId = summaryResult.insertId;

            if (!summaryId || summaryId === 0) {
              const [rows] = await connection.query(
                "SELECT id FROM attendance_logs WHERE username = ? AND date = ?",
                [finalUsername, date]
              );
              if (rows.length > 0) summaryId = rows[0].id;
            }

            // Insert Raw Logs
            if (summaryId) {
              totalSummaryRecords++;
              await connection.query(
                "DELETE FROM attendance_raw_logs WHERE attendance_log_id = ?",
                [summaryId]
              );

              // Siapkan data bulk insert
              const rawLogsToInsert = dailyLog.l.map((log) => [
                summaryId,
                minutesToTime(log.m),
                logTypeMap[log.y] || "unknown",
              ]);

              if (rawLogsToInsert.length > 0) {
                await connection.query(
                  `INSERT INTO attendance_raw_logs (attendance_log_id, log_time, log_type) VALUES ?`,
                  [rawLogsToInsert]
                );
                totalRawRecords += rawLogsToInsert.length;
              }
            }

            // Update Progress
            processedCounter++;
            // Update setiap 10 data agar tidak terlalu membebani DB
            if (onProgress && processedCounter % 10 === 0) {
              await onProgress(processedCounter, totalRecordsToProcess);
            }
          } catch (rowError) {
            console.error(`[AttendanceService] Error row ${user.nama}:`, rowError);
            errors.push(`Gagal memproses ${user.nama}: ${rowError.message}`);
          }
        }
      }

      // [DRY RUN LOGIC]
      if (dryRun) {
        console.log(`[AttendanceService] Mode Dry Run Aktif. Melakukan ROLLBACK.`);
        await connection.rollback(); // Batalkan semua insert
      } else {
        await connection.commit(); // Simpan permanen
        console.log(`[AttendanceService] Transaksi database berhasil dikommit.`);
      }

      // Lapor progress selesai (100%)
      if (onProgress) await onProgress(totalRecordsToProcess, totalRecordsToProcess);

      console.log(`[AttendanceService] Transaksi database berhasil dikommit.`);
    } catch (dbError) {
      // Rollback jika terjadi error fatal saat loop DB
      await connection.rollback();
      throw dbError;
    }

    let summaryMsg = dryRun
      ? `[SIMULASI VALID] Akan memproses ${totalSummaryRecords} hari & ${totalRawRecords} log.`
      : `Sukses: ${totalSummaryRecords} hari, ${totalRawRecords} log.`;

    return {
      logSummary: summaryMsg,
      errors: errors,
      stats: { success: totalSummaryRecords, failed: errors.length },
    };
  } catch (error) {
    console.error("[AttendanceService] Fatal Error:", error);
    throw error;
  }
}

// ==================================================================
// == SMART PARSER HELPERS ==
// ==================================================================

async function analyzeFileStructure(filepath) {
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  let headerIndex = -1;
  let year = null;
  let month = null;

  // Keyword untuk mendeteksi header kolom
  const headerKeywords = ["User ID", "No.", "AC-No.", "ID", "Nama", "Name", "Date/Time", "Waktu"];

  for await (const line of rl) {
    // Cari Metadata Tanggal (biasanya "From 2025/01/01")
    if (!year && line.includes("From")) {
      const match = line.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (match) {
        year = parseInt(match[1]);
        month = parseInt(match[2]);
      }
    }

    // 2. Cari Header Table
    if (headerIndex === -1) {
      // Jika baris mengandung setidaknya 2 keyword penting
      let hitCount = 0;
      headerKeywords.forEach((k) => {
        if (line.includes(k)) hitCount++;
      });
      if (hitCount >= 2) {
        headerIndex = lineCount;
      }
    }

    lineCount++;
    if (lineCount > 20) break; // Cukup scan 20 baris pertama
  }

  rl.close();

  // Default fallback jika tidak ketemu (misal file CSV murni tanpa metadata)
  if (headerIndex === -1) headerIndex = 0;

  return { headerIndex, year, month };
}

/**
 * Membaca CSV dengan skipLines dinamis dan mapping kolom fleksibel
 */
function parseCsvToUserData(filepath, structure, columnMapping = null) {
  return new Promise((resolve, reject) => {
    const data = {};
    const dateRange = { min: null, max: null };

    fs.createReadStream(filepath)
      .pipe(
        csv({
          skipLines: structure.headerIndex,
          mapHeaders: ({ header }) => header.replace(/\uFEFF/g, "").trim(),
        })
      )
      .on("data", (row) => {
        let id, nama, datetime;

        if (columnMapping) {
          // [NEW] Gunakan Mapping Eksplisit jika ada
          id = row[columnMapping.id]?.trim();
          nama = row[columnMapping.name]?.trim();
          datetime = row[columnMapping.time]?.trim();
        } else {
          // [OLD] Auto-Detect (Fallback)
          const getCol = (possibleNames) => {
            for (const name of possibleNames) {
              if (row[name] !== undefined) return row[name]?.trim();
            }
            return null;
          };

          id = getCol(["User ID", "No.", "ID", "AC-No."]);
          nama = getCol(["Full Name", "Name", "Nama"]);
          datetime = getCol(["Date/Time", "Time", "Waktu", "DateTime"]);
        }

        if (!id || !nama || !datetime) return;

        // Parse Tanggal & Waktu
        let dateObj;
        // Coba format standard "YYYY/MM/DD HH:mm:ss"
        const [datePart, timePart] = datetime.split(" ");
        if (datePart && timePart) {
          const [y, m, d] = datePart.includes("/") ? datePart.split("/") : datePart.split("-");
          dateObj = new Date(`${y}-${m}-${d}T${timePart}`);
        } else {
          // Coba parse langsung (ISO)
          dateObj = new Date(datetime);
        }

        if (isNaN(dateObj.getTime())) return;

        // Update Date Range (untuk fallback jika metadata kosong)
        if (!dateRange.min || dateObj < dateRange.min) dateRange.min = dateObj;
        if (!dateRange.max || dateObj > dateRange.max) dateRange.max = dateObj;

        const dayKey = dateObj.getDate();
        const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();

        if (!data[id]) data[id] = { id: parseInt(id), nama, days: {} };
        if (!data[id].days[dayKey]) data[id].days[dayKey] = { l: [] }; // l = logs

        // Tentukan Log Type (Masuk/Pulang/Istirahat)
        const logType = determineLogType(minutes, dateObj.getDay(), data[id].days[dayKey].l);

        if (logType) {
          data[id].days[dayKey].l.push({ m: minutes, y: logType });
        }
      })
      .on("end", () => resolve({ data, dateRange }))
      .on("error", (error) => reject(error));
  });
}

function determineLogType(minutes, dayOfWeek, existingLogs) {
  // Logic Absensi Sederhana (Bisa disesuaikan)
  // Masuk: 06:00 (360) - 11:00 (660)
  if (minutes >= 360 && minutes <= 660) return "in";

  // Pulang
  const isSaturday = dayOfWeek === 6;
  const pulangBatas = isSaturday ? 840 : 960; // 14:00 atau 16:00

  if (minutes >= pulangBatas) return "out";

  // Jika di tengah hari, cek apakah istirahat
  if (minutes > 660 && minutes < pulangBatas) {
    const lastLog = existingLogs[existingLogs.length - 1];
    // Jika log terakhir adalah break-in, maka ini break-out
    return lastLog && lastLog.y === "break-in" ? "break-out" : "break-in";
  }
  return null;
}
