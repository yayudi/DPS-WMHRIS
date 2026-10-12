import { attendanceApi } from '@/modules/hr/infrastructure/attendance.api'
import {
  JAM_KERJA_MULAI,
  JAM_KERJA_SELESAI,
  JAM_KERJA_SELESAI_SABTU,
  TOLERANSI_MENIT,
  TARIF_LEMBUR_PER_JAM,
} from '@/modules/hr/domain/attendance.constants'
import { formatJamMenit } from '@/core/utils/time'

export function calculateSummaryForUser(user, year, month, globalInfo, auth) {
  let totalWork = 0,
    totalLembur = 0,
    totalBreaks = 0,
    totalDenda = 0,
    totalTelat = 0,
    totalEarly = 0
  const dendaPerHari = []
  const lemburPerHari = []
  const earlyOutPerHari = []

  const [hadir = 0, liburHari = 0, missing = 0, hadirLibur = 0] = user.r || []

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1 // getMonth() is 0-indexed
  const currentDay = today.getDate()

  const batasTanggal =
    year === currentYear && month === currentMonth ? currentDay : new Date(year, month, 0).getDate()

  // loop per hari untuk hitung durasi kerja, telat, early, lembur, denda
  const days = Array.isArray(user.logs) ? user.logs : []
  days.forEach((day) => {
    if (!day || day.isEmpty || day.status === 2 || day.status === 3) {
      return
    }

    const { jamMasuk, jamKeluar } = day

    if (!jamMasuk || !jamKeluar) {
      return
    }

    const tanggal = day.tanggal // 1..31
    const fullDateStr = day.fullDate // YYYY-MM-DD (From normalizeLogs refactor)

    if (day.status === 2) {
      return
    }
    if (day.status === 3) {
      return
    }

    if (!jamMasuk || !jamKeluar) {
      // console.log('--- GAGAL: jamMasuk/jamKeluar tidak ditemukan. ---')
      return
    }

    // Determine Weekend (Saturday/Sunday)
    let isSat = false

    if (fullDateStr) {
      const d = new Date(fullDateStr)
      isSat = d.getDay() === 6
    } else {
      // Legacy Fallback
      const d = new Date(year, month - 1, tanggal)
      isSat = d.getDay() === 6
    }

    const jamKerjaEnd = isSat ? JAM_KERJA_SELESAI_SABTU : JAM_KERJA_SELESAI

    const dailyBreaks = day.breaks.reduce((total, currentBreak) => total + currentBreak.duration, 0)
    totalBreaks += dailyBreaks
    
    const durasi = (jamKeluar - jamMasuk) - dailyBreaks

    totalWork += durasi
    // Telat
    const telat = jamMasuk - JAM_KERJA_MULAI
    if (telat > TOLERANSI_MENIT) {
      totalTelat += telat
      const dendaHariIni = attendanceApi.hitungDendaTelat(telat)
      totalDenda += dendaHariIni
      dendaPerHari.push({ tanggal, telat, denda: dendaHariIni })
    }

    // Early Out
    const early = jamKerjaEnd - jamKeluar
    if (early > TOLERANSI_MENIT) {
      totalEarly += early
      earlyOutPerHari.push({ tanggal, jamKeluar })
    }

    // Lembur
    const lembur = jamKeluar - jamKerjaEnd
    if (lembur > TOLERANSI_MENIT) {
      totalLembur += lembur
      lemburPerHari.push({ tanggal, lembur })
    }
  })

  const absenPerHari = days
    .filter((day) => !day.holiday && day.isEmpty && day.tanggal <= batasTanggal)
    .map((day) => day.tanggal) // Ambil tanggalnya saja
  const calculatedAbsenceDays = absenPerHari.length

  //  Logika Uang Lembur sekarang dicek berdasarkan 'auth'
  let uangLemburKotor = 0
  let uangLembur = 0

  // Hanya hitung jika auth diberikan DAN user adalah admin
  if (auth && auth.isAdmin) {
    uangLemburKotor = Math.floor(totalLembur / 60) * TARIF_LEMBUR_PER_JAM
    uangLembur = Math.max(uangLemburKotor - totalDenda, 0)
  }
  // Jika bukan admin, 'uangLembur' akan tetap 0 (default)

  const summary = {
    workMinutes: totalWork,
    workHours: formatJamMenit(totalWork),
    lemburHours: formatJamMenit(totalLembur),
    uangLemburKotor, // Akan 0 jika bukan admin
    dendaTelat: totalDenda,
    uangLembur, // Akan 0 jika bukan admin
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

    idealMinutes: globalInfo?.idealMinutes ?? 0,
    totalWorkDays: globalInfo?.workDays ?? 0,
    totalHolidayDays: globalInfo?.holidayDays ?? 0,
  }
  return summary
}
