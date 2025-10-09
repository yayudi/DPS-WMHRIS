import fs from "fs";
import path from "path";
import csv from "csv-parser";
import {
  loadHolidays,
  generateJsonIndex,
  loadAndDecompactExistingData,
  generateFinalJsonAndSave,
  saveDebugLogs,
  getDaysInMonth,
} from "./fileHelpers.js";

const STATUS_H = 0;
const STATUS_A = 1;
const STATUS_L = 2;
const STATUS_MT = 3;

export async function processAttendanceFile(temporaryFilePath, originalFilename) {
  try {
    const {
      data: newDataFromCsv,
      firstDataRow,
      debugRows,
    } = await parseCsvToUserData(temporaryFilePath);

    if (!firstDataRow) {
      throw new Error("File tidak berisi baris data absensi yang valid.");
    }

    // --- Ekstrak Metadata dari Konten File ---
    const fileContent = await fs.promises.readFile(temporaryFilePath, "utf8");
    const lines = fileContent.split(/\r?\n/);

    // ✅ PERBAIKAN 1: Baca dari baris ke-3 (index 2)
    const metaLine = lines.length >= 3 ? lines[2] : "";

    // ✅ PERBAIKAN 2: Sesuaikan Regex dengan format YYYY/MM/DD
    const match = metaLine.match(/From (\d{4})\/(\d{2})\/(\d{2})/);

    if (!match) {
      throw new Error(
        "Format file CSV tidak valid, tidak dapat menemukan rentang tanggal di baris ke-3."
      );
    }

    const [, tahun, bulan, day] = match;

    const holidayMap = await loadHolidays(tahun);

    const outputFile = path.join(
      process.cwd(),
      "public",
      "json",
      "absensi",
      tahun,
      `${tahun}-${bulan}.json`
    );
    const existingData = await loadAndDecompactExistingData(outputFile, tahun, bulan, holidayMap);
    const mergedData = mergeUserData(existingData, newDataFromCsv);

    const completedData = completeMonthlyData(mergedData, tahun, bulan, holidayMap);
    const processedData = calculateStatusesAndSummaries(completedData);

    const finalJson = await generateFinalJsonAndSave(
      processedData,
      tahun,
      bulan,
      holidayMap,
      outputFile
    );
    await saveDebugLogs(processedData, debugRows);

    await generateJsonIndex();

    return {
      success: true,
      message: "Upload dan parsing berhasil.",
      processed: { year: parseInt(tahun), month: parseInt(bulan) },
      data: finalJson,
    };
  } finally {
    try {
      await fs.promises.unlink(temporaryFilePath);
    } catch (e) {
      console.error(`Gagal menghapus file temporary: ${temporaryFilePath}`, e);
    }
  }
}

// ==================================================================
// == FUNGSI-FUNGSI SPESIALIS ==
// ==================================================================

function parseCsvToUserData(filepath) {
  return new Promise((resolve, reject) => {
    const data = {};
    let firstDataRow = null;
    const debugRows = [];

    fs.createReadStream(filepath)
      .pipe(
        csv({
          skipLines: 3,
          mapHeaders: ({ header }) => header.replace(/\uFEFF/g, "").trim(),
        })
      )
      .on("data", (row) => {
        const id = row["User ID"]?.trim();
        const nama = row["Full Name"]?.trim();
        const datetime = row["Date/Time"]?.trim();
        if (!id || !nama || !datetime) return;

        if (firstDataRow === null) firstDataRow = row;

        const [dateStr, timeStr] = datetime.split(" ");
        // ✅ PERBAIKAN 3: Sesuaikan dengan format YYYY/MM/DD
        const [year, month, day] = dateStr.split("/");
        const dateObj = new Date(`${year}-${month}-${day}T${timeStr}`);
        if (isNaN(dateObj.getTime())) return;

        const dayKey = dateObj.getDate();
        const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();
        const type = determineLogType(minutes, dateObj.getDay(), data[id]?.days?.[dayKey]?.l || []);
        if (!type) return;

        if (!data[id]) data[id] = { id: parseInt(id), nama, days: {} };
        if (!data[id].days[dayKey]) {
          data[id].days[dayKey] = { l: [], h: 0, s: STATUS_A };
        }
        data[id].days[dayKey].l.push({ t: timeStr, y: type });
        if (debugRows.length < 10) debugRows.push(row);
      })
      .on("end", () => resolve({ data, firstDataRow, debugRows }))
      .on("error", (error) => reject(error));
  });
}

/**
 * Menggabungkan data lama (jika ada) dengan data baru dari CSV.
 * Bertindak sebagai "Spesialis Penggabungan Data".
 */
function mergeUserData(existingData, newDataFromCsv) {
  const merged = JSON.parse(JSON.stringify(existingData)); // Deep copy
  for (const userId in newDataFromCsv) {
    if (!merged[userId]) {
      merged[userId] = newDataFromCsv[userId];
    } else {
      merged[userId].nama = newDataFromCsv[userId].nama; // Selalu update nama
      for (const dayKey in newDataFromCsv[userId].days) {
        const existingStatus = merged[userId].days?.[dayKey]?.s ?? STATUS_A;
        if (existingStatus === STATUS_A) {
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
        const isHoliday = !!holidayMap[ymd] || dayOfWeek === 0;
        userData[userId].days[d] = {
          l: [],
          h: isHoliday ? 1 : 0,
          s: isHoliday ? STATUS_L : STATUS_A,
        };
      }
    }
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
  for (const userId in userData) {
    const summary = [0, 0, 0, 0, 0]; // [H, A, L, MT, H+L]
    for (const dayKey in userData[userId].days) {
      const day = userData[userId].days[dayKey];
      const logs = day.l;

      const hasIn = logs.some((l) => l.y === "in");
      const hasOut = logs.some((l) => l.y === "out");

      if (day.h) {
        day.s = logs.length > 0 ? STATUS_H : STATUS_L;
      } else {
        if (hasIn && hasOut) day.s = STATUS_H;
        else if (logs.length > 0) day.s = STATUS_MT;
        else day.s = STATUS_A;
      }

      if (day.s !== STATUS_A) summary[day.s]++;
      if (day.h && day.s === STATUS_H) summary[4]++;
      if (day.s === STATUS_A && !day.h) summary[STATUS_A]++;
      if (day.s === STATUS_L) summary[STATUS_L]++;
    }
    userData[userId].summary = summary;
  }
  return userData;
}

/**
 * Menentukan tipe log (in, out, break-in, break-out).
 */
function determineLogType(minutes, dayOfWeek, existingLogs) {
  if (minutes >= 420 && minutes <= 600) return "in"; // 07:00 - 10:00
  if (minutes >= 690 && minutes <= 780) {
    const lastLog = existingLogs[existingLogs.length - 1];
    return lastLog && lastLog.y === "break-in" ? "break-out" : "break-in";
  }
  const isSaturday = dayOfWeek === 6;
  if ((!isSaturday && minutes >= 960) || (isSaturday && minutes >= 840)) return "out";
  return null;
}
