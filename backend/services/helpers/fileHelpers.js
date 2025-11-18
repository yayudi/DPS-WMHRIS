// backend\services\fileHelpers.js
import fs from "fs/promises";
import path from "path";
import db from "../../config/db.js";

const STATUS_A = 1;
const STATUS_L = 2;
const LOG_IN = 0;
const LOG_OUT = 1;
const LOG_BREAK_IN = 2;
const LOG_BREAK_OUT = 3;

async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Jika error karena tidak ada, buat direktorinya
    if (error.code === "ENOENT") {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

export async function loadHolidays(tahun) {
  const holidayMap = {};
  try {
    const [rows] = await db.query("SELECT date, name FROM holidays WHERE YEAR(date) = ?", [tahun]);

    for (const row of rows) {
      // Ubah objek Tanggal SQL menjadi string YYYY-MM-DD
      const dateString = row.date.toISOString().split("T")[0];

      // Terapkan logika yang sama (abaikan cuti bersama)
      if (dateString && !row.name?.toLowerCase().includes("cuti bersama")) {
        holidayMap[dateString] = true;
      }
    }
  } catch (error) {
    console.warn(`Gagal memuat data libur dari SQL untuk tahun ${tahun}:`, error.message);
  }
  return holidayMap;
}

export async function generateJsonIndex() {
  const baseDir = path.join(process.cwd(), "assets", "json", "absensi");
  const index = {};
  try {
    await ensureDir(baseDir);
    const tahunFolders = await fs.readdir(baseDir, { withFileTypes: true });
    for (const tahunFolder of tahunFolders) {
      if (tahunFolder.isDirectory() && /^\d{4}$/.test(tahunFolder.name)) {
        const tahun = tahunFolder.name;
        index[tahun] = [];
        const files = await fs.readdir(path.join(baseDir, tahun));
        for (const file of files) {
          const match = file.match(/^\d{4}-(\d{2})\.json$/);
          if (match) {
            index[tahun].push(match[1]);
          }
        }
        index[tahun] = [...new Set(index[tahun])].sort();
      }
    }
    const outputFile = path.join(process.cwd(), "assets", "json", "list_index.json");
    await fs.writeFile(outputFile, JSON.stringify(index, null, 2));
  } catch (error) {
    console.error("Gagal membuat index JSON:", error);
  }
}

export async function loadAndDecompactExistingData(jsonPath, tahun, bulan, holidayMap) {
  const userLogs = {};
  try {
    const data = await fs.readFile(jsonPath, "utf8");
    const existingData = JSON.parse(data);
    if (existingData.u) {
      for (const user of existingData.u) {
        const userId = user.i;
        const daysData = {};
        user.d.forEach((day, dayIndex) => {
          const dayKey = dayIndex + 1;
          const ymd = `${tahun}-${String(bulan).padStart(2, "0")}-${String(dayKey).padStart(
            2,
            "0"
          )}`;
          const isHoliday = !!holidayMap[ymd] || new Date(ymd).getDay() === 0;
          if (typeof day === "object" && day !== null && day.l) {
            const convertedLogs = day.l.map((log) => {
              const [minutes, typeEnum] = log;
              const h = Math.floor(minutes / 60);
              const m = minutes % 60;
              const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              let typeStr = "";
              if (typeEnum === LOG_IN) typeStr = "in";
              else if (typeEnum === LOG_OUT) typeStr = "out";
              else if (typeEnum === LOG_BREAK_IN) typeStr = "break-in";
              else if (typeEnum === LOG_BREAK_OUT) typeStr = "break-out";
              return { t: timeStr, y: typeStr };
            });
            daysData[dayKey] = { l: convertedLogs, s: day.s, h: isHoliday ? 1 : 0 };
          } else {
            daysData[dayKey] = { l: [], s: day, h: isHoliday ? 1 : 0 };
          }
        });
        userLogs[userId] = { id: userId, nama: user.n, days: daysData };
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Gagal memuat data JSON lama:`, error.message);
  }
  return userLogs;
}

export async function generateFinalJsonAndSave(
  processedData,
  tahun,
  bulan,
  holidayMap,
  outputFile
) {
  const LOG_MAP = {
    in: LOG_IN,
    out: LOG_OUT,
    "break-in": LOG_BREAK_IN,
    "break-out": LOG_BREAK_OUT,
  };
  const compactLogs = Object.values(processedData).map((user) => {
    const compactedDays = Object.values(user.days).map((day) => {
      if (typeof day === "object" && day.l && day.l.length > 0) {
        const convertedLogs = day.l.map((log) => {
          const [h, m] = log.t.split(":");
          const minutes = parseInt(h) * 60 + parseInt(m);
          return [minutes, LOG_MAP[log.y]];
        });
        return { l: convertedLogs, s: day.s };
      } else {
        return typeof day === "object" ? day.s : day;
      }
    });
    return { i: user.id, n: user.nama, d: compactedDays, r: user.summary };
  });

  const daysInMonth = getDaysInMonth(tahun, bulan);
  let totalMinutesIdeal = 0,
    hariKerja = 0,
    hariLibur = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${tahun}-${String(bulan).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(ymd).getDay();
    if (dayOfWeek === 0 || holidayMap[ymd]) {
      hariLibur++;
      continue;
    }
    hariKerja++;
    totalMinutesIdeal += dayOfWeek === 6 ? 6 * 60 : 8 * 60;
  }

  const finalJsonOutput = {
    y: parseInt(tahun),
    m: parseInt(bulan),
    i: { m: totalMinutesIdeal, k: hariKerja, l: hariLibur },
    u: compactLogs,
  };

  const jsonDir = path.dirname(outputFile);
  await ensureDir(jsonDir);
  await fs.writeFile(outputFile, JSON.stringify(finalJsonOutput));

  return finalJsonOutput;
}

export async function saveDebugLogs(processedData, debugRows) {
  const logDir = path.join(process.cwd(), "logs");
  await ensureDir(logDir);
  await fs.writeFile(path.join(logDir, "rows_debug.txt"), JSON.stringify(debugRows, null, 2));
  await fs.writeFile(
    path.join(logDir, "log_parse_debug_last.txt"),
    JSON.stringify(processedData, null, 2)
  );
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
