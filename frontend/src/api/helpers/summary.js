// src/api/helpers/summary.js
import { hitungDendaTelat, isWeekend } from "@/api/helpers/attendance.js"
import {
  JAM_KERJA_MULAI,
  JAM_KERJA_SELESAI,
  JAM_KERJA_SELESAI_SABTU,
  TOLERANSI_MENIT,
  TARIF_LEMBUR_PER_JAM,
} from "@/api/config.js"
import { formatJamMenit } from "@/api/helpers/time.js"

// input: user dari JSON hasil normalizeLogs
//        globalInfo = { m, k, l } dari i di root
export function calculateSummaryForUser(user, year, month, globalInfo) {
  let totalWork=0,
      totalLembur=0,
      totalBreaks=0,
      totalDenda=0,
      totalTelat=0,
      totalEarly=0;
  const dendaPerHari = [];
  const lemburPerHari = [];
  const earlyOutPerHari = [];

  // ambil ringkasan status langsung dari user.r
  const [
    hadir=0,
    liburHari=0,
    missing=0,
    hadirLibur=0
  ] = user.r || []

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // getMonth() is 0-indexed
  const currentDay = today.getDate();

  const batasTanggal = (year === currentYear && month === currentMonth)
    ? currentDay
    : new Date(year, month, 0).getDate();

  // loop per hari untuk hitung durasi kerja, telat, early, lembur, denda
  const days = Array.isArray(user.logs) ? user.logs : []
  days.forEach((day, idx) => {
    // console.log(`--- 🟡 Iterasi Hari ke-${idx + 1} ---`);
    // console.log("1. Objek 'day' yang diterima:", day);

    if (!day || day.isEmpty || day.status === 2 || day.status === 3) {
      // console.log("--- 🔴 GAGAL: Kondisi if (!day.l) TRUE. Keluar dari iterasi. --- \n");
      return;
    }

    const { jamMasuk, jamKeluar } = day

    if (!jamMasuk || !jamKeluar) {
      return;
    }

    const tanggal = idx + 1

    if (day.s === 2) {
      // hari libur
      return
    }
    if (day.s === 3) {
      // data tidak lengkap
      return
    }

    if (!jamMasuk || !jamKeluar) {
      console.log("--- 🔴 GAGAL: jamMasuk/jamKeluar tidak ditemukan. Keluar dari iterasi. --- \n");
      return;
    }

    const jamKerjaEnd = isWeekend(year, month, tanggal)
    ? JAM_KERJA_SELESAI_SABTU
    : JAM_KERJA_SELESAI

    const totalBreaks = day.breaks.reduce((total, currentBreak) => total + currentBreak.duration, 0);
    const durasi = jamKeluar - jamMasuk

    // console.log(`>>>>>>>>>>>>📅${year}-${month}-${tanggal.toString().padStart(2,"0")}<<<<<<<<<<<<<
    //   ⏰ Masuk: ${jamMasuk} (${formatJamMenit(jamMasuk)}),
    //       Keluar: ${jamKeluar} (${formatJamMenit(jamKeluar)}),
    //   ➡️ Durasi: ${durasi} menit (${formatJamMenit(durasi)})`
    // )

    // console.log("Total Kerja : ",totalWork)
    totalWork += durasi
    // Telat
    const telat = jamMasuk - JAM_KERJA_MULAI
    if (telat > TOLERANSI_MENIT) {
      totalTelat += telat
      const dendaHariIni = hitungDendaTelat(telat)
      totalDenda += dendaHariIni
      dendaPerHari.push({ tanggal, telat, denda: dendaHariIni })
      // console.log(`⚠️ Telat ${telat} menit → Denda Rp${dendaHariIni.toLocaleString()}`)
    }

    // Early Out
    const early = jamKerjaEnd - jamKeluar;
    if (early > TOLERANSI_MENIT) {
      totalEarly += early;
      earlyOutPerHari.push({ tanggal, jamKeluar });
      // console.log(`   ⚠️ Pulang cepat ${early} menit`);
    }

    // Lembur
    const lembur = jamKeluar - jamKerjaEnd;
    if (lembur > TOLERANSI_MENIT) {
      totalLembur += lembur;
      lemburPerHari.push({ tanggal, lembur });
    }
  })

  const absenPerHari = days
    .filter(day => !day.holiday && day.isEmpty && day.tanggal <= batasTanggal)
    .map(day => day.tanggal); // Ambil tanggalnya saja
  const calculatedAbsenceDays = absenPerHari.length;

  const uangLemburKotor = Math.floor(totalLembur / 60) * TARIF_LEMBUR_PER_JAM
  const uangLembur = Math.max(uangLemburKotor - totalDenda, 0)

  const summary = {
    workMinutes: totalWork,
    workHours: formatJamMenit(totalWork),
    lemburHours: formatJamMenit(totalLembur),
    uangLemburKotor,
    dendaTelat: totalDenda,
    uangLembur,
    telatHours: formatJamMenit(totalTelat),
    earlyOutHours: formatJamMenit(totalEarly),
    breakHours: formatJamMenit(totalBreaks),
    dendaPerHari,

    // status langsung dari user.r
    hadirDays: hadir,
    // absenceDays: absen,
    absenceDays: calculatedAbsenceDays,
    absenPerHari,
    lemburPerHari,
    earlyOutPerHari,
    holidayDays: liburHari,
    missingDays: missing,
    hadirLiburDays: hadirLibur,

    // global info dari root
    idealMinutes: globalInfo?.m ?? 0,
    totalWorkDays: globalInfo?.k ?? 0,
    totalHolidayDays: globalInfo?.l ?? 0,
  }
  return summary
}
