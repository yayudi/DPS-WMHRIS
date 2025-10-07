import fs from "fs/promises";
import path from "path";

const LOG_IN = 0;
const LOG_OUT = 1;
const LOG_BREAK_IN = 2;
const LOG_BREAK_OUT = 3;

/**
 * Memastikan sebuah direktori ada, jika tidak, membuatnya.
 * @param {string} dirPath Path ke direktori
 */
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

/**
 * Memuat hari libur dari file JSON.
 * @param {string} tahun Tahun yang akan dimuat.
 * @returns {Promise<object>} Map tanggal libur.
 */
export async function loadHolidays(tahun) {
  const holidayFile = path.join(
    process.cwd(),
    "public",
    "json",
    "absensi",
    "holidays",
    `${tahun}.json`
  );
  const holidayMap = {};
  try {
    const data = await fs.readFile(holidayFile, "utf8");
    const dataLibur = JSON.parse(data);
    for (const row of dataLibur) {
      if (row.date && !row.name?.toLowerCase().includes("cuti bersama")) {
        holidayMap[row.date] = true;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Gagal memuat file libur untuk tahun ${tahun}:`, error.message);
    }
  }
  return holidayMap;
}

/**
 * Memindai direktori JSON dan membuat file index.
 */
export async function generateJsonIndex() {
  const baseDir = path.join(process.cwd(), "public", "json", "absensi");
  const index = {};
  try {
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
    const outputFile = path.join(process.cwd(), "public", "json", "list_index.json");
    await fs.writeFile(outputFile, JSON.stringify(index, null, 2));
  } catch (error) {
    console.error("Gagal membuat index JSON:", error);
  }
}

/**
 * Memuat dan menguraikan data dari file JSON yang sudah ada ke format kerja.
 */
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
          const dayOfWeek = new Date(ymd).getDay();
          const isHoliday = holidayMap[ymd] || dayOfWeek === 0;

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
    if (error.code !== "ENOENT") {
      console.warn(`Gagal memuat data JSON lama:`, error.message);
    }
  }
  return userLogs;
}

/**
 * Membuat struktur JSON final dan menyimpannya.
 */
export async function generateFinalJsonStructure(processedData, tahun, bulan, holidayMap) {
  // 1. Ubah ke format ringkas
  const compactLogs = Object.values(processedData).map((user) => {
    return {
      i: user.id,
      n: user.nama,
      d: Object.values(user.days),
      r: user.summary,
    };
  });

  // 2. Hitung info ideal
  const daysInMonth = getDaysInMonth(tahun, bulan);
  let totalMinutesIdeal = 0,
    hariKerja = 0,
    hariLibur = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${tahun}-${String(bulan).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOfWeek = new Date(ymd).getDay(); // 0=Minggu, 6=Sabtu

    if (dayOfWeek === 0 || holidayMap[ymd]) {
      hariLibur++;
      continue;
    }
    hariKerja++;
    totalMinutesIdeal += dayOfWeek === 6 ? 360 : 480; // Sabtu 6 jam, lainnya 8 jam
  }

  return {
    y: parseInt(tahun),
    m: parseInt(bulan),
    i: { m: totalMinutesIdeal, k: hariKerja, l: hariLibur },
    u: compactLogs,
  };
}

/**
 * Menyimpan semua file output.
 */
export async function saveJsonAndLogs(outputFile, finalJsonOutput, processedData, debugRows) {
  const jsonDir = path.dirname(outputFile);
  await ensureDir(jsonDir);
  await fs.writeFile(outputFile, JSON.stringify(finalJsonOutput));

  // Simpan file-file debug
  const logDir = path.join(process.cwd(), "logs");
  await ensureDir(logDir);
  await fs.writeFile(path.join(logDir, "rows_debug.txt"), JSON.stringify(debugRows, null, 2));
  await fs.writeFile(
    path.join(logDir, "log_parse_debug_last.txt"),
    JSON.stringify(processedData, null, 2)
  );
}

/**
 * Mendapatkan jumlah hari dalam sebulan.
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
