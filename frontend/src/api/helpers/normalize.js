/**
 * Helper untuk mengubah format waktu "HH:mm:ss" menjadi total menit dari tengah malam.
 * @param {string | null} timeStr - String waktu, e.g., "08:05:00".
 * @returns {number | null} - Total menit, e.g., 485.
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * ✅ REFACTOR BESAR:
 * Memproses data mentah dari API SQL (bukan JSON padat) menjadi format
 * yang siap digunakan oleh komponen Vue.
 *
 * @param {Array} allUsers - Array user dari tabel `users` (misal: {id, username})
 * @param {Array} logRows - Array log mentah dari `attendance_logs` JOIN `attendance_raw_logs`
 * @param {object} holidayMap - Peta hari libur (misal: {'2025-12-25': true})
 * @param {number} year - Tahun yang sedang dilihat
 * @param {number} month - Bulan yang sedang dilihat (1-12)
 * @returns {Array} - Array pengguna dengan data log yang sudah dinormalisasi.
 */
export function normalizeLogs(allUsers, logRows, holidayMap, year, month) {
  // Verifikasi input yang diterima dari attendance.js
  if (!allUsers || !Array.isArray(allUsers)) {
    console.warn("normalizeLogs: data 'allUsers' tidak lengkap atau bukan array.", allUsers)
    return []
  }
  if (!logRows || !Array.isArray(logRows)) {
    console.warn("normalizeLogs: data 'logRows' tidak lengkap atau bukan array.", logRows)
    // Ini BUKAN error, bisa jadi bulan itu kosong. Lanjut saja.
  }
  if (!holidayMap || typeof holidayMap !== 'object') {
    console.warn("normalizeLogs: data 'holidayMap' tidak lengkap atau bukan objek.", holidayMap)
    return []
  }

  const daysInMonth = new Date(year, month, 0).getDate()

  // 1. Proses data mentah SQL (logRows) ke dalam struktur Map untuk pencarian cepat
  //    Struktur: Map<user_id, Map<day_of_month, { ...data_log... }>>
  const userLogMap = new Map()
  for (const row of logRows) {
    if (!userLogMap.has(row.user_id)) {
      userLogMap.set(row.user_id, new Map())
    }
    const dayMap = userLogMap.get(row.user_id)
    const dayOfMonth = new Date(row.date).getDate() // Ambil tanggal dari data SQL

    if (!dayMap.has(dayOfMonth)) {
      // Buat objek hari berdasarkan data SQL
      dayMap.set(dayOfMonth, {
        jamMasuk: timeToMinutes(row.check_in),
        jamKeluar: timeToMinutes(row.check_out),
        breaks: [], // Akan diisi di loop 'raw'
        status: 0, // Default 0 (Hadir)
        holiday: false, // Akan dicek nanti
        isEmpty: false, // Jelas tidak kosong
        lateness: row.lateness_minutes || 0,
        overtime: row.overtime_minutes || 0,
        rawLogs: [], // Untuk menyimpan log mentah (break, dll)
      })
    }

    // Tambahkan log mentah (break-in/out) jika ada
    if (row.log_time) {
      dayMap.get(dayOfMonth).rawLogs.push({
        time: row.log_time,
        type: row.log_type,
      })
    }
  }

  // 2. Loop melalui 'allUsers' (dari tabel users) untuk membangun hasil akhir
  return allUsers.map((user) => {
    const userDays = userLogMap.get(user.id) // Ambil data log yang sudah di-grup
    const logs = [] // Ini akan menjadi array 'logs' (dulu 'user.d')

    for (let day = 1; day <= daysInMonth; day++) {
      const logData = userDays ? userDays.get(day) : undefined

      if (logData) {
        // KASUS 1: ADA LOG (User masuk di hari ini)

        // Proses 'breaks' dari 'rawLogs'
        const breaks = []
        for (let i = 0; i < logData.rawLogs.length - 1; i++) {
          const currentLog = logData.rawLogs[i]
          const nextLog = logData.rawLogs[i + 1]
          if (currentLog.type === 'break-in' && nextLog.type === 'break-out') {
            const startTime = timeToMinutes(currentLog.time)
            const endTime = timeToMinutes(nextLog.time)
            if (startTime !== null && endTime !== null && endTime > startTime) {
              breaks.push({
                start: startTime,
                end: endTime,
                duration: endTime - startTime,
              })
              i++ // Lewati log berikutnya
            }
          }
        }

        // Tentukan status akhir
        let status = 1 // 1 (Absen)
        if (logData.jamMasuk && logData.jamKeluar)
          status = 0 // 0 (Hadir)
        else if (logData.jamMasuk || logData.jamKeluar) status = 3 // 3 (Tidak Lengkap)

        logs.push({
          tanggal: day,
          jamMasuk: logData.jamMasuk,
          jamKeluar: logData.jamKeluar,
          breaks: breaks,
          status: status,
          holiday: false, // Jika ada log, kita asumsikan BUKAN hari libur (meski dia lembur)
          isEmpty: false,
          lateness: logData.lateness,
          overtime: logData.overtime,
        })
      } else {
        // KASUS 2: TIDAK ADA LOG (User tidak masuk)
        const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const dayOfWeek = new Date(year, month - 1, day).getDay()
        const isHoliday = dayOfWeek === 0 || holidayMap[ymd]

        logs.push({
          tanggal: day,
          jamMasuk: null,
          jamKeluar: null,
          breaks: [],
          status: isHoliday ? 2 : 1, // 2 (Libur) atau 1 (Absen)
          holiday: isHoliday,
          isEmpty: true,
          lateness: 0,
          overtime: 0,
        })
      }
    }

    // Kembalikan format yang diharapkan oleh 'summary.js'
    return {
      id: user.id,
      nama: user.username,
      logs: logs, // Array harian yang sudah lengkap

      // Properti dummy (jika masih dibutuhkan oleh bagian lain)
      year: null,
      month: null,
      raw: { summary: [] },
    }
  })
}
