import fs from "fs/promises";
import path from "path";
import csv from "csv-parser";

// Impor fungsi-fungsi pembantu dari file terpisah
import {
  loadHolidays,
  generateJsonIndex,
  loadAndDecompactExistingData,
  saveJsonAndLogs,
  getDaysInMonth,
} from "./fileHelpers.js";

// Definisikan konstanta, sama seperti di lib.php
const STATUS_H = 0;
const STATUS_A = 1;
const STATUS_L = 2;
const STATUS_MT = 3;

/**
 * Fungsi utama untuk memproses file absensi yang di-upload.
 * @param {string} temporaryFilePath Path ke file CSV yang di-upload di folder /tmp
 * @returns {Promise<object>} Hasil proses, berisi status sukses, pesan, dan data.
 */
export async function processAttendanceFile(temporaryFilePath) {
  try {
    // --- 1. Baca Data Baru dari CSV ---
    const {
      data: newDataFromCsv,
      firstDatetime,
      debugRows,
    } = await parseCsvToUserData(temporaryFilePath);

    if (!firstDatetime) {
      throw new Error("File tidak berisi data absensi yang valid atau format tanggal salah.");
    }

    // --- 2. Tentukan Tahun dan Bulan ---
    // Mengurai tanggal dari format 'YYYY/MM/DD HH:mm'
    const datePart = firstDatetime.split(" ")[0];
    const [tahun, bulanAngka] = datePart.split("/");

    const holidayMap = await loadHolidays(tahun);

    // --- 3. Muat & Gabungkan dengan Data Lama ---
    const outputFile = path.join(
      process.cwd(),
      "public",
      "json",
      "absensi",
      tahun,
      `${tahun}-${bulanAngka}.json`
    );

    const existingData = await loadAndDecompactExistingData(
      outputFile,
      tahun,
      bulanAngka,
      holidayMap
    );
    const mergedData = mergeUserData(existingData, newDataFromCsv);

    // --- 4. Lengkapi & Hitung Ulang ---
    const completedData = completeMonthlyData(mergedData, tahun, bulanAngka, holidayMap);
    const processedData = calculateStatusesAndSummaries(completedData);

    // --- 5. Siapkan & Simpan Hasil Akhir ---
    const finalJsonOutput = await generateFinalJsonStructure(
      processedData,
      tahun,
      bulanAngka,
      holidayMap
    );

    await saveJsonAndLogs(outputFile, finalJsonOutput, processedData, debugRows);

    // --- 6. Buat Ulang Index ---
    await generateJsonIndex();

    // --- 7. Hapus file temporary ---
    await fs.unlink(temporaryFilePath);

    return {
      success: true,
      message: "✅ Upload dan parsing berhasil.",
      processed: { year: parseInt(tahun), month: parseInt(bulanAngka) },
    };
  } catch (error) {
    // Jika terjadi error, pastikan file temporary tetap dihapus
    await fs.unlink(temporaryFilePath).catch((err) => console.error("Gagal hapus file temp:", err));
    console.error("Error saat memproses file absensi:", error);
    return { success: false, message: `❌ ${error.message}` };
  }
}

// ==================================================================
// == FUNGSI-FUNGSI LOGIKA INTI (di-porting dari parse.php) ==
// ==================================================================

/**
 * Membaca file CSV dan mengubahnya menjadi struktur data internal.
 */
function parseCsvToUserData(filepath) {
  return new Promise((resolve, reject) => {
    const data = {};
    let firstDatetime = null;
    const debugRows = [];
    let lineCount = 0;

    fs.createReadStream(filepath)
      .pipe(csv({ skipLines: 3 })) // Lewati 3 baris meta
      .on("headers", (headers) => {
        // Membersihkan header dari karakter aneh
        const cleanHeaders = headers.map((h) => h.replace(/\uFEFF/g, "").trim());
        // Lanjutkan dengan header yang bersih
      })
      .on("data", (row) => {
        lineCount++;
        if (lineCount === 1) return; // Lewati baris header yang sebenarnya

        const id = row["User ID"]?.trim();
        const nama = row["Full Name"]?.trim();
        const datetime = row["Date/Time"]?.trim();

        if (!id || !nama || !datetime) return;

        if (firstDatetime === null) {
          firstDatetime = datetime;
        }

        const [dateStr, timeStr] = datetime.split(" ");
        // PHP Anda menggunakan Y/m/d, jadi kita sesuaikan
        const [year, month, day] = dateStr.split("/");
        const dateObj = new Date(year, month - 1, day);
        if (isNaN(dateObj)) return; // Skip jika tanggal tidak valid

        const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayKey = parseInt(day, 10);
        const dayOfWeek = dateObj.getDay(); // 0=Minggu, 6=Sabtu

        const [h, m] = timeStr.split(":");
        const minutesSinceMidnight = parseInt(h) * 60 + parseInt(m);

        const isSaturday = dayOfWeek === 6;
        let type = null;

        // Tentukan tipe log
        if (minutesSinceMidnight >= 420 && minutesSinceMidnight <= 600) {
          type = "in"; // 07:00 - 10:00
        } else if (minutesSinceMidnight >= 690 && minutesSinceMidnight <= 780) {
          const logsForDate = data[id]?.days?.[dayKey]?.l ?? [];
          const prev = logsForDate[logsForDate.length - 1];
          type = prev && prev.y === "break-in" ? "break-out" : "break-in";
        } else if (
          (!isSaturday && minutesSinceMidnight >= 960) ||
          (isSaturday && minutesSinceMidnight >= 840)
        ) {
          type = "out"; // >= 16:00 (normal), >= 14:00 (Sabtu)
        } else {
          return;
        }

        if (!data[id]) {
          data[id] = { id: parseInt(id), nama, days: {} };
        }

        if (!data[id].days[dayKey]) {
          const isHoliday = false; // Akan dihitung nanti saat merge
          data[id].days[dayKey] = {
            l: [],
            h: isHoliday ? 1 : 0,
            s: isHoliday ? STATUS_L : STATUS_A,
          };
        }
        data[id].days[dayKey].l.push({ t: timeStr, y: type });

        if (debugRows.length < 10) debugRows.push(row);
      })
      .on("end", () => resolve({ data, firstDatetime, debugRows }))
      .on("error", (error) => reject(error));
  });
}

/**
 * Menggabungkan data lama (jika ada) dengan data baru dari CSV.
 */
function mergeUserData(existingData, newDataFromCsv) {
  const merged = { ...existingData }; // Salin data lama

  for (const userId in newDataFromCsv) {
    if (!merged[userId]) {
      merged[userId] = newDataFromCsv[userId];
    } else {
      // Timpa nama jika berbeda (opsional)
      merged[userId].nama = newDataFromCsv[userId].nama;

      for (const dayKey in newDataFromCsv[userId].days) {
        const existingDayStatus = merged[userId].days?.[dayKey]?.s ?? STATUS_A;
        // Hanya perbarui jika status yang ada adalah "Absen"
        if (existingDayStatus === STATUS_A) {
          merged[userId].days[dayKey] = newDataFromCsv[userId].days[dayKey];
        }
      }
    }
  }
  return merged;
}

/**
 * Melengkapi data untuk semua hari dalam sebulan bagi semua user.
 */
function completeMonthlyData(userData, tahun, bulan, holidayMap) {
  const daysInMonth = getDaysInMonth(tahun, bulan);

  for (const userId in userData) {
    for (let d = 1; d <= daysInMonth; d++) {
      if (!userData[userId].days[d]) {
        const ymd = `${tahun}-${String(bulan).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayOfWeek = new Date(ymd).getDay();
        const isHoliday = holidayMap[ymd] || dayOfWeek === 0; // 0 = Minggu

        userData[userId].days[d] = {
          l: [],
          h: isHoliday ? 1 : 0,
          s: isHoliday ? STATUS_L : STATUS_A,
        };
      }
    }
    // Pastikan urutan hari benar
    const sortedDays = {};
    Object.keys(userData[userId].days)
      .sort((a, b) => a - b)
      .forEach((key) => {
        sortedDays[key] = userData[userId].days[key];
      });
    userData[userId].days = sortedDays;
  }
  return userData;
}

/**
 * Menghitung ulang semua status harian dan ringkasan bulanan.
 */
function calculateStatusesAndSummaries(userData) {
  const LOG_MAP = { in: 0, out: 1, "break-in": 2, "break-out": 3 };

  for (const userId in userData) {
    const summary = [0, 0, 0, 0, 0]; // [H, A, L, MT, H+L]

    for (const dayKey in userData[userId].days) {
      const day = userData[userId].days[dayKey];
      const logs = day.l;

      const jamMasuk = logs.find((l) => l.y === "in");
      const jamKeluar = logs.filter((l) => l.y === "out").pop(); // Ambil yang terakhir

      // Hitung ulang status
      if (day.h) {
        // Jika hari libur
        day.s = logs.length > 0 ? STATUS_H : STATUS_L;
      } else {
        // Jika hari kerja
        if (jamMasuk && jamKeluar) day.s = STATUS_H;
        else if (logs.length > 0) day.s = STATUS_MT;
        else day.s = STATUS_A;
      }

      // Update summary
      if (day.s !== STATUS_A || day.h) {
        // Jangan hitung absen di hari libur
        if (day.s === STATUS_H) summary[STATUS_H]++;
        if (day.s === STATUS_L) summary[STATUS_L]++;
        if (day.s === STATUS_MT) summary[STATUS_MT]++;
        if (day.h && day.s === STATUS_H) summary[4]++; // H+L
      } else {
        summary[STATUS_A]++;
      }

      // Konversi log ke format ringkas [menit, enum]
      const convertedLogs = logs.map((l) => {
        const [h, m] = l.t.split(":");
        const minutes = parseInt(h) * 60 + parseInt(m);
        return [minutes, LOG_MAP[l.y]];
      });

      // Perbarui objek hari
      if (convertedLogs.length > 0) {
        day.l = convertedLogs;
      } else {
        // Jika tidak ada log, ubah format menjadi hanya status (integer)
        userData[userId].days[dayKey] = day.s;
      }
    }
    userData[userId].summary = summary;
  }
  return userData;
}
